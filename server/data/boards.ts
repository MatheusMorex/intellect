// Leituras do kanban: início do workspace (S03), quadro (S05) e o que o menu lateral mostra.

import { boardRole, requireBoard, requireWorkspace, type BoardRole, type Ctx } from "@/server/access";
import { getCardMetrics, listDashboardsFor, type CardMetric } from "@/server/data/tracking";
import { readStore } from "@/server/store/db";

export type BoardSummary = { id: string; name: string; background: string; workspaceSlug: string };

export function listBoardsFor(ctx: Ctx): BoardSummary[] {
  const store = readStore();
  return store.boards
    .filter((b) => !b.closedAt && boardRole(ctx, b))
    .map((b) => ({
      id: b.id,
      name: b.name,
      background: b.background.value,
      workspaceSlug: store.workspaces.find((w) => w.id === b.workspaceId)?.slug ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export type ShellData = {
  workspace: { id: string; name: string; slug: string } | null;
  boards: BoardSummary[];
  dashboards: { id: string; name: string; adPlatforms: ("meta" | "google")[] }[];
};

export async function getShellData(ctx: Ctx): Promise<ShellData> {
  const store = readStore();
  const membership = store.workspaceMembers.find((m) => m.userId === ctx.user.id);
  const workspace = membership ? store.workspaces.find((w) => w.id === membership.workspaceId) : undefined;
  return {
    workspace: workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null,
    boards: listBoardsFor(ctx),
    dashboards: listDashboardsFor(ctx).map(({ id, name, adPlatforms }) => ({ id, name, adPlatforms })),
  };
}

export async function getWorkspaceHome(ctx: Ctx, slug: string) {
  const { workspace, role } = requireWorkspace(ctx, slug);
  return {
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    role,
    boards: listBoardsFor(ctx).filter((b) => b.workspaceSlug === workspace.slug),
    dashboards: listDashboardsFor(ctx).filter((d) => d.workspaceId === workspace.id),
  };
}

export type CardFront = {
  id: string;
  number: number;
  name: string;
  dueAt: string | null;
  dueComplete: boolean;
  cover: string | null;
  metric: CardMetric | null;
};

export type BoardView = {
  board: { id: string; name: string; description: string; background: string; workspaceSlug: string };
  role: BoardRole;
  canEdit: boolean;
  lists: { id: string; name: string; cards: CardFront[] }[];
  members: { id: string; name: string; avatarColor: string; role: BoardRole }[];
};

export async function getBoardView(ctx: Ctx, boardId: string): Promise<BoardView> {
  const { board, role } = requireBoard(ctx, boardId);
  const store = readStore();
  const lists = store.lists
    .filter((l) => l.boardId === board.id && !l.archivedAt)
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id.localeCompare(b.id)));
  const cards = store.cards.filter((c) => c.boardId === board.id && !c.archivedAt);
  const metrics = getCardMetrics(
    ctx,
    cards.map((c) => c.id),
  );
  return {
    board: {
      id: board.id,
      name: board.name,
      description: board.description,
      background: board.background.value,
      workspaceSlug: store.workspaces.find((w) => w.id === board.workspaceId)?.slug ?? "",
    },
    role,
    canEdit: role !== "observer",
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      cards: cards
        .filter((c) => c.listId === l.id)
        .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id.localeCompare(b.id)))
        .map((c) => ({
          id: c.id,
          number: c.number,
          name: c.name,
          dueAt: c.dueAt,
          dueComplete: c.dueComplete,
          cover: c.cover?.color ?? null,
          metric: metrics.get(c.id) ?? null,
        })),
    })),
    members: store.boardMembers
      .filter((m) => m.boardId === board.id)
      .map((m) => {
        const user = store.users.find((u) => u.id === m.userId);
        return { id: m.userId, name: user?.name ?? "Usuário removido", avatarColor: user?.avatarColor ?? "black", role: m.role };
      }),
  };
}

/** Listas onde o usuário pode criar card (para "Criar card" a partir do relatório). */
export function listWritableLists(ctx: Ctx) {
  const store = readStore();
  return store.boards
    .filter((b) => !b.closedAt)
    .flatMap((b) => {
      const role = boardRole(ctx, b);
      if (!role || role === "observer") return [];
      return store.lists
        .filter((l) => l.boardId === b.id && !l.archivedAt)
        .sort((x, y) => (x.rank < y.rank ? -1 : 1))
        .map((l) => ({ boardId: b.id, boardName: b.name, listId: l.id, listName: l.name }));
    });
}

export async function getCardPreview(ctx: Ctx, cardId: string) {
  const store = readStore();
  const card = store.cards.find((c) => c.id === cardId);
  if (!card) return null;
  const { board } = requireBoard(ctx, card.boardId);
  const list = store.lists.find((l) => l.id === card.listId);
  const metric = getCardMetrics(ctx, [card.id]).get(card.id) ?? null;
  return { card: { id: card.id, number: card.number, name: card.name, dueAt: card.dueAt, dueComplete: card.dueComplete }, board: { id: board.id, name: board.name }, listName: list?.name ?? "", metric };
}
