"use server";

// Campos personalizados (S07/F04): criar, mudar e apagar os campos do quadro e
// preencher o valor de um card. As regras de tipo ficam em lib/custom-fields.ts.

// Carrega o motor de automação: as regras avaliam as atividades de cada mudança.
import "@/server/automation/engine";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireBoard } from "@/server/access";
import { requireUser } from "@/server/auth/session";
import { cleanOptions, displayFieldValue, FIELD_TYPES, MAX_FIELDS_PER_BOARD, parseFieldValue } from "@/lib/custom-fields";
import { bumpCard, logActivity, rankBetween } from "@/server/kanban/core";
import { liveAction } from "@/server/live/action";
import { mutate, newId, nowIso, readStore } from "@/server/store/db";

import type { ActionResult } from "./cards";

const fail = (error: string) => ({ ok: false as const, error });
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";

const CLOSED = "Este quadro está fechado. Reabra o quadro para mudar alguma coisa.";

const fieldInput = z.object({
  boardId: z.uuid(),
  /** Sem id: campo novo. */
  fieldId: z.uuid().optional(),
  name: z.string().trim().min(1, "Dê um nome ao campo.").max(100, "O nome pode ter até 100 caracteres."),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.object({ id: z.string().max(64).optional(), label: z.string().max(200), color: z.string().max(32).nullable().optional() })).max(200).default([]),
  showOnFront: z.boolean(),
});

/** Campo novo ou mudado (o tipo não muda depois de criado: os valores já guardados dependem dele). */
async function saveCustomFieldImpl(input: z.input<typeof fieldInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = fieldInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const user = await requireUser();
  const { board } = requireBoard({ user }, v.boardId, "normal");
  if (board.closedAt) return fail(CLOSED);
  const options = v.type === "list" ? cleanOptions(v.options, newId) : [];
  if (typeof options === "string") return fail(options);
  if (v.type === "list" && options.length === 0) return fail("Uma lista precisa de pelo menos uma opção.");

  const store = readStore();
  const fields = store.customFields.filter((f) => f.boardId === board.id);
  const existing = v.fieldId ? fields.find((f) => f.id === v.fieldId) : undefined;
  if (v.fieldId && !existing) return fail("Este campo não existe mais. Recarregue a página.");
  if (existing && existing.type !== v.type) return fail("O tipo do campo não muda depois de criado. Crie outro campo.");
  if (!existing && fields.length >= MAX_FIELDS_PER_BOARD) return fail(`Um quadro pode ter até ${MAX_FIELDS_PER_BOARD} campos.`);
  if (fields.some((f) => f.id !== v.fieldId && f.name.toLocaleLowerCase("pt-BR") === v.name.toLocaleLowerCase("pt-BR"))) {
    return fail(`Já existe um campo “${v.name}” neste quadro.`);
  }

  const id = existing?.id ?? newId();
  mutate((s) => {
    if (existing) {
      const field = s.customFields.find((f) => f.id === id)!;
      field.name = v.name;
      field.showOnFront = v.showOnFront;
      field.options = options;
      // Opção que saiu da lista: os cards que estavam nela ficam sem valor.
      if (field.type === "list") {
        const kept = new Set(options.map((o) => o.id));
        s.customFieldValues = s.customFieldValues.filter((x) => x.fieldId !== id || kept.has(String(x.value)));
      }
    } else {
      const last = fields.map((f) => f.rank).sort().at(-1) ?? null;
      s.customFields.push({ id, boardId: board.id, name: v.name, type: v.type, options, showOnFront: v.showOnFront, rank: rankBetween(last, null), createdAt: nowIso() });
    }
    const b = s.boards.find((x) => x.id === board.id)!;
    logActivity(s, { workspaceId: b.workspaceId, boardId: b.id, cardId: null, actorId: user.id, type: "board.updated", data: {} });
  });
  revalidatePath(`/b/${board.id}`);
  return { ok: true, data: { id } };
}

const deleteInput = z.object({ fieldId: z.uuid() });

