"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireBoard, requireDashboard, requireWorkspace, type BoardRole } from "@/server/access";
import { requireUser, type SessionUser } from "@/server/auth/session";
import { bumpCard, cardsOfList, insertCard, listsOfBoard, logActivity, notify, rankBetween, touchBoard } from "@/server/kanban/core";
import { mutate, newId, nowIso, readStore } from "@/server/store/db";
import type { BoardRow, CardRow, Store } from "@/server/store/types";

import type { ActionResult } from "./cards";

// Actions do kanban (F02 a F04, F16). Cada uma confere o papel no quadro antes
// de mexer; quadro fechado é só leitura.

const LABEL_COLOR = /^(green|yellow|orange|red|purple|blue|sky|lime|pink|black)(_light|_dark)?$/;
const name = (what: string, max = 512) => z.string().trim().min(1, `Dê um nome ${what}.`).max(max, `O nome pode ter até ${max} caracteres.`);
const fail = (error: string): ActionResult<never> => ({ ok: false, error });
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";

async function onBoard(boardId: string, min: BoardRole = "normal") {
  const user = await requireUser();
  const { board, role } = requireBoard({ user }, boardId, min);
  return { user, board, role };
}

async function onCard(cardId: string, min: BoardRole = "normal") {
  const user = await requireUser();
  const card = readStore().cards.find((c) => c.id === cardId);
  if (!card) return null;
  const { board, role } = requireBoard({ user }, card.boardId, min);
  return { user, card, board, role };
}

function closed(board: BoardRow) {
  return board.closedAt ? fail("Este quadro está fechado. Reabra o quadro para mudar alguma coisa.") : null;
}

function refresh(boardId: string) {
  revalidatePath(`/b/${boardId}`);
}

function activity(store: Store, user: SessionUser, card: CardRow, type: string, data: Record<string, unknown>) {
  const board = store.boards.find((b) => b.id === card.boardId)!;
  logActivity(store, { workspaceId: board.workspaceId, boardId: card.boardId, cardId: card.id, actorId: user.id, type, data });
  card.lastActivityAt = nowIso();
}

// ---- quadros (F02) ---------------------------------------------------------------------------

const boardInput = z.object({
  workspaceId: z.uuid(),
  name: name("ao quadro"),
  background: z.string().regex(LABEL_COLOR),
  visibility: z.enum(["private", "workspace"]),
});

export async function createBoard(input: z.input<typeof boardInput>): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = boardInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { workspaceId, ...v } = parsed.data;
  requireWorkspace({ user }, workspaceId);
  const id = mutate((store) => {
    const board: BoardRow = {
      id: newId(),
      workspaceId,
      name: v.name,
      description: "",
      background: { type: "color", value: v.background },
      visibility: v.visibility,
      prefs: { comments: "members", workspaceCanEdit: true, showCompleteOnFront: true, cardCovers: true, labelsExpanded: false },
      nextCardNumber: 1,
      closedAt: null,
      createdBy: user.id,
      createdAt: nowIso(),
    };
    store.boards.push(board);
    store.boardMembers.push({ id: newId(), boardId: board.id, userId: user.id, role: "admin" });
    // Etiquetas iniciais sem nome, uma de cada cor principal (dá para renomear depois).
    for (const color of ["green", "yellow", "orange", "red", "purple", "blue"]) {
      store.labels.push({ id: newId(), boardId: board.id, name: "", color, createdAt: nowIso() });
    }
    logActivity(store, { workspaceId, boardId: board.id, cardId: null, actorId: user.id, type: "board.created", data: { name: board.name } });
    return board.id;
  });
  revalidatePath("/", "layout");
  return ok({ id });
}

const boardUpdate = z.object({
  boardId: z.uuid(),
  name: name("ao quadro").optional(),
  description: z.string().max(16384).optional(),
  background: z.string().regex(LABEL_COLOR).optional(),
  visibility: z.enum(["private", "workspace"]).optional(),
  prefs: z
    .object({
      comments: z.enum(["members", "observers"]).optional(),
      workspaceCanEdit: z.boolean().optional(),
      showCompleteOnFront: z.boolean().optional(),
      cardCovers: z.boolean().optional(),
      labelsExpanded: z.boolean().optional(),
    })
    .optional(),
});

