// Identidade no Supabase (AUTH_MODE=live): perfis, workspaces, membros e convites.
// Tudo roda no servidor com a chave secreta; quem chama confere o acesso antes
// (requireWorkspace e companhia, em server/access.ts).

import crypto from "node:crypto";

import { adminClient, dbError } from "@/server/db/admin";
import type { HomePage, UserPreferences } from "@/server/store/types";

export type LiveAppearance = {
  wallpaper: { path: string; dim: number; blur: number } | null;
  showTaglines: boolean;
  homePage: HomePage;
};

export type LiveProfile = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  bio: string;
  timezone: string;
  theme: "light" | "dark" | "system";
  avatarColor: string;
  avatarPath: string | null;
  preferences: UserPreferences;
  appearance: LiveAppearance;
  lastActiveAt: string | null;
};

export type LiveWorkspace = { id: string; name: string; slug: string; description: string; allowedEmailDomain: string | null };
export type WorkspaceRole = "admin" | "normal";

export const DEFAULT_PREFERENCES: UserPreferences = { colorblind: false, reduceMotion: false, singleKeyShortcuts: true, emailNotifications: "periodic" };
export const DEFAULT_LIVE_APPEARANCE: LiveAppearance = { wallpaper: null, showTaglines: true, homePage: "inicio" };
export const AVATAR_COLORS = ["purple", "sky", "orange", "green", "pink", "blue"];

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
export const hashInviteToken = hash;

// ---- perfis -------------------------------------------------------------------------------------

type ProfileDb = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  bio: string;
  timezone: string;
  theme: LiveProfile["theme"];
  avatar_color: string;
  avatar_path: string | null;
  preferences: Partial<UserPreferences> | null;
  appearance: Partial<LiveAppearance> | null;
  last_active_at: string | null;
};

const PROFILE_COLUMNS = "id, name, email, username, bio, timezone, theme, avatar_color, avatar_path, preferences, appearance, last_active_at";

function toProfile(row: ProfileDb): LiveProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    bio: row.bio,
    timezone: row.timezone,
    theme: row.theme,
    avatarColor: row.avatar_color,
    avatarPath: row.avatar_path,
    preferences: { ...DEFAULT_PREFERENCES, ...(row.preferences ?? {}) },
    appearance: { ...DEFAULT_LIVE_APPEARANCE, ...(row.appearance ?? {}) },
    lastActiveAt: row.last_active_at,
  };
}

export async function getLiveProfile(userId: string): Promise<LiveProfile | null> {
  const { data, error } = await adminClient().from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (error) dbError("carregar o perfil", error);
  return data ? toProfile(data as ProfileDb) : null;
}

export async function getLiveProfiles(userIds: string[]): Promise<Map<string, LiveProfile>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await adminClient().from("profiles").select(PROFILE_COLUMNS).in("id", userIds);
  if (error) dbError("carregar as pessoas", error);
  return new Map((data as ProfileDb[]).map((row) => [row.id, toProfile(row)]));
}

export async function updateLiveProfile(userId: string, patch: Record<string, unknown>) {
  const { error } = await adminClient().from("profiles").update(patch).eq("id", userId);
  return error;
}

export async function touchLastActive(userId: string) {
  await adminClient().from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", userId);
}

// ---- workspaces ---------------------------------------------------------------------------------

type WorkspaceDb = { id: string; name: string; slug: string; description: string; allowed_email_domain: string | null };
const toWorkspace = (w: WorkspaceDb): LiveWorkspace => ({
  id: w.id,
  name: w.name,
  slug: w.slug,
  description: w.description,
  allowedEmailDomain: w.allowed_email_domain,
});