/** Apaga o campo e o valor dele em todos os cards. */
async function deleteCustomFieldImpl(input: z.input<typeof deleteInput>): Promise<ActionResult> {
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return fail("Dados inválidos.");
  const user = await requireUser();
  const field = readStore().customFields.find((f) => f.id === parsed.data.fieldId);
  if (!field) return fail("Este campo não existe mais. Recarregue a página.");
  const { board } = requireBoard({ user }, field.boardId, "normal");
  if (board.closedAt) return fail(CLOSED);
  mutate((s) => {
    s.customFieldValues = s.customFieldValues.filter((x) => x.fieldId !== field.id);
    s.customFields = s.customFields.filter((f) => f.id !== field.id);
    const b = s.boards.find((x) => x.id === board.id)!;
    logActivity(s, { workspaceId: b.workspaceId, boardId: b.id, cardId: null, actorId: user.id, type: "board.updated", data: {} });
  });
  revalidatePath(`/b/${board.id}`);
  return { ok: true, data: undefined };
}

const valueInput = z.object({ cardId: z.uuid(), fieldId: z.uuid(), value: z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]) });

/** Preenche (ou limpa) o valor de um campo num card. */
async function setCardFieldImpl(input: z.input<typeof valueInput>): Promise<ActionResult> {
  const parsed = valueInput.safeParse(input);
  if (!parsed.success) return fail("Dados inválidos.");
  const v = parsed.data;
  const user = await requireUser();
  const store = readStore();
  const card = store.cards.find((c) => c.id === v.cardId);
  if (!card) return fail("Este card não existe mais.");
  const { board } = requireBoard({ user }, card.boardId, "normal");
  if (board.closedAt) return fail(CLOSED);
  const field = store.customFields.find((f) => f.id === v.fieldId && f.boardId === card.boardId);
  if (!field) return fail("Este campo não existe mais. Recarregue a página.");
  const value = parseFieldValue(field, v.value);
  if (!value.ok) return fail(value.error);

  const current = store.customFieldValues.find((x) => x.cardId === card.id && x.fieldId === field.id);
  if ((current?.value ?? null) === value.value) return { ok: true, data: undefined };
  mutate((s) => {
    const row = s.customFieldValues.find((x) => x.cardId === card.id && x.fieldId === field.id);
    // O valor muda no lugar (a mesma linha): o banco só aceita um valor por campo em cada card.
    if (value.value === null) s.customFieldValues = s.customFieldValues.filter((x) => x !== row);
    else if (row) row.value = value.value;
    else s.customFieldValues.push({ id: newId(), cardId: card.id, fieldId: field.id, value: value.value, createdAt: nowIso() });
    const c = s.cards.find((x) => x.id === card.id)!;
    const b = s.boards.find((x) => x.id === c.boardId)!;
    logActivity(s, {
      workspaceId: b.workspaceId,
      boardId: b.id,
      cardId: c.id,
      actorId: user.id,
      type: "card.field",
      // raw: o valor guardado, para a automação "quando o campo mudar" comparar.
      data: { fieldId: field.id, name: field.name, value: value.value === null ? null : displayFieldValue(field, value.value), raw: value.value },
    });
    bumpCard(s, c);
  });
  revalidatePath(`/b/${board.id}`);
  return { ok: true, data: undefined };
}

// ---- modo real (AUTH_MODE=live): cada action roda sobre o retrato do Supabase (server/live/action.ts) ----

export async function saveCustomField(...args: Parameters<typeof saveCustomFieldImpl>): ReturnType<typeof saveCustomFieldImpl> {
  return liveAction(() => saveCustomFieldImpl(...args));
}

export async function deleteCustomField(...args: Parameters<typeof deleteCustomFieldImpl>): ReturnType<typeof deleteCustomFieldImpl> {
  return liveAction(() => deleteCustomFieldImpl(...args));
}

export async function setCardField(...args: Parameters<typeof setCardFieldImpl>): ReturnType<typeof setCardFieldImpl> {
  return liveAction(() => setCardFieldImpl(...args));
}
