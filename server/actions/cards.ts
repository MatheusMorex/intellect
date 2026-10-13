"use server";

import { generateKeyBetween } from "fractional-indexing";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireBoard, requireDashboard } from "@/server/access";
import { requireUser } from "@/server/auth/session";
import { mutate, newId, nowIso } from "@/server/store/db";
import type { CardRow, Store } from "@/server/store/types";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const cardName = z
  .string()
  .trim()
  .min(1, "Dê um nome ao card.")
  .max(512, "O nome pode ter até 512 caracteres.");

function lastRank(store: Store, listId: string) {
  let last: string | null = null;
  for (const c of store.cards) if (c.listId === listId && !c.archivedAt && (!last || c.rank > last)) last = c.rank;
  return last;
}

function insertCard(store: Store, boardId: string, listId: string, name: string, userId: string): CardRow {
  const board = store.boards.find((b) => b.id === boardId)!;
  const now = nowIso();
  const card: CardRow = {
    id: newId(),
    boardId,
    listId,
    number: board.nextCardNumber++,
    name,
    descriptionText: "",
    rank: generateKeyBetween(lastRank(store, listId), null),
    startAt: null,
    dueAt: null,
    dueComplete: false,
    cover: null,
    createdBy: userId,
    lastActivityAt: now,
    archivedAt: null,
    createdAt: now,
  };
  store.cards.push(card);
  store.activities.push({
    id: newId(),
    workspaceId: board.workspaceId,
    boardId,
    cardId: card.id,
    actorId: userId,
    actorKind: "user",
    type: "card.created",
    data: { name, listId },
    createdAt: now,
  });
  return card;
}

const createCardInput = z.object({ boardId: z.uuid(), listId: z.uuid(), name: cardName });

export async function createCard(input: { boardId: string; listId: string; name: string }): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = createCardInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { boardId, listId, name } = parsed.data;
  requireBoard({ user }, boardId, "normal");
  const card = mutate((store) => {
    const list = store.lists.find((l) => l.id === listId && l.boardId === boardId && !l.archivedAt);
    if (!list) return null;
    return insertCard(store, boardId, listId, name, user.id);
  });
  if (!card) return { ok: false, error: "Esta lista não existe mais. Recarregue a página." };
  revalidatePath(`/b/${boardId}`);
  return { ok: true, data: { id: card.id } };
}

const fromRowInput = z.object({
  dashboardId: z.uuid(),
  campaignId: z.uuid(),
  listId: z.uuid(),
  name: cardName,
});

/** "Criar card" numa linha do relatório (F16): o card nasce ligado à campanha. */
export async function createCardFromRow(input: {
  dashboardId: string;
  campaignId: string;
  listId: string;
  name: string;
}): Promise<ActionResult<{ cardId: string; boardId: string; boardName: string }>> {
  const user = await requireUser();
  const parsed = fromRowInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { dashboardId, campaignId, listId, name } = parsed.data;
  const { dashboard } = requireDashboard({ user }, dashboardId);

  const result = mutate((store) => {
    const accountIds = new Set(
      store.dashboardAdAccounts.filter((l) => l.dashboardId === dashboard.id).map((l) => l.adAccountId),
    );
    const campaign = store.campaigns.find((c) => c.id === campaignId && accountIds.has(c.adAccountId));
    const list = store.lists.find((l) => l.id === listId && !l.archivedAt);
    if (!campaign || !list) return null;
    requireBoard({ user }, list.boardId, "normal");
    const card = insertCard(store, list.boardId, list.id, name, user.id);
    store.cardLinks.push({
      id: newId(),
      cardId: card.id,
      dashboardId: dashboard.id,
      targetType: "campaign",
      campaignId: campaign.id,
      adSetId: null,
      adId: null,
      productId: null,
      createdBy: user.id,
      createdAt: nowIso(),
    });
    const board = store.boards.find((b) => b.id === list.boardId)!;
    return { cardId: card.id, boardId: board.id, boardName: board.name };
  });
  if (!result) return { ok: false, error: "A campanha ou a lista não existe mais. Recarregue a página." };
  revalidatePath(`/b/${result.boardId}`);
  return { ok: true, data: result };
}