/** Workspaces da pessoa, do mais antigo para o mais novo. */
export async function membershipsOf(userId: string): Promise<{ workspace: LiveWorkspace; role: WorkspaceRole }[]> {
  const { data, error } = await adminClient()
    .from("workspace_members")
    .select("role, created_at, workspaces(id, name, slug, description, allowed_email_domain)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) dbError("carregar os workspaces", error);
  return (data ?? []).flatMap((row) => {
    const workspace = row.workspaces as unknown as WorkspaceDb | null;
    return workspace ? [{ workspace: toWorkspace(workspace), role: row.role as WorkspaceRole }] : [];
  });
}

export async function workspaceAccess(userId: string, slugOrId: string): Promise<{ workspace: LiveWorkspace; role: WorkspaceRole } | null> {
  const found = (await membershipsOf(userId)).find((m) => m.workspace.slug === slugOrId || m.workspace.id === slugOrId);
  return found ?? null;
}

export type LiveMember = {
  userId: string;
  role: WorkspaceRole;
  profile: LiveProfile;
};

export async function listWorkspaceMembers(workspaceId: string): Promise<LiveMember[]> {
  const { data, error } = await adminClient().from("workspace_members").select("user_id, role, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: true });
  if (error) dbError("carregar os membros", error);
  const profiles = await getLiveProfiles((data ?? []).map((m) => m.user_id as string));
  return (data ?? []).flatMap((m) => {
    const profile = profiles.get(m.user_id as string);
    return profile ? [{ userId: m.user_id as string, role: m.role as WorkspaceRole, profile }] : [];
  });
}

export type LiveInvite = {
  id: string;
  workspaceId: string;
  boardId: string | null;
  email: string | null;
  role: "admin" | "normal" | "observer";
  expiresAt: string;
  maxUses: number | null;
  usedCount: number;
  createdBy: string | null;
  revokedAt: string | null;
};

type InviteDb = {
  id: string;
  workspace_id: string;
  board_id: string | null;
  email: string | null;
  role: LiveInvite["role"];
  expires_at: string;
  max_uses: number | null;
  used_count: number;
  created_by: string | null;
  revoked_at: string | null;
};
const INVITE_COLUMNS = "id, workspace_id, board_id, email, role, expires_at, max_uses, used_count, created_by, revoked_at";
const toInvite = (i: InviteDb): LiveInvite => ({
  id: i.id,
  workspaceId: i.workspace_id,
  boardId: i.board_id,
  email: i.email,
  role: i.role,
  expiresAt: i.expires_at,
  maxUses: i.max_uses,
  usedCount: i.used_count,
  createdBy: i.created_by,
  revokedAt: i.revoked_at,
});

export async function listWorkspaceInvites(workspaceId: string): Promise<LiveInvite[]> {
  const { data, error } = await adminClient()
    .from("invites")
    .select(INVITE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .is("board_id", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) dbError("carregar os convites", error);
  // Convite por e-mail já usado não aparece mais; link aberto continua valendo.
  return (data as InviteDb[]).map(toInvite).filter((i) => (i.email ? i.usedCount === 0 : true));
}

export async function getInviteById(id: string): Promise<LiveInvite | null> {
  const { data, error } = await adminClient().from("invites").select(INVITE_COLUMNS).eq("id", id).maybeSingle();
  if (error) dbError("carregar o convite", error);
  return data ? toInvite(data as InviteDb) : null;
}

export async function getInviteByTokenHash(tokenHash: string): Promise<LiveInvite | null> {
  const { data, error } = await adminClient().from("invites").select(INVITE_COLUMNS).eq("token_hash", tokenHash).maybeSingle();
  if (error) dbError("carregar o convite", error);
  return data ? toInvite(data as InviteDb) : null;
}

export async function createInvite(input: {
  workspaceId: string;
  email: string | null;
  role: "admin" | "normal";
  expiresAt: string;
  maxUses: number | null;
  createdBy: string;
}): Promise<string> {
  const token = crypto.randomBytes(24).toString("base64url");
  const { error } = await adminClient().from("invites").insert({
    workspace_id: input.workspaceId,
    email: input.email,
    role: input.role,
    token_hash: hash(token),
    expires_at: input.expiresAt,
    max_uses: input.maxUses,
    created_by: input.createdBy,
  });
  if (error) dbError("criar o convite", error);
  return token;
}

/** Reserva uma vaga do convite. Falha (false) se outra pessoa usou a última vaga ao mesmo tempo. */
export async function claimInviteSlot(invite: LiveInvite): Promise<boolean> {
  const { data, error } = await adminClient()
    .from("invites")
    .update({ used_count: invite.usedCount + 1 })
    .eq("id", invite.id)
    .eq("used_count", invite.usedCount)
    .select("id");
  if (error) dbError("usar o convite", error);
  return (data?.length ?? 0) > 0;
}

export async function releaseInviteSlot(inviteId: string) {
  const invite = await getInviteById(inviteId);
  if (invite && invite.usedCount > 0) await adminClient().from("invites").update({ used_count: invite.usedCount - 1 }).eq("id", inviteId).eq("used_count", invite.usedCount);
}

export async function addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole) {
  const { error } = await adminClient().from("workspace_members").upsert({ workspace_id: workspaceId, user_id: userId, role }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true });
  if (error) dbError("adicionar ao workspace", error);
}
