"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { automationInput, type AutomationInput, type MetricTrigger, type ScheduleTrigger } from "@/lib/automation/schema";
import { requireBoard, requireDashboard, workspaceRole } from "@/server/access";
import { requireUser, type SessionUser } from "@/server/auth/session";
import { conditionsMet, metricObjects, nextScheduleRun, runButton, runMetricAutomation } from "@/server/automation/engine";
import { mutate, newId, nowIso, readStore } from "@/server/store/db";
import type { AutomationRow, Store } from "@/server/store/types";

import type { ActionResult } from "./cards";

// Automação do quadro (S14/S15): criar, editar, ligar, copiar, excluir, botões
// e "rodar agora". Quem edita: membro do quadro (observador só vê).

const fail = (error: string): ActionResult<never> => ({ ok: false, error });
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";

function refresh(boardId: string) {
  revalidatePath(`/b/${boardId}`, "layout");
}

/** Confere se listas, etiquetas, pessoas e dashboard citados existem e são deste quadro. */
function checkRefs(store: Store, boardId: string, v: AutomationInput, user: SessionUser): string | null {
  const board = store.boards.find((b) => b.id === boardId)!;
  const listIds = new Set(store.lists.filter((l) => l.boardId === boardId && !l.archivedAt).map((l) => l.id));
  const labelIds = new Set(store.labels.filter((l) => l.boardId === boardId).map((l) => l.id));
  const canJoin = (id: string) =>
    store.boardMembers.some((m) => m.boardId === boardId && m.userId === id) ||
    (board.visibility === "workspace" && store.workspaceMembers.some((m) => m.workspaceId === board.workspaceId && m.userId === id));
  const refs: { kind: "list" | "label" | "person"; id: string | null | undefined }[] = [];
  const t = v.trigger as Record<string, unknown>;
  for (const key of ["listId", "toListId", "fromListId", "createInListId"]) refs.push({ kind: "list", id: t[key] as string | null });
  refs.push({ kind: "label", id: t.labelId as string | null }, { kind: "person", id: t.userId as string | null });
  for (const f of v.filters) {
    if (f.kind === "in_list") refs.push({ kind: "list", id: f.listId });
    if (f.kind === "has_label" || f.kind === "not_label") refs.push({ kind: "label", id: f.labelId });
    if (f.kind === "has_member") refs.push({ kind: "person", id: f.userId });
  }
  for (const a of v.actions) {
    const r = a as Record<string, unknown>;
    for (const key of ["listId", "fromListId", "toListId"]) if (key in r) refs.push({ kind: "list", id: r[key] as string });
    if ("labelId" in r) refs.push({ kind: "label", id: r.labelId as string });
    if ("userId" in r) refs.push({ kind: "person", id: r.userId as string });
  }
  for (const r of refs) {
    if (!r.id) continue;
    if (r.kind === "list" && !listIds.has(r.id)) return "Uma das listas escolhidas não existe mais neste quadro.";
    if (r.kind === "label" && !labelIds.has(r.id)) return "Uma das etiquetas escolhidas não existe mais neste quadro.";
    if (r.kind === "person" && !canJoin(r.id)) return "Uma das pessoas escolhidas não participa deste quadro.";
  }
  if (v.type === "metric") {
    const dashboard = store.dashboards.find((d) => d.id === v.trigger.dashboardId);
    if (!dashboard || dashboard.workspaceId !== board.workspaceId || !workspaceRole({ user }, dashboard.workspaceId)) {
      return "Escolha um dashboard deste workspace.";
    }
  }
  return null;
}

function scheduleFields(v: AutomationInput, timezone: string, now: Date) {
  if (v.type === "scheduled") return { nextRunAt: nextScheduleRun(v.trigger as ScheduleTrigger, timezone, now), dashboardId: null };
  if (v.type === "metric") return { nextRunAt: now.toISOString(), dashboardId: (v.trigger as MetricTrigger).dashboardId };
  return { nextRunAt: null, dashboardId: null };
}

async function onAutomation(automationId: string, minRole: "observer" | "normal" = "normal") {
  const user = await requireUser();
  const automation = readStore().automations.find((a) => a.id === automationId);
  if (!automation) return null;
  const { board, role } = requireBoard({ user }, automation.boardId, minRole);
  return { user, automation, board, role };
}

