// Leituras do modo real (AUTH_MODE=live) para o menu, o perfil, os membros e o
// convite. Os quadros vêm do retrato do kanban (server/live/snapshot.ts, etapa 2);
// os dashboards entram na etapa 4: até lá mostram tudo vazio (R$ 0,00 nos números).

import { requireWorkspace, type Ctx } from "@/server/access";
import { adminClient, dbError } from "@/server/db/admin";
import { storageFileUrl } from "@/server/files";
import {
  getInviteByTokenHash,
  getLiveProfile,
  getLiveProfiles,
  hashInviteToken,
  listWorkspaceInvites,
  listWorkspaceMembers,
  membershipsOf,
  type LiveAppearance,
} from "@/server/live/identity";
import type { Person, ShellData } from "@/server/data/boards";

export const avatarUrlOf = (path: string | null) => (path ? storageFileUrl(path) : null);

export function appearanceViewLive(a: LiveAppearance): ShellData["appearance"] {
  return {
    showTaglines: a.showTaglines,
    homePage: a.homePage,
    wallpaper: a.wallpaper ? { url: storageFileUrl(a.wallpaper.path), dim: a.wallpaper.dim, blur: a.wallpaper.blur } : null,
  };
}

export function personLive(profile: { id: string; name: string; username: string | null; avatarColor: string; avatarPath: string | null }): Person {
  return { id: profile.id, name: profile.name, username: profile.username, avatarColor: profile.avatarColor, avatarUrl: avatarUrlOf(profile.avatarPath) };
}

export async function homeHrefLive(userId: string): Promise<string> {
  const [profile, memberships] = await Promise.all([getLiveProfile(userId), membershipsOf(userId)]);
  const workspace = memberships[0]?.workspace;
  const page = profile?.appearance.homePage ?? "inicio";
  if (page === "meus-cards") return "/me/cards";
  if (page === "resumo" && memberships.length) {
    // O primeiro dashboard dos workspaces da pessoa, como no modo simulado.
    const { data } = await adminClient()
      .from("dashboards")
      .select("id")
      .in(
        "workspace_id",
        memberships.map((m) => m.workspace.id),
      )
      .order("created_at", { ascending: true })
      .limit(1);
    if (data?.[0]) return `/d/${data[0].id as string}`;
  }
  return workspace ? `/w/${workspace.slug}` : "/me";
}

export async function shellDataLive(userId: string): Promise<ShellData> {
  const [profile, memberships] = await Promise.all([getLiveProfile(userId), membershipsOf(userId)]);
  const workspace = memberships[0]?.workspace;
  return {
    workspace: workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null,
    boards: [],
    dashboards: [],
    unreadNotifications: 0,
    preferences: profile?.preferences ?? { colorblind: false, reduceMotion: false, singleKeyShortcuts: true, emailNotifications: "periodic" },
    avatarUrl: avatarUrlOf(profile?.avatarPath ?? null),
    appearance: appearanceViewLive(profile?.appearance ?? { wallpaper: null, showTaglines: true, homePage: "inicio" }),
  };
}

export async function profileViewLive(userId: string) {
  const profile = (await getLiveProfile(userId))!;
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    username: profile.username,
    bio: profile.bio,
    timezone: profile.timezone,
    theme: profile.theme,
    avatarColor: profile.avatarColor,
    avatarUrl: avatarUrlOf(profile.avatarPath),
    preferences: profile.preferences,
    appearance: appearanceViewLive(profile.appearance),
    activity: [] as { id: string; text: string; cardName: string | null; cardId: string | null; createdAt: string }[],
  };
}

export async function workspaceMembersLive(ctx: Ctx, slug: string) {
  const { workspace, role } = await requireWorkspace(ctx, slug);
  const [members, invites] = await Promise.all([listWorkspaceMembers(workspace.id), listWorkspaceInvites(workspace.id)]);
  return {
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, description: workspace.description, allowedEmailDomain: workspace.allowedEmailDomain },
    isAdmin: role === "admin",
    members: members.map((m) => ({
      ...personLive(m.profile),
      email: m.profile.email,
      role: m.role,
      lastActiveAt: m.profile.lastActiveAt,
      boards: 0,
      me: m.userId === ctx.user.id,
    })),
    invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, usedCount: i.usedCount, maxUses: i.maxUses })),
  };
}

/** Lê o convite pelo token do link (o banco só guarda o hash). Público: não exige login. */
export async function inviteByTokenLive(token: string, userId: string | null) {
  const invite = await getInviteByTokenHash(hashInviteToken(token));
  if (!invite) return { status: "invalid" as const };
  const { data: workspace, error } = await adminClient().from("workspaces").select("name, slug").eq("id", invite.workspaceId).maybeSingle();
  if (error) dbError("carregar o convite", error);
  const inviter = invite.createdBy ? (await getLiveProfiles([invite.createdBy])).get(invite.createdBy) : null;
  const board = invite.boardId ? (await adminClient().from("boards").select("id, name").eq("id", invite.boardId).maybeSingle()).data : null;
  const base = {
    workspaceName: workspace?.name ?? "",
    workspaceSlug: workspace?.slug ?? "",
    boardId: invite.boardId,
    boardName: (board?.name as string | undefined) ?? null,
    inviter: inviter?.name ?? "Usuário removido",
    email: invite.email,
    role: invite.role,
  };
  if (invite.revokedAt) return { status: "revoked" as const, ...base };
  if (new Date(invite.expiresAt).getTime() < Date.now()) return { status: "expired" as const, ...base };
  // Convite de quadro: "já participa" é ser do quadro; de workspace, ser do workspace.
  const member = !userId
    ? false
    : invite.boardId
      ? Boolean((await adminClient().from("board_members").select("id").eq("board_id", invite.boardId).eq("user_id", userId).maybeSingle()).data)
      : (await membershipsOf(userId)).some((m) => m.workspace.id === invite.workspaceId);
  if (member) return { status: "member" as const, ...base };
  if (invite.maxUses != null && invite.usedCount >= invite.maxUses) return { status: "used" as const, ...base };
  return { status: "valid" as const, ...base };
}
