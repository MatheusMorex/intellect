"use server";

// Carrega o motor de automação: as regras avaliam as atividades de cada mudança.
import "@/server/automation/engine";

import crypto from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireBoard, requireWorkspace } from "@/server/access";
import { requireUser, startSession, getCurrentUser } from "@/server/auth/session";
import { appUrl, logActivity, notify, sendEmail, touchBoard } from "@/server/kanban/core";
import { hashPassword } from "@/server/store/seed";
import { mutate, newId, nowIso, readStore } from "@/server/store/db";
import type { InviteRow, Store } from "@/server/store/types";

import type { ActionResult } from "./cards";

// Convites, papéis, perfil e notificações (F01, F05). Do token do convite só
// guardamos o hash: quem tem o banco não consegue montar o link.

const fail = (error: string): ActionResult<never> => ({ ok: false, error });
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";
const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const DAY = 86_400_000;

function newInvite(store: Store, data: Omit<InviteRow, "id" | "tokenHash" | "usedCount" | "revokedAt" | "createdAt">) {
  const token = crypto.randomBytes(24).toString("base64url");
  store.invites.push({ ...data, id: newId(), tokenHash: hash(token), usedCount: 0, revokedAt: null, createdAt: nowIso() });
  return appUrl(`/invite/${token}`);
}

function adminsOf(store: Store, boardId: string) {
  return store.boardMembers.filter((m) => m.boardId === boardId && m.role === "admin");
}

// ---- quadro (S09) -------------------------------------------------------------------------------

const boardInvite = z.object({
  boardId: z.uuid(),
  who: z.string().trim().min(1, "Digite o e-mail ou escolha alguém."),
  role: z.enum(["admin", "normal", "observer"]),
});

/** Convida para o quadro: quem já é do workspace entra direto; e-mail de fora recebe convite. */
export async function inviteToBoard(input: z.input<typeof boardInvite>): Promise<ActionResult<{ added: boolean; link: string | null }>> {
  const parsed = boardInvite.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const user = await requireUser();
  const { board } = requireBoard({ user }, v.boardId, "admin");
  const store0 = readStore();
  const existing = store0.users.find((u) => u.id === v.who || u.email.toLowerCase() === v.who.toLowerCase());
  if (existing && store0.workspaceMembers.some((m) => m.workspaceId === board.workspaceId && m.userId === existing.id)) {
    if (store0.boardMembers.some((m) => m.boardId === board.id && m.userId === existing.id)) return fail(`${existing.name} já participa deste quadro.`);
    mutate((store) => {
      store.boardMembers.push({ id: newId(), boardId: board.id, userId: existing.id, role: v.role });
      notify(store, { userId: existing.id, type: "added_to_board", boardId: board.id, cardId: null, actorId: user.id, data: { boardName: board.name } });
      logActivity(store, { workspaceId: board.workspaceId, boardId: board.id, cardId: null, actorId: user.id, type: "board.member_added", data: { name: existing.name } });
    });
    revalidatePath(`/b/${board.id}`);
    return ok({ added: true, link: null });
  }
  const email = z.email("Digite um e-mail válido.").safeParse(v.who);
  if (!email.success) return fail("Digite um e-mail válido ou escolha alguém do workspace.");
  const link = mutate((store) => {
    const url = newInvite(store, {
      workspaceId: board.workspaceId,
      boardId: board.id,
      email: email.data.toLowerCase(),
      role: v.role,
      expiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
      maxUses: 1,
      createdBy: user.id,
    });
    sendEmail(store, email.data, `${user.name} convidou você para o quadro ${board.name}`, `Entre no INtellect pelo link (vale 7 dias): ${url}`, url);
    touchBoard(store, board.id);
    return url;
  });
  revalidatePath(`/b/${board.id}`);
  return ok({ added: false, link });
}

