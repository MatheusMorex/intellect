// Leituras dos quadros para os Painéis: o funil do kanban e o Gantt. Só entram
// os quadros que a pessoa pode ver (server/access.ts, boardRole): a lista dos
// quadros visíveis é feita uma vez, na leitura da tela (server/data/panels.ts),
// e chega aqui pronta. Com o banco (etapa 2 da troca para o Supabase), estas
// leituras viram consultas com as regras de acesso (RLS) do próprio banco.

import { dayKeyIn, inRange, type DateRange } from "@/server/period";
import type { BoardRow, CardRow, LabelRow, ListRow, Store, UserRow } from "@/server/store/types";

/** Ordem das listas e dos cards: a chave de posição (fractional indexing) compara byte a byte. */
const byRank = (a: { rank: string }, b: { rank: string }) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

/** Quadros abertos do workspace que a pessoa pode ver, na ordem em que foram criados. */
export function visibleBoards(store: Store, workspaceId: string, canSee: (board: BoardRow) => boolean): BoardRow[] {
  return store.boards
    .filter((b) => b.workspaceId === workspaceId && !b.closedAt && canSee(b))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, "pt-BR"));
}

/** Listas abertas do quadro, na ordem do quadro. */
export function boardLists(store: Store, boardId: string): ListRow[] {
  return store.lists.filter((l) => l.boardId === boardId && !l.archivedAt).sort(byRank);
}

// ---- funil do kanban ---------------------------------------------------------------------------

/**
 * Dos cards do quadro criados no período (no fuso do dashboard), quantos
 * chegaram pelo menos até cada etapa. Um card "chegou" a uma etapa se está
 * nela ou numa mais adiante, ou se já passou por ela (foi criado ou movido para
 * ela, pelo histórico). Assim o funil nunca cresce de uma etapa para a outra, e
 * o card que voltou para trás continua contando onde já esteve. Cards
 * arquivados também contam: o lead perdido passou pelas etapas.
 */
export function kanbanFunnelCounts(store: Store, boardId: string, stageListIds: string[], range: DateRange, timezone: string): number[] {
  const index = new Map(stageListIds.map((id, i) => [id, i]));
  const reached = new Map<string, number>();
  const reach = (cardId: string, listId: unknown) => {
    const i = typeof listId === "string" ? index.get(listId) : undefined;
    if (i !== undefined) reached.set(cardId, Math.max(reached.get(cardId) ?? -1, i));
  };
  const cards = store.cards.filter((c) => c.boardId === boardId && inRange(dayKeyIn(c.createdAt, timezone), range));
  const ids = new Set(cards.map((c) => c.id));
  for (const c of cards) reach(c.id, c.listId);
  for (const a of store.activities) {
    if (!a.cardId || !ids.has(a.cardId)) continue;
    if (a.type === "card.created") reach(a.cardId, a.data.listId);
    else if (a.type === "card.moved") {
      // Movido de uma lista para outra: esteve nas duas.
      reach(a.cardId, a.data.fromListId);
      reach(a.cardId, a.data.toListId);
    }
  }
  const levels = [...reached.values()];
  return stageListIds.map((_, k) => levels.filter((level) => level >= k).length);
}

// ---- Gantt -------------------------------------------------------------------------------------

export type GanttCard = {
  card: CardRow;
  board: BoardRow;
  list: ListRow;
  /** Responsáveis em ordem alfabética. */
  members: UserRow[];
  /** Etiquetas na ordem em que o quadro as criou. */
  labels: LabelRow[];
  checklist: { done: number; total: number } | null;
};

/** Cards com data de entrega dos quadros escolhidos (sem os arquivados e os de listas arquivadas). */
export function ganttCards(store: Store, boards: BoardRow[]): GanttCard[] {
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const lists = new Map(store.lists.filter((l) => boardById.has(l.boardId) && !l.archivedAt).map((l) => [l.id, l]));
  const cards = store.cards.filter((c) => boardById.has(c.boardId) && !c.archivedAt && c.dueAt && lists.has(c.listId));
  const ids = new Set(cards.map((c) => c.id));

  const users = new Map(store.users.map((u) => [u.id, u]));
  const members = new Map<string, UserRow[]>();
  for (const m of store.cardMembers) {
    const user = users.get(m.userId);
    if (ids.has(m.cardId) && user) members.set(m.cardId, [...(members.get(m.cardId) ?? []), user]);
  }
  const labelOrder = new Map(store.labels.map((l, i) => [l.id, i]));
  const labelById = new Map(store.labels.map((l) => [l.id, l]));
  const labels = new Map<string, LabelRow[]>();
  for (const cl of store.cardLabels) {
    const label = labelById.get(cl.labelId);
    if (ids.has(cl.cardId) && label) labels.set(cl.cardId, [...(labels.get(cl.cardId) ?? []), label]);
  }
  const checklistCard = new Map(store.checklists.filter((c) => ids.has(c.cardId)).map((c) => [c.id, c.cardId]));
  const items = new Map<string, { done: number; total: number }>();
  for (const item of store.checklistItems) {
    const cardId = checklistCard.get(item.checklistId);
    if (!cardId) continue;
    const sum = items.get(cardId) ?? { done: 0, total: 0 };
    sum.total += 1;
    if (item.completedAt) sum.done += 1;
    items.set(cardId, sum);
  }

  return cards.map((card) => ({
    card,
    board: boardById.get(card.boardId)!,
    list: lists.get(card.listId)!,
    members: (members.get(card.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    labels: (labels.get(card.id) ?? []).sort((a, b) => labelOrder.get(a.id)! - labelOrder.get(b.id)!),
    checklist: items.get(card.id) ?? null,
  }));
}
