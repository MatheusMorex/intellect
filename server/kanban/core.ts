// Operações comuns do kanban, usadas pelas actions dentro de mutate().
// Toda mudança num quadro grava atividade e troca o carimbo do quadro: quem
// está com o quadro aberto recebe o aviso pelo SSE (/api/events) e recarrega.

import { generateKeyBetween } from "fractional-indexing";

import { newId, nowIso } from "@/server/store/db";
import type { ActivityRow, CardRow, NotificationRow, Store } from "@/server/store/types";

export function touchBoard(store: Store, boardId: string) {
  store.boardStamps[boardId] = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function logActivity(
  store: Store,
  entry: Pick<ActivityRow, "workspaceId" | "boardId" | "cardId" | "actorId" | "type" | "data"> & { actorKind?: ActivityRow["actorKind"] },
) {
  store.activities.push({ id: newId(), actorKind: entry.actorKind ?? "user", createdAt: nowIso(), ...entry });
  if (entry.boardId) touchBoard(store, entry.boardId);
}

const byRank = <T extends { rank: string; id: string }>(a: T, b: T) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id.localeCompare(b.id));

export function cardsOfList(store: Store, listId: string) {
  return store.cards.filter((c) => c.listId === listId && !c.archivedAt).sort(byRank);
}

export function listsOfBoard(store: Store, boardId: string) {
  return store.lists.filter((l) => l.boardId === boardId && !l.archivedAt).sort(byRank);
}

/** Posição entre dois vizinhos (chave fracionária: nunca precisa renumerar). */
export function rankBetween(before: string | null | undefined, after: string | null | undefined) {
  if (before && after && before >= after) return generateKeyBetween(before, null);
  return generateKeyBetween(before ?? null, after ?? null);
}

export function insertCard(
  store: Store,
  boardId: string,
  listId: string,
  name: string,
  userId: string,
  where: "top" | "bottom" = "bottom",
): CardRow {
  const board = store.boards.find((b) => b.id === boardId)!;
  const siblings = cardsOfList(store, listId);
  const rank = where === "top" ? rankBetween(null, siblings[0]?.rank) : rankBetween(siblings.at(-1)?.rank, null);
  const now = nowIso();
  const card: CardRow = {
    id: newId(),
    boardId,
    listId,
    number: board.nextCardNumber++,
    name,
    description: null,
    descriptionText: "",
    version: 1,
    rank,
    startAt: null,
    dueAt: null,
    dueComplete: false,
    dueReminderMinutes: null,
    dueRecurrence: null,
    cover: null,
    createdBy: userId,
    lastActivityAt: now,
    archivedAt: null,
    createdAt: now,
  };
  store.cards.push(card);
  logActivity(store, {
    workspaceId: board.workspaceId,
    boardId,
    cardId: card.id,
    actorId: userId,
    type: "card.created",
    data: { name, listName: store.lists.find((l) => l.id === listId)?.name ?? "" },
  });
  return card;
}

export function bumpCard(store: Store, card: CardRow) {
  card.lastActivityAt = nowIso();
  touchBoard(store, card.boardId);
}

export function notify(store: Store, entry: Omit<NotificationRow, "id" | "readAt" | "createdAt">) {
  if (entry.actorId && entry.actorId === entry.userId) return; // ninguém se notifica
  store.notifications.push({ id: newId(), readAt: null, createdAt: nowIso(), ...entry });
}

/** E-mail que sairia. No modo simulado fica guardado em outbox (como uma caixa de e-mail falsa). */
export function sendEmail(store: Store, to: string, subject: string, text: string, link: string | null = null) {
  store.outbox.push({ id: newId(), to, subject, text, link, createdAt: nowIso() });
}

export function appUrl(path: string) {
  return `${process.env.APP_URL ?? "http://localhost:3000"}${path}`;
}

/** Conteúdo do editor como JSON simples (rejeita o que não for dado puro). */
export function plainJson(value: unknown): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(JSON.stringify(value ?? null)) };
  } catch {
    return { ok: false };
  }
}
