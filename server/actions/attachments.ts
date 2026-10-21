"use server";

// Anexos do card (S06/S07, F04): link, renomear, excluir e usar a imagem como capa.
// O envio do arquivo é pela rota POST /api/cards/<id>/attachments (arquivo grande
// não cabe numa action); as regras ficam em server/attachments.ts.

// Carrega o motor de automação: as regras avaliam as atividades de cada mudança.
import "@/server/automation/engine";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { addLinkRow, cardAccess, dropAttachments, isImageAttachment } from "@/server/attachments";
import { requireUser } from "@/server/auth/session";
import { bumpCard, logActivity } from "@/server/kanban/core";
import { liveAction } from "@/server/live/action";
import { mutate, readStore } from "@/server/store/db";

import type { ActionResult } from "./cards";

const fail = (error: string) => ({ ok: false as const, error });
const name = z.string().trim().min(1, "Dê um nome ao anexo.").max(256, "O nome pode ter até 256 caracteres.");

function refresh(cardId: string) {
  const card = readStore().cards.find((c) => c.id === cardId);
  if (card) revalidatePath(`/b/${card.boardId}`);
}

/** O anexo e o card dele, para quem pode mexer. */
async function editable(attachmentId: string) {
  const user = await requireUser();
  const row = readStore().attachments.find((a) => a.id === attachmentId);
  if (!row) return { user, error: "Este anexo não existe mais. Recarregue a página." };
  const access = cardAccess(user, row.cardId, true);
  if (!access.ok) return { user, error: access.error };
  return { user, row, card: access.card };
}

const linkInput = z.object({ cardId: z.uuid(), url: z.string().trim().min(1, "Cole o link.").max(2048, "O link pode ter até 2.048 caracteres."), name: name.nullable().optional() });

async function addLinkAttachmentImpl(input: z.input<typeof linkInput>): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = linkInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const result = addLinkRow(user, parsed.data.cardId, parsed.data.url, parsed.data.name ?? null);
  if (!result.ok) return fail(result.error);
  refresh(parsed.data.cardId);
  return { ok: true, data: { id: result.id } };
}

const renameInput = z.object({ attachmentId: z.uuid(), name });

async function renameAttachmentImpl(input: z.input<typeof renameInput>): Promise<ActionResult> {
  const parsed = renameInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const found = await editable(parsed.data.attachmentId);
  if (!found.row) return fail(found.error);
  mutate((store) => {
    const row = store.attachments.find((a) => a.id === parsed.data.attachmentId)!;
    row.name = parsed.data.name;
    bumpCard(store, store.cards.find((c) => c.id === row.cardId)!);
  });
  refresh(found.row.cardId);
  return { ok: true, data: undefined };
}

const idInput = z.object({ attachmentId: z.uuid() });

async function deleteAttachmentImpl(input: z.input<typeof idInput>): Promise<ActionResult> {
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return fail("Dados inválidos.");
  const found = await editable(parsed.data.attachmentId);
  if (!found.row) return fail(found.error);
  const { row, user } = found;
  mutate((store) => {
    dropAttachments(store, (a) => a.id === row.id);
    const card = store.cards.find((c) => c.id === row.cardId)!;
    const board = store.boards.find((b) => b.id === card.boardId)!;
    logActivity(store, { workspaceId: board.workspaceId, boardId: board.id, cardId: card.id, actorId: user.id, type: "card.attachment", data: { name: row.name, added: false } });
    bumpCard(store, card);
  });
  refresh(row.cardId);
  return { ok: true, data: undefined };
}

const coverInput = z.object({ attachmentId: z.uuid(), cover: z.boolean() });

/** Imagem anexada vira a capa do card (ou deixa de ser). */
async function setAttachmentCoverImpl(input: z.input<typeof coverInput>): Promise<ActionResult> {
  const parsed = coverInput.safeParse(input);
  if (!parsed.success) return fail("Dados inválidos.");
  const found = await editable(parsed.data.attachmentId);
  if (!found.row) return fail(found.error);
  const { row } = found;
  if (!isImageAttachment(row)) return fail("Só imagens (JPG, PNG, WebP ou GIF) podem ser capa.");
  mutate((store) => {
    const card = store.cards.find((c) => c.id === row.cardId)!;
    if (parsed.data.cover) card.cover = { attachmentId: row.id, size: card.cover?.size ?? "strip" };
    else if (card.cover?.attachmentId === row.id) card.cover = null;
    bumpCard(store, card);
  });
  refresh(row.cardId);
  return { ok: true, data: undefined };
}

// ---- modo real (AUTH_MODE=live): cada action roda sobre o retrato do Supabase (server/live/action.ts) ----

export async function addLinkAttachment(...args: Parameters<typeof addLinkAttachmentImpl>): ReturnType<typeof addLinkAttachmentImpl> {
  return liveAction(() => addLinkAttachmentImpl(...args));
}

export async function renameAttachment(...args: Parameters<typeof renameAttachmentImpl>): ReturnType<typeof renameAttachmentImpl> {
  return liveAction(() => renameAttachmentImpl(...args));
}

export async function deleteAttachment(...args: Parameters<typeof deleteAttachmentImpl>): ReturnType<typeof deleteAttachmentImpl> {
  return liveAction(() => deleteAttachmentImpl(...args));
}

export async function setAttachmentCover(...args: Parameters<typeof setAttachmentCoverImpl>): ReturnType<typeof setAttachmentCoverImpl> {
  return liveAction(() => setAttachmentCoverImpl(...args));
}
