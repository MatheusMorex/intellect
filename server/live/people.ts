// Convites, membros, workspace e perfil no modo real (AUTH_MODE=live).
// Quem chama (server/actions/people.ts) já conferiu o login e o papel.

import { requireWorkspace, type Ctx, type WorkspaceRole } from "@/server/access";
import { signInLive } from "@/server/auth/session";
import { adminClient } from "@/server/db/admin";
import {
  addWorkspaceMember,
  AVATAR_COLORS,
  claimInviteSlot,
  createInvite,
  getInviteById,
  getInviteByTokenHash,
  hashInviteToken,
  listWorkspaceMembers,
  membershipsOf,
  releaseInviteSlot,
  updateLiveProfile,
} from "@/server/live/identity";
import { appUrl } from "@/server/kanban/core";

export type Outcome<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string): Outcome<never> => ({ ok: false, error });
const done = <T>(data: T): Outcome<T> => ({ ok: true, data });
const DAY = 86_400_000;

export async function inviteToWorkspaceLive(
  ctx: Ctx,
  v: { workspaceId: string; email: string; role: "admin" | "normal" },
): Promise<Outcome<{ link: string; slug: string }>> {
  const { workspace } = await requireWorkspace(ctx, v.workspaceId, "admin");
  const email = v.email.toLowerCase();
  if (email && workspace.allowedEmailDomain && !email.endsWith(`@${workspace.allowedEmailDomain}`)) {
    return fail(`Este workspace só aceita e-mails @${workspace.allowedEmailDomain}.`);
  }
  if (email) {
    const { data } = await adminClient().from("profiles").select("id, name").ilike("email", email).maybeSingle();
    if (data && (await membershipsOf(data.id as string)).some((m) => m.workspace.id === workspace.id)) {
      return fail(`${data.name || email} já faz parte do workspace.`);
    }
  }
  const token = await createInvite({
    workspaceId: workspace.id,
    email: email || null,
    role: v.role,
    expiresAt: new Date(Date.now() + (email ? 7 : 30) * DAY).toISOString(),
    maxUses: email ? 1 : null,
    createdBy: ctx.user.id,
  });
  return done({ link: appUrl(`/invite/${token}`), slug: workspace.slug });
}

export async function revokeInviteLive(ctx: Ctx, inviteId: string): Promise<Outcome> {
  const invite = await getInviteById(inviteId);
  if (!invite) return fail("Este convite não existe mais.");
  await requireWorkspace(ctx, invite.workspaceId, "admin");
  const { error } = await adminClient().from("invites").update({ revoked_at: new Date().toISOString() }).eq("id", inviteId);
  if (error) return fail("Não deu para cancelar o convite. Tente de novo.");
  return done(undefined);
}

export async function changeWorkspaceRoleLive(ctx: Ctx, workspaceId: string, userId: string, role: WorkspaceRole): Promise<Outcome<{ slug: string }>> {
  const { workspace } = await requireWorkspace(ctx, workspaceId, "admin");
  const members = await listWorkspaceMembers(workspace.id);
  const member = members.find((m) => m.userId === userId);
  if (!member) return fail("Essa pessoa não faz parte do workspace.");
  if (member.role === "admin" && role !== "admin" && members.filter((m) => m.role === "admin").length === 1) return fail("O workspace precisa de pelo menos um admin.");
  const { error } = await adminClient().from("workspace_members").update({ role }).eq("workspace_id", workspace.id).eq("user_id", userId);
  if (error) return fail("Não deu para mudar o papel. Tente de novo.");
  return done({ slug: workspace.slug });
}

export async function removeWorkspaceMemberLive(ctx: Ctx, workspaceId: string, userId: string): Promise<Outcome<{ slug: string }>> {
  const { workspace } = await requireWorkspace(ctx, workspaceId, userId === ctx.user.id ? "normal" : "admin");
  const members = await listWorkspaceMembers(workspace.id);
  const member = members.find((m) => m.userId === userId);
  if (!member) return fail("Essa pessoa não faz parte do workspace.");
  if (member.role === "admin" && members.filter((m) => m.role === "admin").length === 1) return fail("O workspace precisa de pelo menos um admin.");

  const db = adminClient();
  const { data: boards } = await db.from("boards").select("id").eq("workspace_id", workspace.id);
  const boardIds = (boards ?? []).map((b) => b.id as string);
  if (boardIds.length > 0) {
    const { data: admins } = await db.from("board_members").select("board_id, user_id").in("board_id", boardIds).eq("role", "admin");
    for (const boardId of boardIds) {
      const boardAdmins = (admins ?? []).filter((a) => a.board_id === boardId);
      if (boardAdmins.length === 1 && boardAdmins[0].user_id === userId) {
        return fail("Essa pessoa é a única admin de um quadro. Passe o papel antes de tirar do workspace.");
      }
    }
    await db.from("board_members").delete().eq("user_id", userId).in("board_id", boardIds);
  }
  const { error } = await db.from("workspace_members").delete().eq("workspace_id", workspace.id).eq("user_id", userId);
  if (error) return fail("Não deu para tirar a pessoa do workspace. Tente de novo.");
  return done({ slug: workspace.slug });
}