/** Link de convite do quadro: role define o papel de quem entra; null desativa. */
export async function setBoardInviteLink(boardId: string, role: "normal" | "observer" | null): Promise<ActionResult<{ link: string | null }>> {
  const user = await requireUser();
  const { board } = requireBoard({ user }, boardId, "admin");
  const link = mutate((store) => {
    for (const i of store.invites) if (i.boardId === boardId && !i.email && !i.revokedAt) i.revokedAt = nowIso();
    if (!role) return null;
    return newInvite(store, {
      workspaceId: board.workspaceId,
      boardId,
      email: null,
      role,
      expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
      maxUses: null,
      createdBy: user.id,
    });
  });
  revalidatePath(`/b/${boardId}`);
  return ok({ link });
}

export async function changeBoardMemberRole(boardId: string, userId: string, role: "admin" | "normal" | "observer"): Promise<ActionResult> {
  const user = await requireUser();
  requireBoard({ user }, boardId, "admin");
  const error = mutate((store) => {
    const member = store.boardMembers.find((m) => m.boardId === boardId && m.userId === userId);
    if (!member) return "Essa pessoa não participa do quadro.";
    if (member.role === "admin" && role !== "admin" && adminsOf(store, boardId).length === 1) return "O quadro precisa de pelo menos um admin.";
    member.role = role;
    touchBoard(store, boardId);
    return null;
  });
  if (error) return fail(error);
  revalidatePath(`/b/${boardId}`);
  return ok(undefined);
}

/** Tira alguém do quadro (admin) ou sai do quadro (a própria pessoa). Nunca deixa o quadro sem admin. */
export async function removeBoardMember(boardId: string, userId: string): Promise<ActionResult> {
  const user = await requireUser();
  requireBoard({ user }, boardId, userId === user.id ? "observer" : "admin");
  const error = mutate((store) => {
    const member = store.boardMembers.find((m) => m.boardId === boardId && m.userId === userId);
    if (!member) return "Essa pessoa não participa do quadro.";
    if (member.role === "admin" && adminsOf(store, boardId).length === 1) return "O quadro precisa de pelo menos um admin. Passe o papel para outra pessoa antes.";
    store.boardMembers = store.boardMembers.filter((m) => m !== member);
    const cardIds = new Set(store.cards.filter((c) => c.boardId === boardId).map((c) => c.id));
    store.cardMembers = store.cardMembers.filter((m) => !(m.userId === userId && cardIds.has(m.cardId)));
    touchBoard(store, boardId);
    return null;
  });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const user = await requireUser();
  const invite = readStore().invites.find((i) => i.id === inviteId);
  if (!invite) return fail("Este convite não existe mais.");
  if (invite.boardId) requireBoard({ user }, invite.boardId, "admin");
  else requireWorkspace({ user }, invite.workspaceId, "admin");
  mutate((store) => {
    const i = store.invites.find((x) => x.id === inviteId)!;
    i.revokedAt = nowIso();
  });
  revalidatePath("/", "layout");
  return ok(undefined);
}

// ---- workspace (S12) -------------------------------------------------------------------------------

const workspaceInvite = z.object({
  workspaceId: z.uuid(),
  email: z.union([z.email("Digite um e-mail válido."), z.literal("")]),
  role: z.enum(["admin", "normal"]),
});

export async function inviteToWorkspace(input: z.input<typeof workspaceInvite>): Promise<ActionResult<{ link: string }>> {
  const parsed = workspaceInvite.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const user = await requireUser();
  const { workspace } = requireWorkspace({ user }, v.workspaceId, "admin");
  const email = v.email.toLowerCase();
  if (email && workspace.allowedEmailDomain && !email.endsWith(`@${workspace.allowedEmailDomain}`)) {
    return fail(`Este workspace só aceita e-mails @${workspace.allowedEmailDomain}.`);
  }
  if (email) {
    const existing = readStore().users.find((u) => u.email.toLowerCase() === email);
    if (existing && readStore().workspaceMembers.some((m) => m.workspaceId === workspace.id && m.userId === existing.id)) {
      return fail(`${existing.name} já faz parte do workspace.`);
    }
  }
  const link = mutate((store) => {
    const url = newInvite(store, {
      workspaceId: workspace.id,
      boardId: null,
      email: email || null,
      role: v.role,
      expiresAt: new Date(Date.now() + (email ? 7 : 30) * DAY).toISOString(),
      maxUses: email ? 1 : null,
      createdBy: user.id,
    });
    if (email) sendEmail(store, email, `${user.name} convidou você para o workspace ${workspace.name}`, `Entre no INtellect pelo link (vale 7 dias): ${url}`, url);
    return url;
  });
  revalidatePath(`/w/${workspace.slug}/members`);
  return ok({ link });
}