export async function createAutomation(boardId: string, input: AutomationInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const { board } = requireBoard({ user }, boardId, "normal");
  if (board.closedAt) return fail("Este quadro está fechado.");
  const parsed = automationInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const error = checkRefs(readStore(), boardId, v, user);
  if (error) return fail(error);
  const timezone = user.timezone || "America/Sao_Paulo";
  const id = mutate((store) => {
    if (store.automations.filter((a) => a.boardId === boardId).length >= 200) return null;
    const row: AutomationRow = {
      id: newId(),
      boardId,
      type: v.type,
      name: v.name,
      trigger: v.trigger as Record<string, unknown>,
      filters: v.filters as Record<string, unknown>[],
      actions: v.actions as Record<string, unknown>[],
      enabled: true,
      timezone,
      ...scheduleFields(v, timezone, new Date()),
      createdBy: user.id,
      failureCount: 0,
      disabledReason: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.automations.push(row);
    return row.id;
  });
  if (!id) return fail("Este quadro já tem 200 automações.");
  refresh(boardId);
  return ok({ id });
}

export async function updateAutomation(automationId: string, input: AutomationInput): Promise<ActionResult> {
  const ctx = await onAutomation(automationId);
  if (!ctx) return fail("Esta automação não existe mais.");
  const parsed = automationInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  if (v.type !== ctx.automation.type) return fail("O tipo da automação não muda depois de criada.");
  const error = checkRefs(readStore(), ctx.board.id, v, ctx.user);
  if (error) return fail(error);
  mutate((store) => {
    const a = store.automations.find((x) => x.id === automationId)!;
    a.name = v.name;
    a.trigger = v.trigger as Record<string, unknown>;
    a.filters = v.filters as Record<string, unknown>[];
    a.actions = v.actions as Record<string, unknown>[];
    Object.assign(a, scheduleFields(v, a.timezone, new Date()));
    a.failureCount = 0;
    a.disabledReason = null;
    a.updatedAt = nowIso();
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

export async function toggleAutomation(automationId: string, enabled: boolean): Promise<ActionResult> {
  const ctx = await onAutomation(automationId);
  if (!ctx) return fail("Esta automação não existe mais.");
  mutate((store) => {
    const a = store.automations.find((x) => x.id === automationId)!;
    a.enabled = enabled;
    a.updatedAt = nowIso();
    if (enabled) {
      a.failureCount = 0;
      a.disabledReason = null;
      if (a.type === "scheduled") a.nextRunAt = nextScheduleRun(a.trigger as unknown as ScheduleTrigger, a.timezone, new Date());
      if (a.type === "metric") a.nextRunAt = nowIso();
    }
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

export async function copyAutomation(automationId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await onAutomation(automationId);
  if (!ctx) return fail("Esta automação não existe mais.");
  const id = mutate((store) => {
    const source = store.automations.find((x) => x.id === automationId)!;
    // A cópia nasce desligada, para não rodar duas vezes a mesma coisa.
    const copy: AutomationRow = { ...structuredClone(source), id: newId(), name: `Cópia de ${source.name}`.slice(0, 200), enabled: false, failureCount: 0, disabledReason: null, createdBy: ctx.user.id, createdAt: nowIso(), updatedAt: nowIso() };
    store.automations.push(copy);
    return copy.id;
  });
  refresh(ctx.board.id);
  return ok({ id });
}

export async function deleteAutomation(automationId: string): Promise<ActionResult> {
  const ctx = await onAutomation(automationId);
  if (!ctx) return fail("Esta automação não existe mais.");
  mutate((store) => {
    store.automations = store.automations.filter((a) => a.id !== automationId);
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

/** Botão do card (com cardId) ou do quadro. */
export async function pressButton(automationId: string, cardId: string | null): Promise<ActionResult<{ status: string; message: string | null }>> {
  const ctx = await onAutomation(automationId);
  if (!ctx) return fail("Este botão não existe mais.");
  const { automation, board, user } = ctx;
  if (!automation.enabled) return fail("Este botão está desligado.");
  if (board.closedAt) return fail("Este quadro está fechado.");
  if (automation.type === "card_button" && !cardId) return fail("Abra um card para usar este botão.");
  if (automation.type !== "card_button" && automation.type !== "board_button") return fail("Isto não é um botão.");
  const run = mutate((store) => {
    const a = store.automations.find((x) => x.id === automationId)!;
    const card = cardId ? store.cards.find((c) => c.id === cardId && c.boardId === board.id) : null;
    if (cardId && !card) return null;
    return runButton(store, a, card ?? null, user.name);
  });
  if (!run) return fail("Este card não existe mais.");
  refresh(board.id);
  return ok({ status: run.status, message: run.message });
}

/** Regra de métrica: roda agora, sem esperar a próxima checagem. */
export async function runMetricNow(automationId: string): Promise<ActionResult<{ matched: number; runs: number }>> {
  const ctx = await onAutomation(automationId);
  if (!ctx) return fail("Esta automação não existe mais.");
  if (ctx.automation.type !== "metric") return fail("Só regras de métrica rodam por aqui.");
  const result = mutate((store) => runMetricAutomation(store, store.automations.find((x) => x.id === automationId)!, new Date()));
  refresh(ctx.board.id);
  return ok(result);
}

/** Prévia do construtor: quem bate as condições agora, com os números. */
export async function previewMetric(boardId: string, trigger: MetricTrigger) {
  const user = await requireUser();
  requireBoard({ user }, boardId, "observer");
  const parsed = automationInput.safeParse({ type: "metric", name: "prévia", trigger, filters: [], actions: [{ kind: "archive_card" }] });
  if (!parsed.success) return { ok: false as const, error: firstIssue(parsed.error) };
  requireDashboard({ user }, trigger.dashboardId);
  try {
    const t = parsed.data.trigger as MetricTrigger;
    const { objects, range } = metricObjects(readStore(), t, new Date());
    const rows = objects
      .map((o) => ({ ...o, matched: conditionsMet(t, o) }))
      .sort((a, b) => Number(b.matched) - Number(a.matched) || (b.values.spend ?? 0) - (a.values.spend ?? 0))
      .slice(0, 30);
    return { ok: true as const, rows, range, total: objects.length, matched: objects.filter((o) => conditionsMet(t, o)).length };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não deu para calcular." };
  }
}