export async function updateWorkspaceLive(
  ctx: Ctx,
  v: { workspaceId: string; name: string; description: string; allowedEmailDomain: string },
): Promise<Outcome> {
  const { workspace } = await requireWorkspace(ctx, v.workspaceId, "admin");
  const { error } = await adminClient()
    .from("workspaces")
    .update({ name: v.name, description: v.description, allowed_email_domain: v.allowedEmailDomain || null })
    .eq("id", workspace.id);
  if (error) return fail("Não deu para salvar o workspace. Tente de novo.");
  return done(undefined);
}

export async function updateProfileLive(
  userId: string,
  v: { name: string; username: string; bio: string; timezone: string; theme: string; preferences: Record<string, unknown> },
): Promise<Outcome> {
  const error = await updateLiveProfile(userId, {
    name: v.name,
    username: v.username || null,
    bio: v.bio,
    timezone: v.timezone,
    theme: v.theme,
    preferences: v.preferences,
  });
  if (error) {
    if (error.code === "23505") return fail("Este @ já está em uso.");
    return fail("Não deu para salvar o perfil. Tente de novo.");
  }
  return done(undefined);
}

// ---- aceitar convite -----------------------------------------------------------------------------

type AcceptInput = { token: string; email: string; name: string; password: string; loggedUserId: string | null };

/** Valida o convite, cria a conta se a pessoa ainda não tem e a coloca no workspace. Devolve o destino. */
export async function acceptInviteLive(input: AcceptInput, validate: (typed: { name: string; email: string }) => { error?: string }): Promise<{ error?: string; name?: string; email?: string; target?: string }> {
  const invite = await getInviteByTokenHash(hashInviteToken(input.token));
  if (!invite || invite.revokedAt || new Date(invite.expiresAt).getTime() < Date.now() || (invite.maxUses != null && invite.usedCount >= invite.maxUses)) {
    return { error: "Este convite não vale mais. Peça um novo para quem convidou você." };
  }
  const db = adminClient();
  let userId = input.loggedUserId;
  const typed = { name: input.name, email: input.email.trim().toLowerCase() || invite.email || "" };

  if (!userId) {
    const email = typed.email;
    if (invite.email && email !== invite.email) return { error: "Este convite é para outro e-mail.", ...typed };
    const checked = validate({ name: input.name.trim(), email });
    if (checked.error) return { error: checked.error, ...typed };
    const { data: existing } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (existing) return { error: "Já existe uma conta com este e-mail. Entre com ela e abra o convite de novo.", ...typed };
  }

  // Reserva a vaga antes de criar a conta: dois cliques ao mesmo tempo não usam o convite duas vezes.
  if (!(await claimInviteSlot(invite))) return { error: "Este convite acabou de ser usado. Peça um novo para quem convidou você." };

  try {
    if (!userId) {
      const { data, error } = await db.auth.admin.createUser({
        email: typed.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { name: input.name.trim() },
      });
      if (error || !data.user) {
        await releaseInviteSlot(invite.id);
        const duplicate = error?.message.toLowerCase().includes("already");
        return { error: duplicate ? "Já existe uma conta com este e-mail. Entre com ela e abra o convite de novo." : "Não deu para criar a conta. Tente de novo.", ...typed };
      }
      userId = data.user.id;
      await updateLiveProfile(userId, { avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] });
    }
    await addWorkspaceMember(invite.workspaceId, userId, invite.boardId ? "normal" : (invite.role as WorkspaceRole));
    if (invite.boardId) {
      await db.from("board_members").upsert({ board_id: invite.boardId, user_id: userId, role: invite.role }, { onConflict: "board_id,user_id", ignoreDuplicates: true });
    }
  } catch (error) {
    await releaseInviteSlot(invite.id);
    throw error;
  }

  if (!input.loggedUserId && !(await signInLive(typed.email, input.password))) {
    return { error: "A conta foi criada, mas não deu para entrar. Volte ao login e entre com seu e-mail e senha.", ...typed };
  }
  const { data: workspace } = await db.from("workspaces").select("slug").eq("id", invite.workspaceId).maybeSingle();
  return { target: invite.boardId ? `/b/${invite.boardId}` : `/w/${workspace?.slug ?? ""}` };
}