export async function changeWorkspaceRole(workspaceId: string, userId: string, role: "admin" | "normal"): Promise<ActionResult> {
  const user = await requireUser();
  const { workspace } = requireWorkspace({ user }, workspaceId, "admin");
  const error = mutate((store) => {
    const member = store.workspaceMembers.find((m) => m.workspaceId === workspaceId && m.userId === userId);
    if (!member) return "Essa pessoa não faz parte do workspace.";
    const admins = store.workspaceMembers.filter((m) => m.workspaceId === workspaceId && m.role === "admin");
    if (member.role === "admin" && role !== "admin" && admins.length === 1) return "O workspace precisa de pelo menos um admin.";
    member.role = role;
    return null;
  });
  if (error) return fail(error);
  revalidatePath(`/w/${workspace.slug}/members`);
  return ok(undefined);
}

export async function removeWorkspaceMember(workspaceId: string, userId: string): Promise<ActionResult> {
  const user = await requireUser();
  const { workspace } = requireWorkspace({ user }, workspaceId, userId === user.id ? "normal" : "admin");
  const error = mutate((store) => {
    const member = store.workspaceMembers.find((m) => m.workspaceId === workspaceId && m.userId === userId);
    if (!member) return "Essa pessoa não faz parte do workspace.";
    const admins = store.workspaceMembers.filter((m) => m.workspaceId === workspaceId && m.role === "admin");
    if (member.role === "admin" && admins.length === 1) return "O workspace precisa de pelo menos um admin.";
    const boardIds = new Set(store.boards.filter((b) => b.workspaceId === workspaceId).map((b) => b.id));
    for (const boardId of boardIds) {
      if (adminsOf(store, boardId).length === 1 && adminsOf(store, boardId)[0].userId === userId) {
        return "Essa pessoa é a única admin de um quadro. Passe o papel antes de tirar do workspace.";
      }
    }
    store.workspaceMembers = store.workspaceMembers.filter((m) => m !== member);
    store.boardMembers = store.boardMembers.filter((m) => !(m.userId === userId && boardIds.has(m.boardId)));
    return null;
  });
  if (error) return fail(error);
  revalidatePath(`/w/${workspace.slug}/members`);
  return ok(undefined);
}

const workspaceUpdate = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1, "Dê um nome ao workspace.").max(100),
  description: z.string().max(1000),
  allowedEmailDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$|^$/, "Use só o domínio, como intellect.com.br."),
});

export async function updateWorkspace(input: z.input<typeof workspaceUpdate>): Promise<ActionResult> {
  const parsed = workspaceUpdate.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const user = await requireUser();
  const { workspace } = requireWorkspace({ user }, v.workspaceId, "admin");
  mutate((store) => {
    const w = store.workspaces.find((x) => x.id === workspace.id)!;
    w.name = v.name;
    w.description = v.description;
    w.allowedEmailDomain = v.allowedEmailDomain || null;
  });
  revalidatePath("/", "layout");
  return ok(undefined);
}

// ---- aceitar convite (S02) --------------------------------------------------------------------------

export type InviteState = { error?: string; name?: string; email?: string };

const PASSWORD_RULE = "A senha precisa de 8 a 50 caracteres, com letra maiúscula, número e caractere especial.";
const strongPassword = z
  .string()
  .min(8, PASSWORD_RULE)
  .max(50, PASSWORD_RULE)
  .regex(/[A-Z]/, PASSWORD_RULE)
  .regex(/\d/, PASSWORD_RULE)
  .regex(/[^A-Za-z0-9]/, PASSWORD_RULE);