export async function updateBoard(input: z.input<typeof boardUpdate>): Promise<ActionResult> {
  const parsed = boardUpdate.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  // Visibilidade e preferências: só admin do quadro. Nome, descrição e fundo: quem edita.
  const adminOnly = v.visibility !== undefined || (v.prefs !== undefined && Object.keys(v.prefs).some((k) => k !== "labelsExpanded"));
  const { user, board } = await onBoard(v.boardId, adminOnly ? "admin" : "normal");
  if (v.name || v.description !== undefined) {
    const blocked = closed(board);
    if (blocked) return blocked;
  }
  mutate((store) => {
    const b = store.boards.find((x) => x.id === board.id)!;
    if (v.name) b.name = v.name;
    if (v.description !== undefined) b.description = v.description;
    if (v.background) b.background = { type: "color", value: v.background };
    if (v.visibility) b.visibility = v.visibility;
    if (v.prefs) b.prefs = { ...b.prefs, ...v.prefs };
    logActivity(store, { workspaceId: b.workspaceId, boardId: b.id, cardId: null, actorId: user.id, type: "board.updated", data: {} });
  });
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function setBoardClosed(boardId: string, isClosed: boolean): Promise<ActionResult> {
  const { user, board } = await onBoard(boardId, "admin");
  mutate((store) => {
    const b = store.boards.find((x) => x.id === board.id)!;
    b.closedAt = isClosed ? nowIso() : null;
    logActivity(store, { workspaceId: b.workspaceId, boardId: b.id, cardId: null, actorId: user.id, type: isClosed ? "board.closed" : "board.reopened", data: {} });
  });
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function deleteBoard(boardId: string): Promise<ActionResult> {
  const { board } = await onBoard(boardId, "admin");
  if (!board.closedAt) return fail("Feche o quadro antes de excluir.");
  mutate((store) => {
    const cardIds = new Set(store.cards.filter((c) => c.boardId === boardId).map((c) => c.id));
    const checklistIds = new Set(store.checklists.filter((c) => cardIds.has(c.cardId)).map((c) => c.id));
    store.checklistItems = store.checklistItems.filter((i) => !checklistIds.has(i.checklistId));
    store.checklists = store.checklists.filter((c) => !cardIds.has(c.cardId));
    store.comments = store.comments.filter((c) => !cardIds.has(c.cardId));
    store.cardLabels = store.cardLabels.filter((l) => !cardIds.has(l.cardId));
    store.cardMembers = store.cardMembers.filter((m) => !cardIds.has(m.cardId));
    store.cardLinks = store.cardLinks.filter((l) => !cardIds.has(l.cardId));
    store.cards = store.cards.filter((c) => c.boardId !== boardId);
    store.lists = store.lists.filter((l) => l.boardId !== boardId);
    store.labels = store.labels.filter((l) => l.boardId !== boardId);
    store.boardMembers = store.boardMembers.filter((m) => m.boardId !== boardId);
    store.boardStars = store.boardStars.filter((s) => s.boardId !== boardId);
    store.boardVisits = store.boardVisits.filter((v) => v.boardId !== boardId);
    store.invites = store.invites.filter((i) => i.boardId !== boardId);
    store.notifications = store.notifications.filter((n) => n.boardId !== boardId);
    store.activities = store.activities.filter((a) => a.boardId !== boardId);
    store.boards = store.boards.filter((b) => b.id !== boardId);
  });
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function starBoard(boardId: string, on: boolean): Promise<ActionResult> {
  const { user } = await onBoard(boardId, "observer");
  mutate((store) => {
    const existing = store.boardStars.find((s) => s.boardId === boardId && s.userId === user.id);
    if (on && !existing) store.boardStars.push({ id: newId(), userId: user.id, boardId, createdAt: nowIso() });
    if (!on) store.boardStars = store.boardStars.filter((s) => !(s.boardId === boardId && s.userId === user.id));
  });
  revalidatePath("/", "layout");
  return ok(undefined);
}

// ---- listas ------------------------------------------------------------------------------------

export async function createList(boardId: string, listName: string): Promise<ActionResult<{ id: string }>> {
  const parsed = name("à lista").safeParse(listName);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { user, board } = await onBoard(boardId);
  const blocked = closed(board);
  if (blocked) return blocked;
  const id = mutate((store) => {
    const lists = listsOfBoard(store, boardId);
    const list = { id: newId(), boardId, name: parsed.data, rank: rankBetween(lists.at(-1)?.rank, null), color: null, archivedAt: null };
    store.lists.push(list);
    logActivity(store, { workspaceId: board.workspaceId, boardId, cardId: null, actorId: user.id, type: "list.created", data: { name: list.name } });
    return list.id;
  });
  refresh(boardId);
  return ok({ id });
}

async function onList(listId: string, min: BoardRole = "normal") {
  const list = readStore().lists.find((l) => l.id === listId);
  if (!list) return null;
  const ctx = await onBoard(list.boardId, min);
  return { ...ctx, list };
}

export async function renameList(listId: string, listName: string): Promise<ActionResult> {
  const parsed = name("à lista").safeParse(listName);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await onList(listId);
  if (!ctx) return fail("Esta lista não existe mais.");
  const blocked = closed(ctx.board);
  if (blocked) return blocked;
  mutate((store) => {
    const l = store.lists.find((x) => x.id === listId)!;
    l.name = parsed.data;
    touchBoard(store, l.boardId);
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

export async function setListArchived(listId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await onList(listId);
  if (!ctx) return fail("Esta lista não existe mais.");
  mutate((store) => {
    const l = store.lists.find((x) => x.id === listId)!;
    l.archivedAt = archived ? nowIso() : null;
    if (!archived) l.rank = rankBetween(listsOfBoard(store, l.boardId).at(-1)?.rank, null);
    logActivity(store, {
      workspaceId: ctx.board.workspaceId,
      boardId: l.boardId,
      cardId: null,
      actorId: ctx.user.id,
      type: archived ? "list.archived" : "list.restored",
      data: { name: l.name },
    });
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

export async function setListColor(listId: string, color: string | null): Promise<ActionResult> {
  if (color && !LABEL_COLOR.test(color)) return fail("Cor inválida.");
  const ctx = await onList(listId);
  if (!ctx) return fail("Esta lista não existe mais.");
  mutate((store) => {
    const l = store.lists.find((x) => x.id === listId)!;
    l.color = color;
    touchBoard(store, l.boardId);
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

/** Reordena listas: beforeId é a lista que fica antes, afterId a que fica depois. */
export async function moveList(listId: string, beforeId: string | null, afterId: string | null): Promise<ActionResult<{ rank: string }>> {
  const ctx = await onList(listId);
  if (!ctx) return fail("Esta lista não existe mais.");
  const blocked = closed(ctx.board);
  if (blocked) return blocked;
  const rank = mutate((store) => {
    const l = store.lists.find((x) => x.id === listId)!;
    const before = beforeId ? store.lists.find((x) => x.id === beforeId && x.boardId === l.boardId) : null;
    const after = afterId ? store.lists.find((x) => x.id === afterId && x.boardId === l.boardId) : null;
    l.rank = rankBetween(before?.rank, after?.rank);
    touchBoard(store, l.boardId);
    return l.rank;
  });
  refresh(ctx.board.id);
  return ok({ rank });
}

export async function archiveAllCards(listId: string): Promise<ActionResult<{ count: number }>> {
  const ctx = await onList(listId);
  if (!ctx) return fail("Esta lista não existe mais.");
  const count = mutate((store) => {
    const cards = cardsOfList(store, listId);
    for (const c of cards) {
      c.archivedAt = nowIso();
      activity(store, ctx.user, c, "card.archived", {});
    }
    return cards.length;
  });
  refresh(ctx.board.id);
  return ok({ count });
}

export async function moveAllCards(listId: string, toListId: string): Promise<ActionResult<{ count: number }>> {
  const ctx = await onList(listId);
  if (!ctx) return fail("Esta lista não existe mais.");
  const count = mutate((store) => {
    const target = store.lists.find((l) => l.id === toListId && l.boardId === ctx.board.id && !l.archivedAt);
    if (!target) return -1;
    const cards = cardsOfList(store, listId);
    let last = cardsOfList(store, toListId).at(-1)?.rank ?? null;
    for (const c of cards) {
      c.listId = toListId;
      c.rank = rankBetween(last, null);
      last = c.rank;
      activity(store, ctx.user, c, "card.moved", { from: ctx.list.name, to: target.name });
    }
    return cards.length;
  });
  if (count < 0) return fail("Escolha uma lista deste quadro.");
  refresh(ctx.board.id);
  return ok({ count });
}

// ---- cards: mover, editar, arquivar, copiar (F03, F04) ---------------------------------------------

const moveInput = z.object({
  cardId: z.uuid(),
  toListId: z.uuid(),
  beforeId: z.uuid().nullable().optional(),
  afterId: z.uuid().nullable().optional(),
  position: z.enum(["top", "bottom"]).optional(),
});

export async function moveCard(input: z.input<typeof moveInput>): Promise<ActionResult<{ rank: string; boardId: string }>> {
  const parsed = moveInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const ctx = await onCard(v.cardId);
  if (!ctx) return fail("Este card não existe mais.");
  const blocked = closed(ctx.board);
  if (blocked) return blocked;
  const target = readStore().lists.find((l) => l.id === v.toListId && !l.archivedAt);
  if (!target) return fail("A lista de destino não existe mais.");
  // Mover para outro quadro exige poder editar lá também.
  if (target.boardId !== ctx.board.id) requireBoard({ user: ctx.user }, target.boardId, "normal");
  const result = mutate((store) => {
    const card = store.cards.find((c) => c.id === v.cardId)!;
    const fromList = store.lists.find((l) => l.id === card.listId);
    const siblings = cardsOfList(store, v.toListId).filter((c) => c.id !== card.id);
    const before = v.beforeId ? siblings.find((c) => c.id === v.beforeId) : null;
    const after = v.afterId ? siblings.find((c) => c.id === v.afterId) : null;
    let rank: string;
    if (before || after) rank = rankBetween(before?.rank, after?.rank);
    else if (v.position === "top") rank = rankBetween(null, siblings[0]?.rank);
    else rank = rankBetween(siblings.at(-1)?.rank, null);
    const movedBoard = card.boardId !== target.boardId;
    if (movedBoard) {
      // Card que muda de quadro ganha número novo; etiquetas do quadro antigo saem.
      const destination = store.boards.find((b) => b.id === target.boardId)!;
      touchBoard(store, card.boardId);
      card.boardId = target.boardId;
      card.number = destination.nextCardNumber++;
      store.cardLabels = store.cardLabels.filter((l) => l.cardId !== card.id);
    }
    const changedList = card.listId !== target.id;
    card.listId = target.id;
    card.rank = rank;
    if (changedList) activity(store, ctx.user, card, "card.moved", { from: fromList?.name ?? "", to: target.name });
    else bumpCard(store, card);
    return { rank, boardId: card.boardId };
  });
  refresh(ctx.board.id);
  if (result.boardId !== ctx.board.id) refresh(result.boardId);
  return ok(result);
}

const cardUpdate = z.object({
  cardId: z.uuid(),
  name: name("ao card", 16384).optional(),
  description: z.unknown().optional(),
  descriptionText: z.string().max(16384, "A descrição pode ter até 16.384 caracteres.").optional(),
  expectedVersion: z.number().int().optional(),
  startAt: z.iso.datetime().nullable().optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  dueComplete: z.boolean().optional(),
  dueReminderMinutes: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15), z.literal(60), z.literal(120), z.literal(1440), z.literal(2880)]).nullable().optional(),
  dueRecurrence: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
  cover: z
    .object({ color: z.string().regex(LABEL_COLOR), size: z.enum(["strip", "full"]) })
    .nullable()
    .optional(),
});

export async function updateCard(input: z.input<typeof cardUpdate>): Promise<ActionResult<{ version: number }> | { ok: false; error: string; conflict: true; current: { description: unknown; descriptionText: string; version: number } }> {
  const parsed = cardUpdate.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const ctx = await onCard(v.cardId);
  if (!ctx) return fail("Este card não existe mais.");
  const blocked = closed(ctx.board);
  if (blocked) return blocked;
  const start = v.startAt !== undefined ? v.startAt : ctx.card.startAt;
  const due = v.dueAt !== undefined ? v.dueAt : ctx.card.dueAt;
  if (start && due && start > due) return fail("O início precisa ser antes da entrega.");

  const result = mutate((store) => {
    const card = store.cards.find((c) => c.id === v.cardId)!;
    if (v.description !== undefined && v.expectedVersion !== undefined && v.expectedVersion !== card.version) {
      return { conflict: true as const, current: { description: card.description, descriptionText: card.descriptionText, version: card.version } };
    }
    if (v.name && v.name !== card.name) {
      card.name = v.name;
      activity(store, ctx.user, card, "card.renamed", { name: v.name });
    }
    if (v.description !== undefined) {
      card.description = v.description;
      card.descriptionText = v.descriptionText ?? "";
      card.version += 1;
      activity(store, ctx.user, card, "card.description", {});
    }
    if (v.startAt !== undefined) card.startAt = v.startAt;
    if (v.dueAt !== undefined) {
      card.dueAt = v.dueAt;
      if (!v.dueAt) card.dueComplete = false;
      activity(store, ctx.user, card, "card.due", { dueAt: v.dueAt });
    }
    if (v.dueComplete !== undefined && v.dueComplete !== card.dueComplete) {
      card.dueComplete = v.dueComplete;
      activity(store, ctx.user, card, "card.completed", { done: v.dueComplete });
    }
    if (v.dueReminderMinutes !== undefined) card.dueReminderMinutes = v.dueReminderMinutes;
    if (v.dueRecurrence !== undefined) card.dueRecurrence = v.dueRecurrence;
    if (v.cover !== undefined) card.cover = v.cover;
    bumpCard(store, card);
    return { conflict: false as const, version: card.version };
  });
  if (result.conflict) return { ok: false, error: "Esta descrição mudou enquanto você editava.", conflict: true, current: result.current };
  refresh(ctx.board.id);
  return ok({ version: result.version });
}

export async function setCardArchived(cardId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await onCard(cardId);
  if (!ctx) return fail("Este card não existe mais.");
  mutate((store) => {
    const card = store.cards.find((c) => c.id === cardId)!;
    card.archivedAt = archived ? nowIso() : null;
    if (!archived) {
      // Volta para o fim da lista; se a lista foi arquivada, para a primeira lista ativa.
      const list = store.lists.find((l) => l.id === card.listId && !l.archivedAt) ?? listsOfBoard(store, card.boardId)[0];
      if (list) {
        card.listId = list.id;
        card.rank = rankBetween(cardsOfList(store, list.id).filter((c) => c.id !== card.id).at(-1)?.rank, null);
      }
    }
    activity(store, ctx.user, card, archived ? "card.archived" : "card.restored", {});
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

export async function deleteCard(cardId: string): Promise<ActionResult> {
  const ctx = await onCard(cardId);
  if (!ctx) return fail("Este card não existe mais.");
  if (!ctx.card.archivedAt) return fail("Arquive o card antes de excluir.");
  mutate((store) => {
    const checklistIds = new Set(store.checklists.filter((c) => c.cardId === cardId).map((c) => c.id));
    store.checklistItems = store.checklistItems.filter((i) => !checklistIds.has(i.checklistId));
    store.checklists = store.checklists.filter((c) => c.cardId !== cardId);
    store.comments = store.comments.filter((c) => c.cardId !== cardId);
    store.cardLabels = store.cardLabels.filter((l) => l.cardId !== cardId);
    store.cardMembers = store.cardMembers.filter((m) => m.cardId !== cardId);
    store.cardLinks = store.cardLinks.filter((l) => l.cardId !== cardId);
    store.notifications = store.notifications.filter((n) => n.cardId !== cardId);
    // A atividade fica, com o nome do card guardado (architecture.md).
    for (const a of store.activities) if (a.cardId === cardId) a.data = { ...a.data, name: ctx.card.name };
    store.cards = store.cards.filter((c) => c.id !== cardId);
    touchBoard(store, ctx.board.id);
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

const copyInput = z.object({
  cardId: z.uuid(),
  toListId: z.uuid(),
  name: name("ao card"),
  keep: z.object({ labels: z.boolean(), members: z.boolean(), checklists: z.boolean(), links: z.boolean() }),
});

export async function copyCard(input: z.input<typeof copyInput>): Promise<ActionResult<{ id: string; boardId: string }>> {
  const parsed = copyInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const ctx = await onCard(v.cardId, "observer");
  if (!ctx) return fail("Este card não existe mais.");
  const target = readStore().lists.find((l) => l.id === v.toListId && !l.archivedAt);
  if (!target) return fail("A lista de destino não existe mais.");
  const { board: destination } = requireBoard({ user: ctx.user }, target.boardId, "normal");
  if (destination.closedAt) return fail("O quadro de destino está fechado.");
  const result = mutate((store) => {
    const source = store.cards.find((c) => c.id === v.cardId)!;
    const copy = insertCard(store, target.boardId, target.id, v.name, ctx.user.id);
    copy.description = source.description;
    copy.descriptionText = source.descriptionText;
    copy.dueAt = source.dueAt;
    copy.startAt = source.startAt;
    copy.cover = source.cover;
    if (v.keep.labels && target.boardId === source.boardId) {
      for (const l of store.cardLabels.filter((x) => x.cardId === source.id)) store.cardLabels.push({ id: newId(), cardId: copy.id, labelId: l.labelId });
    }
    if (v.keep.members) {
      for (const m of store.cardMembers.filter((x) => x.cardId === source.id)) {
        store.cardMembers.push({ id: newId(), cardId: copy.id, userId: m.userId, createdAt: nowIso() });
      }
    }
    if (v.keep.checklists) {
      for (const cl of store.checklists.filter((x) => x.cardId === source.id)) {
        const newList = { ...cl, id: newId(), cardId: copy.id, createdAt: nowIso() };
        store.checklists.push(newList);
        for (const item of store.checklistItems.filter((i) => i.checklistId === cl.id)) {
          store.checklistItems.push({ ...item, id: newId(), checklistId: newList.id, completedAt: null, createdAt: nowIso() });
        }
      }
    }
    if (v.keep.links) {
      for (const link of store.cardLinks.filter((x) => x.cardId === source.id)) {
        store.cardLinks.push({ ...link, id: newId(), cardId: copy.id, createdBy: ctx.user.id, createdAt: nowIso() });
      }
    }
    activity(store, ctx.user, copy, "card.copied", { from: source.name });
    return { id: copy.id, boardId: target.boardId };
  });
  refresh(ctx.board.id);
  if (result.boardId !== ctx.board.id) refresh(result.boardId);
  return ok(result);
}

// ---- membros e etiquetas no card ------------------------------------------------------------------

export async function toggleCardMember(cardId: string, userId: string, on: boolean): Promise<ActionResult> {
  const ctx = await onCard(cardId);
  if (!ctx) return fail("Este card não existe mais.");
  const blocked = closed(ctx.board);
  if (blocked) return blocked;
  const store0 = readStore();
  const allowed =
    store0.boardMembers.some((m) => m.boardId === ctx.board.id && m.userId === userId) ||
    (ctx.board.visibility === "workspace" && store0.workspaceMembers.some((m) => m.workspaceId === ctx.board.workspaceId && m.userId === userId));
  if (!allowed) return fail("Essa pessoa não participa deste quadro.");
  mutate((store) => {
    const card = store.cards.find((c) => c.id === cardId)!;
    const exists = store.cardMembers.some((m) => m.cardId === cardId && m.userId === userId);
    const who = store.users.find((u) => u.id === userId)?.name ?? "";
    if (on && !exists) {
      store.cardMembers.push({ id: newId(), cardId, userId, createdAt: nowIso() });
      activity(store, ctx.user, card, "card.member", { added: true, name: who });
      notify(store, { userId, type: "assigned", boardId: card.boardId, cardId, actorId: ctx.user.id, data: { cardName: card.name } });
    }
    if (!on && exists) {
      store.cardMembers = store.cardMembers.filter((m) => !(m.cardId === cardId && m.userId === userId));
      activity(store, ctx.user, card, "card.member", { added: false, name: who });
    }
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

export async function toggleCardLabel(cardId: string, labelId: string, on: boolean): Promise<ActionResult> {
  const ctx = await onCard(cardId);
  if (!ctx) return fail("Este card não existe mais.");
  const blocked = closed(ctx.board);
  if (blocked) return blocked;
  const label = readStore().labels.find((l) => l.id === labelId && l.boardId === ctx.board.id);
  if (!label) return fail("Esta etiqueta não é deste quadro.");
  mutate((store) => {
    const card = store.cards.find((c) => c.id === cardId)!;
    const exists = store.cardLabels.some((l) => l.cardId === cardId && l.labelId === labelId);
    if (on && !exists) store.cardLabels.push({ id: newId(), cardId, labelId });
    if (!on) store.cardLabels = store.cardLabels.filter((l) => !(l.cardId === cardId && l.labelId === labelId));
    if (on !== exists) activity(store, ctx.user, card, "card.label", { added: on, name: label.name, color: label.color });
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

const labelInput = z.object({
  boardId: z.uuid(),
  labelId: z.uuid().optional(),
  name: z.string().trim().max(100, "O nome da etiqueta pode ter até 100 caracteres."),
  color: z.string().regex(LABEL_COLOR).nullable(),
});

export async function upsertLabel(input: z.input<typeof labelInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = labelInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  if (!v.name && !v.color) return fail("Dê um nome ou escolha uma cor.");
  const { board } = await onBoard(v.boardId);
  const blocked = closed(board);
  if (blocked) return blocked;
  const id = mutate((store) => {
    const existing = v.labelId ? store.labels.find((l) => l.id === v.labelId && l.boardId === v.boardId) : null;
    if (existing) {
      existing.name = v.name;
      existing.color = v.color;
      touchBoard(store, v.boardId);
      return existing.id;
    }
    const label = { id: newId(), boardId: v.boardId, name: v.name, color: v.color, createdAt: nowIso() };
    store.labels.push(label);
    touchBoard(store, v.boardId);
    return label.id;
  });
  refresh(v.boardId);
  return ok({ id });
}

export async function deleteLabel(labelId: string): Promise<ActionResult> {
  const label = readStore().labels.find((l) => l.id === labelId);
  if (!label) return fail("Esta etiqueta não existe mais.");
  await onBoard(label.boardId);
  mutate((store) => {
    store.cardLabels = store.cardLabels.filter((l) => l.labelId !== labelId);
    store.labels = store.labels.filter((l) => l.id !== labelId);
    touchBoard(store, label.boardId);
  });
  refresh(label.boardId);
  return ok(undefined);
}

// ---- checklists --------------------------------------------------------------------------------

export async function createChecklist(cardId: string, checklistName: string, copyFromId?: string | null): Promise<ActionResult<{ id: string }>> {
  const parsed = name("à checklist").safeParse(checklistName);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await onCard(cardId);
  if (!ctx) return fail("Este card não existe mais.");
  const blocked = closed(ctx.board);
  if (blocked) return blocked;
  const id = mutate((store) => {
    const card = store.cards.find((c) => c.id === cardId)!;
    const existing = store.checklists.filter((c) => c.cardId === cardId).sort((a, b) => (a.rank < b.rank ? -1 : 1));
    const checklist = { id: newId(), cardId, name: parsed.data, rank: rankBetween(existing.at(-1)?.rank, null), hideChecked: false, createdAt: nowIso() };
    store.checklists.push(checklist);
    if (copyFromId) {
      const items = store.checklistItems.filter((i) => i.checklistId === copyFromId).sort((a, b) => (a.rank < b.rank ? -1 : 1));
      for (const item of items) store.checklistItems.push({ ...item, id: newId(), checklistId: checklist.id, completedAt: null, createdAt: nowIso() });
    }
    activity(store, ctx.user, card, "card.checklist", { name: checklist.name });
    return checklist.id;
  });
  refresh(ctx.board.id);
  return ok({ id });
}

async function onChecklist(checklistId: string) {
  const checklist = readStore().checklists.find((c) => c.id === checklistId);
  if (!checklist) return null;
  const ctx = await onCard(checklist.cardId);
  return ctx ? { ...ctx, checklist } : null;
}

export async function updateChecklist(checklistId: string, patch: { name?: string; hideChecked?: boolean }): Promise<ActionResult> {
  if (patch.name !== undefined) {
    const parsed = name("à checklist").safeParse(patch.name);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    patch.name = parsed.data;
  }
  const ctx = await onChecklist(checklistId);
  if (!ctx) return fail("Esta checklist não existe mais.");
  mutate((store) => {
    const c = store.checklists.find((x) => x.id === checklistId)!;
    if (patch.name !== undefined) c.name = patch.name;
    if (patch.hideChecked !== undefined) c.hideChecked = patch.hideChecked;
    touchBoard(store, ctx.board.id);
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

export async function deleteChecklist(checklistId: string): Promise<ActionResult> {
  const ctx = await onChecklist(checklistId);
  if (!ctx) return fail("Esta checklist não existe mais.");
  mutate((store) => {
    store.checklistItems = store.checklistItems.filter((i) => i.checklistId !== checklistId);
    store.checklists = store.checklists.filter((c) => c.id !== checklistId);
    touchBoard(store, ctx.board.id);
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

export async function addChecklistItem(checklistId: string, itemName: string): Promise<ActionResult<{ id: string }>> {
  const parsed = name("ao item", 16384).safeParse(itemName);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await onChecklist(checklistId);
  if (!ctx) return fail("Esta checklist não existe mais.");
  const blocked = closed(ctx.board);
  if (blocked) return blocked;
  const id = mutate((store) => {
    const items = store.checklistItems.filter((i) => i.checklistId === checklistId).sort((a, b) => (a.rank < b.rank ? -1 : 1));
    const item = {
      id: newId(),
      checklistId,
      name: parsed.data,
      rank: rankBetween(items.at(-1)?.rank, null),
      completedAt: null,
      dueAt: null,
      assigneeId: null,
      createdAt: nowIso(),
    };
    store.checklistItems.push(item);
    bumpCard(store, store.cards.find((c) => c.id === ctx.card.id)!);
    return item.id;
  });
  refresh(ctx.board.id);
  return ok({ id });
}

const itemPatch = z.object({
  name: name("ao item", 16384).optional(),
  done: z.boolean().optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  assigneeId: z.uuid().nullable().optional(),
});

export async function updateChecklistItem(itemId: string, input: z.input<typeof itemPatch>): Promise<ActionResult> {
  const parsed = itemPatch.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const item0 = readStore().checklistItems.find((i) => i.id === itemId);
  if (!item0) return fail("Este item não existe mais.");
  const ctx = await onChecklist(item0.checklistId);
  if (!ctx) return fail("Esta checklist não existe mais.");
  const blocked = closed(ctx.board);
  if (blocked) return blocked;
  mutate((store) => {
    const item = store.checklistItems.find((i) => i.id === itemId)!;
    const card = store.cards.find((c) => c.id === ctx.card.id)!;
    if (v.name !== undefined) item.name = v.name;
    if (v.done !== undefined && v.done !== !!item.completedAt) {
      item.completedAt = v.done ? nowIso() : null;
      activity(store, ctx.user, card, "card.item", { done: v.done, name: item.name });
    }
    if (v.dueAt !== undefined) item.dueAt = v.dueAt;
    if (v.assigneeId !== undefined) {
      item.assigneeId = v.assigneeId;
      if (v.assigneeId) notify(store, { userId: v.assigneeId, type: "assigned", boardId: card.boardId, cardId: card.id, actorId: ctx.user.id, data: { cardName: card.name, item: item.name } });
    }
    bumpCard(store, card);
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

export async function deleteChecklistItem(itemId: string): Promise<ActionResult> {
  const item = readStore().checklistItems.find((i) => i.id === itemId);
  if (!item) return fail("Este item não existe mais.");
  const ctx = await onChecklist(item.checklistId);
  if (!ctx) return fail("Esta checklist não existe mais.");
  mutate((store) => {
    store.checklistItems = store.checklistItems.filter((i) => i.id !== itemId);
    touchBoard(store, ctx.board.id);
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

/** Converte um item de checklist em card, na mesma lista do card de origem. */
export async function convertItemToCard(itemId: string): Promise<ActionResult<{ id: string }>> {
  const item = readStore().checklistItems.find((i) => i.id === itemId);
  if (!item) return fail("Este item não existe mais.");
  const ctx = await onChecklist(item.checklistId);
  if (!ctx) return fail("Esta checklist não existe mais.");
  const id = mutate((store) => {
    const card = insertCard(store, ctx.board.id, ctx.card.listId, item.name, ctx.user.id);
    card.dueAt = item.dueAt;
    if (item.assigneeId) store.cardMembers.push({ id: newId(), cardId: card.id, userId: item.assigneeId, createdAt: nowIso() });
    store.checklistItems = store.checklistItems.filter((i) => i.id !== itemId);
    return card.id;
  });
  refresh(ctx.board.id);
  return ok({ id });
}

// ---- comentários (F04) ---------------------------------------------------------------------------

const commentInput = z.object({
  body: z.unknown(),
  bodyText: z.string().trim().min(1, "Escreva o comentário.").max(16384, "O comentário pode ter até 16.384 caracteres."),
  mentions: z.array(z.uuid()).max(50),
});

export async function addComment(cardId: string, input: z.input<typeof commentInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = commentInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await onCard(cardId, "observer");
  if (!ctx) return fail("Este card não existe mais.");
  if (ctx.board.closedAt) return fail("Este quadro está fechado.");
  if (ctx.role === "observer" && ctx.board.prefs.comments !== "observers") return fail("Neste quadro, só os membros comentam.");
  const id = mutate((store) => {
    const card = store.cards.find((c) => c.id === cardId)!;
    const comment = { id: newId(), cardId, authorId: ctx.user.id, body: parsed.data.body, bodyText: parsed.data.bodyText, mentions: parsed.data.mentions, editedAt: null, createdAt: nowIso() };
    store.comments.push(comment);
    activity(store, ctx.user, card, "card.comment", { excerpt: comment.bodyText.slice(0, 140) });
    const excerpt = comment.bodyText.slice(0, 140);
    for (const userId of new Set(parsed.data.mentions)) {
      notify(store, { userId, type: "mention", boardId: card.boardId, cardId, actorId: ctx.user.id, data: { cardName: card.name, excerpt } });
    }
    for (const m of store.cardMembers.filter((x) => x.cardId === cardId && !parsed.data.mentions.includes(x.userId))) {
      notify(store, { userId: m.userId, type: "comment", boardId: card.boardId, cardId, actorId: ctx.user.id, data: { cardName: card.name, excerpt } });
    }
    return comment.id;
  });
  refresh(ctx.board.id);
  return ok({ id });
}

export async function editComment(commentId: string, input: z.input<typeof commentInput>): Promise<ActionResult> {
  const parsed = commentInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const comment = readStore().comments.find((c) => c.id === commentId);
  if (!comment) return fail("Este comentário não existe mais.");
  const ctx = await onCard(comment.cardId, "observer");
  if (!ctx) return fail("Este card não existe mais.");
  if (comment.authorId !== ctx.user.id) return fail("Só quem escreveu pode editar o comentário.");
  mutate((store) => {
    const c = store.comments.find((x) => x.id === commentId)!;
    c.body = parsed.data.body;
    c.bodyText = parsed.data.bodyText;
    c.mentions = parsed.data.mentions;
    c.editedAt = nowIso();
    touchBoard(store, ctx.board.id);
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const comment = readStore().comments.find((c) => c.id === commentId);
  if (!comment) return fail("Este comentário não existe mais.");
  const ctx = await onCard(comment.cardId, "observer");
  if (!ctx) return fail("Este card não existe mais.");
  if (comment.authorId !== ctx.user.id) return fail("Só quem escreveu pode excluir o comentário.");
  mutate((store) => {
    store.comments = store.comments.filter((c) => c.id !== commentId);
    touchBoard(store, ctx.board.id);
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

// ---- vínculo com o tracking (F16, S24) ----------------------------------------------------------------

const linkInput = z.object({
  cardId: z.uuid(),
  dashboardId: z.uuid(),
  targetType: z.enum(["campaign", "ad_set", "ad", "product", "dashboard"]),
  targetId: z.uuid().nullable(),
});

export async function linkCard(input: z.input<typeof linkInput>): Promise<ActionResult> {
  const parsed = linkInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const ctx = await onCard(v.cardId);
  if (!ctx) return fail("Este card não existe mais.");
  requireDashboard({ user: ctx.user }, v.dashboardId);
  const error = mutate((store) => {
    const accountIds = new Set(store.dashboardAdAccounts.filter((l) => l.dashboardId === v.dashboardId).map((l) => l.adAccountId));
    const storeIds = new Set(store.dashboardStores.filter((l) => l.dashboardId === v.dashboardId).map((l) => l.storeId));
    const target =
      v.targetType === "campaign"
        ? store.campaigns.find((c) => c.id === v.targetId && accountIds.has(c.adAccountId))
        : v.targetType === "ad_set"
          ? store.adSets.find((s) => s.id === v.targetId && accountIds.has(s.adAccountId))
          : v.targetType === "ad"
            ? store.ads.find((a) => a.id === v.targetId && accountIds.has(a.adAccountId))
            : v.targetType === "product"
              ? store.products.find((p) => p.id === v.targetId && storeIds.has(p.storeId))
              : { name: store.dashboards.find((d) => d.id === v.dashboardId)?.name ?? "" };
    if (!target) return "Não encontrei esse item neste dashboard.";
    const duplicate = store.cardLinks.some(
      (l) =>
        l.cardId === v.cardId &&
        l.dashboardId === v.dashboardId &&
        l.targetType === v.targetType &&
        (l.campaignId ?? l.adSetId ?? l.adId ?? l.productId ?? null) === (v.targetType === "dashboard" ? null : v.targetId),
    );
    if (duplicate) return "Este card já está ligado a esse item.";
    store.cardLinks.push({
      id: newId(),
      cardId: v.cardId,
      dashboardId: v.dashboardId,
      targetType: v.targetType,
      campaignId: v.targetType === "campaign" ? v.targetId : null,
      adSetId: v.targetType === "ad_set" ? v.targetId : null,
      adId: v.targetType === "ad" ? v.targetId : null,
      productId: v.targetType === "product" ? v.targetId : null,
      createdBy: ctx.user.id,
      createdAt: nowIso(),
    });
    activity(store, ctx.user, store.cards.find((c) => c.id === v.cardId)!, "card.linked", { name: target.name });
    return null;
  });
  if (error) return fail(error);
  refresh(ctx.board.id);
  return ok(undefined);
}

export async function unlinkCard(linkId: string): Promise<ActionResult> {
  const link = readStore().cardLinks.find((l) => l.id === linkId);
  if (!link) return fail("Este vínculo não existe mais.");
  const ctx = await onCard(link.cardId);
  if (!ctx) return fail("Este card não existe mais.");
  mutate((store) => {
    store.cardLinks = store.cardLinks.filter((l) => l.id !== linkId);
    activity(store, ctx.user, store.cards.find((c) => c.id === link.cardId)!, "card.unlinked", { name: "um item do tracking" });
  });
  refresh(ctx.board.id);
  return ok(undefined);
}

/** Busca para o vínculo (GET /api/link-targets no backend real): campanhas, conjuntos, anúncios e produtos. */
export async function searchLinkTargets(dashboardId: string, q: string) {
  const user = await requireUser();
  requireDashboard({ user }, dashboardId);
  const store = readStore();
  const term = q
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  const match = (s: string) =>
    !term ||
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .includes(term);
  const accountIds = new Set(store.dashboardAdAccounts.filter((l) => l.dashboardId === dashboardId).map((l) => l.adAccountId));
  const provider = new Map(store.adAccounts.map((a) => [a.id, a.provider]));
  const storeIds = new Set(store.dashboardStores.filter((l) => l.dashboardId === dashboardId).map((l) => l.storeId));
  const campaignName = new Map(store.campaigns.map((c) => [c.id, c.name]));
  return {
    campaigns: store.campaigns
      .filter((c) => accountIds.has(c.adAccountId) && match(c.name))
      .slice(0, 8)
      .map((c) => ({ id: c.id, name: c.name, provider: provider.get(c.adAccountId) ?? null, parent: null })),
    adSets: store.adSets
      .filter((s) => accountIds.has(s.adAccountId) && match(s.name))
      .slice(0, 8)
      .map((s) => ({ id: s.id, name: s.name, provider: provider.get(s.adAccountId) ?? null, parent: campaignName.get(s.campaignId) ?? null })),
    ads: store.ads
      .filter((a) => accountIds.has(a.adAccountId) && match(a.name))
      .slice(0, 8)
      .map((a) => ({ id: a.id, name: a.name, provider: provider.get(a.adAccountId) ?? null, parent: campaignName.get(a.campaignId) ?? null })),
    products: store.products
      .filter((p) => storeIds.has(p.storeId) && match(p.name))
      .slice(0, 8)
      .map((p) => ({ id: p.id, name: p.name, provider: null, parent: null })),
  };
}
