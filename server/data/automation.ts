// Leituras da automação: S14 Diretório, S15 Construtor, S16 Histórico.

import { notFound } from "next/navigation";

import { describeAutomation, type Names } from "@/lib/automation/describe";
import type { AutomationAction, AutomationType, CardFilter } from "@/lib/automation/schema";
import { requireBoard, type Ctx } from "@/server/access";
import { listDashboardsFor } from "@/server/data/tracking";
import { listsOfBoard } from "@/server/kanban/core";
import { readStore } from "@/server/store/db";
import type { AutomationRow, Store } from "@/server/store/types";

export type AutomationOptions = {
  lists: { id: string; name: string }[];
  labels: { id: string; name: string; color: string | null }[];
  people: { id: string; name: string }[];
  dashboards: { id: string; name: string }[];
};

function boardNames(store: Store, boardId: string, dashboards: { id: string; name: string }[]): Names {
  const board = store.boards.find((b) => b.id === boardId)!;
  const people = new Set(store.boardMembers.filter((m) => m.boardId === boardId).map((m) => m.userId));
  if (board.visibility === "workspace") for (const m of store.workspaceMembers.filter((x) => x.workspaceId === board.workspaceId)) people.add(m.userId);
  return {
    // Inclui listas arquivadas: a frase mostra o nome; o motor avisa se a lista sumiu.
    lists: Object.fromEntries(store.lists.filter((l) => l.boardId === boardId).map((l) => [l.id, l.archivedAt ? `${l.name} (arquivada)` : l.name])),
    labels: Object.fromEntries(store.labels.filter((l) => l.boardId === boardId).map((l) => [l.id, l.name || `etiqueta ${l.color ?? "sem cor"}`])),
    people: Object.fromEntries(store.users.filter((u) => people.has(u.id)).map((u) => [u.id, u.name])),
    dashboards: Object.fromEntries(dashboards.map((d) => [d.id, d.name])),
  };
}

function options(store: Store, boardId: string, dashboards: { id: string; name: string }[]): AutomationOptions {
  const board = store.boards.find((b) => b.id === boardId)!;
  const people = new Set(store.boardMembers.filter((m) => m.boardId === boardId).map((m) => m.userId));
  if (board.visibility === "workspace") for (const m of store.workspaceMembers.filter((x) => x.workspaceId === board.workspaceId)) people.add(m.userId);
  return {
    lists: listsOfBoard(store, boardId).map((l) => ({ id: l.id, name: l.name })),
    labels: store.labels.filter((l) => l.boardId === boardId).map((l) => ({ id: l.id, name: l.name, color: l.color })),
    people: store.users.filter((u) => people.has(u.id)).map((u) => ({ id: u.id, name: u.name })),
    dashboards,
  };
}

const view = (a: AutomationRow) => ({
  type: a.type as AutomationType,
  trigger: a.trigger,
  filters: a.filters as unknown as CardFilter[],
  actions: a.actions as unknown as AutomationAction[],
});

export async function getAutomationDirectory(ctx: Ctx, boardId: string) {
  const { board, role } = requireBoard(ctx, boardId);
  const store = readStore();
  const dashboards = listDashboardsFor(ctx)
    .filter((d) => d.workspaceId === board.workspaceId)
    .map((d) => ({ id: d.id, name: d.name }));
  const names = boardNames(store, boardId, dashboards);
  const runsOf = (id: string) => store.automationRuns.filter((r) => r.automationId === id);
  return {
    board: { id: board.id, name: board.name, background: board.background.value, closed: !!board.closedAt },
    canEdit: role !== "observer" && !board.closedAt,
    automations: store.automations
      .filter((a) => a.boardId === boardId)
      .map((a) => {
        const runs = runsOf(a.id);
        const last = runs.at(-1);
        return {
          id: a.id,
          type: a.type,
          name: a.name,
          enabled: a.enabled,
          disabledReason: a.disabledReason,
          nextRunAt: a.nextRunAt,
          description: describeAutomation(view(a), names),
          lastRun: last ? { status: last.status, at: last.finishedAt ?? last.startedAt, message: last.message } : null,
          runs: runs.length,
          errors: runs.filter((r) => r.status === "error").length,
        };
      }),
  };
}

export type AutomationDirectory = Awaited<ReturnType<typeof getAutomationDirectory>>;

export async function getAutomationRuns(ctx: Ctx, boardId: string, filter: { automationId?: string; status?: string } = {}) {
  requireBoard(ctx, boardId);
  const store = readStore();
  const autos = new Map(store.automations.filter((a) => a.boardId === boardId).map((a) => [a.id, a]));
  return store.automationRuns
    .filter((r) => r.boardId === boardId && (!filter.automationId || r.automationId === filter.automationId) && (!filter.status || r.status === filter.status))
    .slice(-200)
    .reverse()
    .map((r) => {
      const card = r.cardId ? store.cards.find((c) => c.id === r.cardId) : null;
      return {
        id: r.id,
        at: r.finishedAt ?? r.startedAt,
        automationId: r.automationId,
        automationName: autos.get(r.automationId)?.name ?? "Automação excluída",
        automationType: autos.get(r.automationId)?.type ?? null,
        cardId: card && !card.archivedAt ? card.id : null,
        cardName: card?.name ?? null,
        status: r.status,
        message: r.message,
        depth: r.depth,
        operations: r.operations,
      };
    });
}

export async function getAutomationEditor(ctx: Ctx, boardId: string, automationId: string | null) {
  const { board, role } = requireBoard(ctx, boardId, "normal");
  if (role === "observer") notFound();
  const store = readStore();
  const dashboards = listDashboardsFor(ctx)
    .filter((d) => d.workspaceId === board.workspaceId)
    .map((d) => ({ id: d.id, name: d.name }));
  const automation = automationId ? store.automations.find((a) => a.id === automationId && a.boardId === boardId) : null;
  if (automationId && !automation) notFound();
  return {
    board: { id: board.id, name: board.name },
    options: options(store, boardId, dashboards),
    names: boardNames(store, boardId, dashboards),
    automation: automation ? { id: automation.id, name: automation.name, ...view(automation) } : null,
  };
}

export type AutomationEditor = Awaited<ReturnType<typeof getAutomationEditor>>;
