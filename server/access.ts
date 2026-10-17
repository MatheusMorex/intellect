// Checagens de acesso (architecture.md, "Quem pode o quê"). Toda leitura e
// toda action passa por aqui antes de tocar nos dados. Sem acesso, a resposta é
// "não encontrado": quem não pode ver não fica sabendo que existe.

import { notFound } from "next/navigation";

import type { SessionUser } from "@/server/auth/session";
import { workspaceAccess, type LiveWorkspace } from "@/server/live/identity";
import { isLive } from "@/server/mode";
import { readStore } from "@/server/store/db";
import type { BoardRow, DashboardRow, WorkspaceRow } from "@/server/store/types";

export type Ctx = { user: SessionUser };

export type WorkspaceRole = "admin" | "normal";
export type BoardRole = "admin" | "normal" | "observer";

const BOARD_RANK: Record<BoardRole, number> = { observer: 0, normal: 1, admin: 2 };

export function workspaceRole(ctx: Ctx, workspaceId: string): WorkspaceRole | null {
  const member = readStore().workspaceMembers.find((m) => m.workspaceId === workspaceId && m.userId === ctx.user.id);
  return member?.role ?? null;
}

/** Workspace como as telas usam. No modo real vem do Supabase; no simulado, do arquivo. */
export type WorkspaceView = Pick<WorkspaceRow, "id" | "name" | "slug" | "description" | "allowedEmailDomain"> | LiveWorkspace;

export async function requireWorkspace(
  ctx: Ctx,
  slugOrId: string,
  minRole: WorkspaceRole = "normal",
): Promise<{ workspace: WorkspaceView; role: WorkspaceRole }> {
  if (isLive()) {
    const access = await workspaceAccess(ctx.user.id, slugOrId);
    if (!access || (minRole === "admin" && access.role !== "admin")) notFound();
    return access;
  }
  const workspace = readStore().workspaces.find((w) => w.slug === slugOrId || w.id === slugOrId);
  if (!workspace) notFound();
  const role = workspaceRole(ctx, workspace.id);
  if (!role || (minRole === "admin" && role !== "admin")) notFound();
  return { workspace, role };
}

export function requireDashboard(
  ctx: Ctx,
  dashboardId: string,
  minRole: WorkspaceRole = "normal",
): { dashboard: DashboardRow; role: WorkspaceRole } {
  const dashboard = readStore().dashboards.find((d) => d.id === dashboardId);
  if (!dashboard) notFound();
  const role = workspaceRole(ctx, dashboard.workspaceId);
  if (!role || (minRole === "admin" && role !== "admin")) notFound();
  return { dashboard, role };
}

/** Papel efetivo no quadro: o de membro; ou, em quadro do workspace, o de quem é do workspace
 *  ("normal", ou "observer" se o quadro desligou "O workspace edita"). */
export function boardRole(ctx: Ctx, board: BoardRow): BoardRole | null {
  const store = readStore();
  const member = store.boardMembers.find((m) => m.boardId === board.id && m.userId === ctx.user.id);
  if (member) return member.role;
  if (board.visibility === "workspace" && workspaceRole(ctx, board.workspaceId)) return board.prefs.workspaceCanEdit ? "normal" : "observer";
  return null;
}

export function requireBoard(
  ctx: Ctx,
  boardId: string,
  minRole: BoardRole = "observer",
): { board: BoardRow; role: BoardRole } {
  const board = readStore().boards.find((b) => b.id === boardId);
  if (!board) notFound();
  const role = boardRole(ctx, board);
  if (!role || BOARD_RANK[role] < BOARD_RANK[minRole]) notFound();
  return { board, role };
}