export async function acceptInvite(_prev: InviteState, form: FormData): Promise<InviteState> {
  const token = String(form.get("token") ?? "");
  const invite = readStore().invites.find((i) => i.tokenHash === hash(token));
  if (!invite || invite.revokedAt || new Date(invite.expiresAt).getTime() < Date.now() || (invite.maxUses != null && invite.usedCount >= invite.maxUses)) {
    return { error: "Este convite não vale mais. Peça um novo para quem convidou você." };
  }
  let userId = (await getCurrentUser())?.id ?? null;
  if (!userId) {
    const email = String(form.get("email") ?? invite.email ?? "").trim().toLowerCase();
    const name = String(form.get("name") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const typed = { name, email };
    if (!z.email().safeParse(email).success) return { error: "Digite um e-mail válido.", ...typed };
    if (invite.email && email !== invite.email) return { error: "Este convite é para outro e-mail.", ...typed };
    const existing = readStore().users.find((u) => u.email.toLowerCase() === email);
    if (existing) return { error: "Já existe uma conta com este e-mail. Entre com ela e abra o convite de novo.", ...typed };
    if (!name) return { error: "Digite seu nome.", ...typed };
    const pw = strongPassword.safeParse(password);
    if (!pw.success) return { error: firstIssue(pw.error), ...typed };
    userId = mutate((store) => {
      const user = {
        id: newId(),
        name,
        email,
        username: null,
        timezone: "America/Sao_Paulo",
        theme: "system" as const,
        passwordHash: hashPassword(password),
        avatarColor: ["purple", "sky", "orange", "green", "pink", "blue"][store.users.length % 6],
        bio: "",
        preferences: { colorblind: false, reduceMotion: false, singleKeyShortcuts: true, emailNotifications: "periodic" as const },
        lastActiveAt: nowIso(),
      };
      store.users.push(user);
      return user.id;
    });
  }
  const target = mutate((store) => {
    const i = store.invites.find((x) => x.id === invite.id)!;
    i.usedCount += 1;
    if (!store.workspaceMembers.some((m) => m.workspaceId === i.workspaceId && m.userId === userId)) {
      store.workspaceMembers.push({ id: newId(), workspaceId: i.workspaceId, userId: userId!, role: i.boardId ? "normal" : (i.role as "admin" | "normal") });
    }
    if (i.boardId && !store.boardMembers.some((m) => m.boardId === i.boardId && m.userId === userId)) {
      store.boardMembers.push({ id: newId(), boardId: i.boardId, userId: userId!, role: i.role });
      touchBoard(store, i.boardId);
    }
    const slug = store.workspaces.find((w) => w.id === i.workspaceId)?.slug ?? "";
    return i.boardId ? `/b/${i.boardId}` : `/w/${slug}`;
  });
  await startSession(userId!);
  redirect(target);
}

// ---- perfil (S13) e notificações (S11) --------------------------------------------------------------------

const profileInput = z.object({
  name: z.string().trim().min(1, "Digite seu nome.").max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{2,30}$|^$/, "O @ pode ter de 2 a 30 letras, números, ponto ou sublinhado."),
  bio: z.string().max(500, "A bio pode ter até 500 caracteres."),
  timezone: z.string().min(1),
  theme: z.enum(["light", "dark", "system"]),
  preferences: z.object({
    colorblind: z.boolean(),
    reduceMotion: z.boolean(),
    singleKeyShortcuts: z.boolean(),
    emailNotifications: z.enum(["never", "periodic", "instant"]),
  }),
});

export async function updateProfile(input: z.input<typeof profileInput>): Promise<ActionResult> {
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: v.timezone });
  } catch {
    return fail("Fuso horário inválido.");
  }
  const user = await requireUser();
  const error = mutate((store) => {
    if (v.username && store.users.some((u) => u.id !== user.id && u.username?.toLowerCase() === v.username)) return "Este @ já está em uso.";
    const u = store.users.find((x) => x.id === user.id)!;
    u.name = v.name;
    u.username = v.username || null;
    u.bio = v.bio;
    u.timezone = v.timezone;
    u.theme = v.theme;
    u.preferences = v.preferences;
    return null;
  });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function markNotificationsRead(ids: string[] | "all"): Promise<ActionResult> {
  const user = await requireUser();
  mutate((store) => {
    for (const n of store.notifications) {
      if (n.userId === user.id && !n.readAt && (ids === "all" || ids.includes(n.id))) n.readAt = nowIso();
    }
  });
  revalidatePath("/", "layout");
  return ok(undefined);
}
