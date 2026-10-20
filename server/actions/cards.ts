"use server";

// Carrega o motor de automação: as regras avaliam as atividades de cada mudança.
import "@/server/automation/engine";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireBoard, requireDashboard } from "@/server/access";
import { requireUser } from "@/server/auth/session";
import { liveAction } from "@/server/live/action";
import { insertCard, touchBoard } from "@/server/kanban/core";
import { mutate, newId, nowIso } from "@/server/store/db";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const cardName = z
  .string()
  .trim()
  .min(1, "Dê um nome ao card.")
  .max(512, "O nome pode ter até 512 caracteres.");

const createCardInput = z.object({ boardId: z.uuid(), listId: z.uuid(), name: cardName });

async function createCardImpl(input: { boardId: string; listId: string; name: string }): Promise<ActionResult<{ id: string }>> {
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
  level: z.enum(["campanhas", "conjuntos", "anuncios"]).default("campanhas"),
  targetId: z.uuid(),
  listId: z.uuid(),
  name: cardName,
});

/** "Criar card" numa linha do relatório (F16): o card nasce ligado à campanha. */
async function createCardFromRowImpl(input: {
  dashboardId: string;
  level?: "campanhas" | "conjuntos" | "anuncios";
  targetId: string;
  listId: string;
  name: string;
}): Promise<ActionResult<{ cardId: string; boardId: string; boardName: string }>> {
  const user = await requireUser();
  const parsed = fromRowInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { dashboardId, level, targetId, listId, name } = parsed.data;
  const { dashboard } = requireDashboard({ user }, dashboardId);

  const result = mutate((store) => {
    const accountIds = new Set(
      store.dashboardAdAccounts.filter((l) => l.dashboardId === dashboard.id).map((l) => l.adAccountId),
    );
    const target =
      level === "campanhas"
        ? store.campaigns.find((c) => c.id === targetId && accountIds.has(c.adAccountId))
        : level === "conjuntos"
          ? store.adSets.find((s) => s.id === targetId && accountIds.has(s.adAccountId))
          : store.ads.find((a) => a.id === targetId && accountIds.has(a.adAccountId));
    const list = store.lists.find((l) => l.id === listId && !l.archivedAt);
    if (!target || !list) return null;
    requireBoard({ user }, list.boardId, "normal");
    const card = insertCard(store, list.boardId, list.id, name, user.id);
    store.cardLinks.push({
      id: newId(),
      cardId: card.id,
      dashboardId: dashboard.id,
      targetType: level === "campanhas" ? "campaign" : level === "conjuntos" ? "ad_set" : "ad",
      campaignId: level === "campanhas" ? target.id : null,
      adSetId: level === "conjuntos" ? target.id : null,
      adId: level === "anuncios" ? target.id : null,
      productId: null,
      createdBy: user.id,
      createdAt: nowIso(),
    });
    touchBoard(store, list.boardId);
    const board = store.boards.find((b) => b.id === list.boardId)!;
    return { cardId: card.id, boardId: board.id, boardName: board.name };
  });
  if (!result) return { ok: false, error: "A campanha ou a lista não existe mais. Recarregue a página." };
  revalidatePath(`/b/${result.boardId}`);
  return { ok: true, data: result };
}

// ---- modo real (AUTH_MODE=live): cada action roda sobre o retrato do Supabase (server/live/action.ts) ----

export async function createCard(...args: Parameters<typeof createCardImpl>): ReturnType<typeof createCardImpl> {
  return liveAction(() => createCardImpl(...args));
}

export async function createCardFromRow(...args: Parameters<typeof createCardFromRowImpl>): ReturnType<typeof createCardFromRowImpl> {
  return liveAction(() => createCardFromRowImpl(...args));
}
