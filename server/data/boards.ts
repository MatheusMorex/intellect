// Leituras do kanban: S03 Início, S05 Quadro, S06 Verso do card, S08 Menu,
// S09 Compartilhar, S10 Busca, S11 Notificações, S12 Workspace, S30 Meus cards.

import { createHash } from "node:crypto";

import { notFound } from "next/navigation";

import { boardRole, requireBoard, requireWorkspace, workspaceRole, type BoardRole, type Ctx } from "@/server/access";
import { adminClient } from "@/server/db/admin";
import { getCardMetrics, listDashboardsFor, type CardMetric } from "@/server/data/tracking";
import { touchLastActive } from "@/server/live/identity";
import { withLiveRead } from "@/server/live/scope";
import { homeHrefLive, inviteByTokenLive, profileViewLive, shellDataLive, workspaceMembersLive } from "@/server/live/shell";
import { isLive } from "@/server/mode";
import { attachmentUrl, isImageAttachment } from "@/server/attachments";
import { displayFieldValue } from "@/lib/custom-fields";
import { fileUrl } from "@/server/files";
import { cardsOfList, listsOfBoard } from "@/server/kanban/core";
import { mutate, newId, nowIso, readStore } from "@/server/store/db";
import { DEFAULT_APPEARANCE } from "@/server/store/seed";
import type { BoardBackground, BoardPrefs, BoardRow, CardCover, CardRow, CustomFieldRow, Store, UserAppearance, UserPreferences } from "@/server/store/types";
import type { BoardBackgroundView } from "@/lib/board-backgrounds";

/** Pessoa como as telas recebem. avatarUrl nulo: aparecem as iniciais na cor de avatarColor. */
export type Person = { id: string; name: string; username: string | null; avatarColor: string; avatarUrl: string | null };

function person(store: Store, userId: string | null): Person {
  const u = userId ? store.users.find((x) => x.id === userId) : undefined;
  return u
    ? { id: u.id, name: u.name, username: u.username, avatarColor: u.avatarColor, avatarUrl: u.avatarFileId ? fileUrl(u.avatarFileId) : null }
    : { id: userId ?? "removido", name: "Usuário removido", username: null, avatarColor: "black", avatarUrl: null };
}

export function backgroundView(bg: BoardBackground): BoardBackgroundView {
  return bg.type === "image" ? { type: "image", url: fileUrl(bg.fileId) } : { type: "color", value: bg.value };
}

export type BoardSummary = { id: string; name: string; background: BoardBackgroundView; workspaceSlug: string; starred: boolean; closed: boolean };

function summary(store: Store, ctx: Ctx, b: BoardRow): BoardSummary {
  return {
    id: b.id,
    name: b.name,
    background: backgroundView(b.background),
    workspaceSlug: store.workspaces.find((w) => w.id === b.workspaceId)?.slug ?? "",
    starred: store.boardStars.some((s) => s.boardId === b.id && s.userId === ctx.user.id),
    closed: !!b.closedAt,
  };
}

export function listBoardsFor(ctx: Ctx, includeClosed = false): BoardSummary[] {
  const store = readStore();
  return store.boards
    .filter((b) => (includeClosed || !b.closedAt) && boardRole(ctx, b))
    .map((b) => summary(store, ctx, b))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export type ShellData = {
  workspace: { id: string; name: string; slug: string } | null;
  boards: BoardSummary[];
  dashboards: { id: string; name: string; adPlatforms: ("meta" | "google")[] }[];
  unreadNotifications: number;
  preferences: UserPreferences;
  /** Foto de perfil de quem está logado. */
  avatarUrl: string | null;
  /** Plano de fundo (com o endereço da imagem), frases ao lado do logo e tela inicial. */
  appearance: Omit<UserAppearance, "wallpaper"> & { wallpaper: { url: string; dim: number; blur: number } | null };
};

export async function getShellData(ctx: Ctx): Promise<ShellData> {
  if (isLive()) {
    // Perfil e workspace pela etapa 1; quadros, dashboards e notificações pelo retrato.
    const base = await shellDataLive(ctx.user.id);
    return withLiveRead(ctx.user.id, () => {
      const boards = listBoardsFor(ctx);
      return {
        ...base,
        boards: [...boards.filter((b) => b.starred), ...boards.filter((b) => !b.starred)],
        dashboards: listDashboardsFor(ctx).map(({ id, name, adPlatforms }) => ({ id, name, adPlatforms })),
        unreadNotifications: readStore().notifications.filter((n) => n.userId === ctx.user.id && !n.readAt).length,
      };
    });
  }
  const store = readStore();
  const membership = store.workspaceMembers.find((m) => m.userId === ctx.user.id);
  const workspace = membership ? store.workspaces.find((w) => w.id === membership.workspaceId) : undefined;
  const user = store.users.find((u) => u.id === ctx.user.id);
  const boards = listBoardsFor(ctx);
  return {
    workspace: workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null,
    // No menu: favoritos primeiro.
    boards: [...boards.filter((b) => b.starred), ...boards.filter((b) => !b.starred)],
    dashboards: listDashboardsFor(ctx).map(({ id, name, adPlatforms }) => ({ id, name, adPlatforms })),
    unreadNotifications: store.notifications.filter((n) => n.userId === ctx.user.id && !n.readAt).length,
    preferences: user?.preferences ?? { colorblind: false, reduceMotion: false, singleKeyShortcuts: true, emailNotifications: "periodic" },
    avatarUrl: user?.avatarFileId ? fileUrl(user.avatarFileId) : null,
    appearance: appearanceView(user?.appearance ?? DEFAULT_APPEARANCE),
  };
}

/**
 * Tela que abre depois de entrar, escolhida em Configurações (Início, Meus cards
 * ou Resumo). O login manda direto para ela, sem passar pela raiz.
 */
export async function homeHref(userId: string): Promise<string> {
  if (isLive()) return homeHrefLive(userId);
  const store = readStore();
  const user = store.users.find((u) => u.id === userId);
  const memberships = store.workspaceMembers.filter((m) => m.userId === userId);
  const workspace = memberships[0] ? store.workspaces.find((w) => w.id === memberships[0].workspaceId) : undefined;
  const page = user?.appearance.homePage ?? "inicio";
  if (page === "meus-cards") return "/me/cards";
  if (page === "resumo") {
    const workspaceIds = new Set(memberships.map((m) => m.workspaceId));
    const dashboard = store.dashboards.find((d) => workspaceIds.has(d.workspaceId));
    if (dashboard) return `/d/${dashboard.id}`;
  }
  return workspace ? `/w/${workspace.slug}` : "/me";
}

export function appearanceView(a: UserAppearance): ShellData["appearance"] {
  return {
    showTaglines: a.showTaglines,
    homePage: a.homePage,
    wallpaper: a.wallpaper ? { url: fileUrl(a.wallpaper.fileId), dim: a.wallpaper.dim, blur: a.wallpaper.blur } : null,
  };
}

async function getWorkspaceHomeImpl(ctx: Ctx, slug: string) {
  const { workspace, role } = await requireWorkspace(ctx, slug);
  const store = readStore();
  const boards = listBoardsFor(ctx, true).filter((b) => b.workspaceSlug === workspace.slug);
  const visits = store.boardVisits
    .filter((v) => v.userId === ctx.user.id)
    .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
    .map((v) => boards.find((b) => b.id === v.boardId && !b.closed))
    .filter((b): b is BoardSummary => !!b)
    .slice(0, 4);
  // Prazos dos próximos 7 dias nos cards do usuário.
  const myCardIds = new Set(store.cardMembers.filter((m) => m.userId === ctx.user.id).map((m) => m.cardId));
  const soon = Date.now() + 7 * 86_400_000;
  const upcoming = store.cards
    .filter((c) => myCardIds.has(c.id) && !c.archivedAt && c.dueAt && !c.dueComplete && new Date(c.dueAt).getTime() < soon)
    .filter((c) => boards.some((b) => b.id === c.boardId && !b.closed))
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1))
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.name, dueAt: c.dueAt!, boardId: c.boardId, boardName: boards.find((b) => b.id === c.boardId)?.name ?? "" }));
  return {
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    role,
    starred: boards.filter((b) => b.starred && !b.closed),
    recent: visits,
    boards: boards.filter((b) => !b.closed),
    closed: boards.filter((b) => b.closed),
    upcoming,
    dashboards: listDashboardsFor(ctx).filter((d) => d.workspaceId === workspace.id),
  };
}

// ---- quadro (S05) -----------------------------------------------------------------------------

export type LabelView = { id: string; name: string; color: string | null };

/** Capa como a tela usa: cor de etiqueta ou imagem anexada (com o endereço da imagem). */
export type CoverView = { size: "strip" | "full"; color: string | null; attachmentId: string | null; imageUrl: string | null };

function coverView(cover: CardCover | null): CoverView | null {
  if (!cover) return null;
  if (cover.attachmentId) return { size: cover.size, color: null, attachmentId: cover.attachmentId, imageUrl: attachmentUrl(cover.attachmentId) };
  return { size: cover.size, color: cover.color ?? null, attachmentId: null, imageUrl: null };
}

/** Campo personalizado como a tela usa (o gerenciador do quadro e o verso do card). */
export type FieldView = { id: string; name: string; type: CustomFieldRow["type"]; options: CustomFieldRow["options"]; showOnFront: boolean };

function boardFields(store: Store, boardId: string): FieldView[] {
  return store.customFields
    .filter((f) => f.boardId === boardId)
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id.localeCompare(b.id)))
    .map((f) => ({ id: f.id, name: f.name, type: f.type, options: f.options, showOnFront: f.showOnFront }));
}

export type CardFront = {
  id: string;
  number: number;
  listId: string;
  rank: string;
  name: string;
  dueAt: string | null;
  dueComplete: boolean;
  startAt: string | null;
  cover: CoverView | null;
  labelIds: string[];
  memberIds: string[];
  hasDescription: boolean;
  comments: number;
  /** Quantos anexos (arquivos e links). */
  attachments: number;
  /** Campos marcados para aparecer na frente do card, com valor ("Verba: 1.500"). */
  fields: { id: string; name: string; text: string }[];
  checklist: { done: number; total: number } | null;
  lastActivityAt: string;
  metric: CardMetric | null;
};

export type BoardView = {
  board: {
    id: string;
    name: string;
    description: string;
    background: BoardBackgroundView;
    visibility: "private" | "workspace";
    prefs: BoardPrefs;
    workspaceId: string;
    workspaceSlug: string;
    workspaceName: string;
    starred: boolean;
    closed: boolean;
    stamp: string;
  };
  role: BoardRole;
  meId: string;
  canEdit: boolean;
  canComment: boolean;
  isAdmin: boolean;
  lists: { id: string; name: string; rank: string; color: string | null }[];
  cards: CardFront[];
  labels: LabelView[];
  /** Campos personalizados do quadro, na ordem. */
  customFields: FieldView[];
  members: (Person & { role: BoardRole; viaWorkspace?: boolean })[];
  workspaceMembers: Person[];
  /** Botões de automação ligados: do card (no verso) e do quadro (no cabeçalho). */
  buttons: { card: { id: string; label: string }[]; board: { id: string; label: string }[] };
};

function cardFront(store: Store, c: CardRow, metrics: Map<string, CardMetric>): CardFront {
  const checklists = store.checklists.filter((x) => x.cardId === c.id);
  const items = store.checklistItems.filter((i) => checklists.some((x) => x.id === i.checklistId));
  return {
    id: c.id,
    number: c.number,
    listId: c.listId,
    rank: c.rank,
    name: c.name,
    dueAt: c.dueAt,
    dueComplete: c.dueComplete,
    startAt: c.startAt,
    cover: coverView(c.cover),
    labelIds: store.cardLabels.filter((l) => l.cardId === c.id).map((l) => l.labelId),
    memberIds: store.cardMembers.filter((m) => m.cardId === c.id).map((m) => m.userId),
    hasDescription: c.descriptionText.trim().length > 0,
    comments: store.comments.filter((x) => x.cardId === c.id).length,
    attachments: store.attachments.filter((x) => x.cardId === c.id).length,
    fields: store.customFieldValues
      .filter((v) => v.cardId === c.id)
      .flatMap((v) => {
        const field = store.customFields.find((x) => x.id === v.fieldId && x.showOnFront);
        return field ? [{ id: field.id, name: field.name, text: displayFieldValue(field, v.value), rank: field.rank }] : [];
      })
      .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
      .map(({ id, name, text }) => ({ id, name, text })),
    checklist: items.length ? { done: items.filter((i) => i.completedAt).length, total: items.length } : null,
    lastActivityAt: c.lastActivityAt,
    metric: metrics.get(c.id) ?? null,
  };
}

async function getBoardViewImpl(ctx: Ctx, boardId: string): Promise<BoardView> {
  const { board, role } = requireBoard(ctx, boardId);
  const store = readStore();
  const workspace = store.workspaces.find((w) => w.id === board.workspaceId)!;
  const lists = listsOfBoard(store, board.id);
  const cards = lists.flatMap((l) => cardsOfList(store, l.id));
  const metrics = getCardMetrics(
    ctx,
    cards.map((c) => c.id),
  );
  const boardMemberIds = new Set(store.boardMembers.filter((m) => m.boardId === board.id).map((m) => m.userId));
  const members: BoardView["members"] = store.boardMembers
    .filter((m) => m.boardId === board.id)
    .map((m) => ({ ...person(store, m.userId), role: m.role }));
  // Num quadro do workspace, os membros do workspace também podem ser postos nos cards.
  const workspaceMembers = store.workspaceMembers.filter((m) => m.workspaceId === board.workspaceId).map((m) => person(store, m.userId));
  if (board.visibility === "workspace") {
    for (const p of workspaceMembers) if (!boardMemberIds.has(p.id)) members.push({ ...p, role: "normal", viaWorkspace: true });
  }
  const readOnly = role === "observer" || !!board.closedAt;
  return {
    board: {
      id: board.id,
      name: board.name,
      description: board.description,
      background: backgroundView(board.background),
      visibility: board.visibility,
      prefs: board.prefs,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      workspaceName: workspace.name,
      starred: store.boardStars.some((s) => s.boardId === board.id && s.userId === ctx.user.id),
      closed: !!board.closedAt,
      stamp: store.boardStamps[board.id] ?? "",
    },
    role,
    meId: ctx.user.id,
    canEdit: !readOnly,
    canComment: !board.closedAt && (role !== "observer" || board.prefs.comments === "observers"),
    isAdmin: role === "admin",
    lists: lists.map((l) => ({ id: l.id, name: l.name, rank: l.rank, color: l.color })),
    cards: cards.map((c) => cardFront(store, c, metrics)),
    labels: store.labels.filter((l) => l.boardId === board.id).map((l) => ({ id: l.id, name: l.name, color: l.color })),
    customFields: boardFields(store, board.id),
    members,
    workspaceMembers,
    buttons: {
      card: (store.automations ?? []).filter((a) => a.boardId === board.id && a.enabled && a.type === "card_button").map((a) => ({ id: a.id, label: String(a.trigger.label ?? a.name) })),
      board: (store.automations ?? []).filter((a) => a.boardId === board.id && a.enabled && a.type === "board_button").map((a) => ({ id: a.id, label: String(a.trigger.label ?? a.name) })),
    },
  };
}

/** Registra a visita (para "Vistos recentemente"). Roda depois da resposta (after), com o acesso já conferido pela página. */
export async function recordBoardVisit(ctx: Ctx, boardId: string) {
  if (isLive()) {
    // Duas gravações simples: não vale carregar o retrato inteiro.
    const { error } = await adminClient()
      .from("board_visits")
      .upsert({ user_id: ctx.user.id, board_id: boardId, visited_at: nowIso() }, { onConflict: "user_id,board_id" });
    if (error) console.error("[banco] registrar a visita ao quadro:", error.message);
    await touchLastActive(ctx.user.id);
    return;
  }
  mutate((store) => {
    const visit = store.boardVisits.find((v) => v.userId === ctx.user.id && v.boardId === boardId);
    if (visit) visit.visitedAt = nowIso();
    else store.boardVisits.push({ id: newId(), userId: ctx.user.id, boardId, visitedAt: nowIso() });
    const user = store.users.find((u) => u.id === ctx.user.id);
    if (user) user.lastActiveAt = nowIso();
  });
}

// ---- verso do card (S06) -------------------------------------------------------------------------

const ACTIVITY_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  "card.created": (d) => `criou este card em ${d.listName ?? "uma lista"}`,
  "card.moved": (d) => `moveu este card de ${d.from} para ${d.to}`,
  "card.renamed": (d) => `renomeou este card para "${d.name}"`,
  "card.archived": () => "arquivou este card",
  "card.restored": () => "restaurou este card",
  "card.completed": (d) => (d.done ? "marcou o prazo como concluído" : "desmarcou o prazo como concluído"),
  "card.due": (d) => (d.dueAt ? "mudou o prazo" : "tirou o prazo"),
  "card.member": (d) => (d.added ? `colocou ${d.name} neste card` : `tirou ${d.name} deste card`),
  "card.label": (d) => (d.added ? `adicionou a etiqueta ${d.name || d.color}` : `tirou a etiqueta ${d.name || d.color}`),
  "card.description": () => "mudou a descrição",
  "card.checklist": (d) => `adicionou a checklist ${d.name}`,
  "card.item": (d) => (d.done ? `concluiu ${d.name}` : `reabriu ${d.name}`),
  "card.copied": (d) => `copiou este card de ${d.from}`,
  "card.linked": (d) => `ligou este card a ${d.name}`,
  "card.unlinked": (d) => `desligou este card de ${d.name}`,
  "card.comment": () => "comentou",
  "card.attachment": (d) => (d.added ? `anexou ${d.name}` : `tirou o anexo ${d.name}`),
  "card.field": (d) => (d.value == null ? `limpou o campo ${d.name}` : `mudou ${d.name} para ${d.value}`),
  // Eventos do quadro e das listas (aparecem na Atividade do quadro).
  "board.created": () => "criou este quadro",
  "board.updated": () => "atualizou o quadro",
  "board.closed": () => "fechou o quadro",
  "board.reopened": () => "reabriu o quadro",
  "board.member_added": (d) => `colocou ${d.name ?? "alguém"} no quadro`,
  "list.created": (d) => `criou a lista ${d.name}`,
  "list.archived": (d) => `arquivou a lista ${d.name}`,
  "list.restored": (d) => `restaurou a lista ${d.name}`,
  "list.sorted": (d) => `ordenou os cards da lista ${d.name}`,
};

export function activityText(type: string, data: Record<string, unknown>) {
  // Evento sem frase (não devia acontecer: tests/activity-text.test.ts confere) não mostra o código cru.
  return ACTIVITY_TEXT[type]?.(data) ?? "fez uma mudança";
}

async function getCardDetailImpl(ctx: Ctx, cardId: string) {
  const store = readStore();
  const card = store.cards.find((c) => c.id === cardId);
  if (!card) notFound();
  const { board, role } = requireBoard(ctx, card.boardId);
  const list = store.lists.find((l) => l.id === card.listId);
  const checklists = store.checklists
    .filter((c) => c.cardId === card.id)
    .sort((a, b) => (a.rank < b.rank ? -1 : 1))
    .map((c) => ({
      id: c.id,
      name: c.name,
      hideChecked: c.hideChecked,
      items: store.checklistItems
        .filter((i) => i.checklistId === c.id)
        .sort((a, b) => (a.rank < b.rank ? -1 : 1))
        .map((i) => ({ id: i.id, name: i.name, done: !!i.completedAt, dueAt: i.dueAt, assignee: i.assigneeId ? person(store, i.assigneeId) : null })),
    }));
  const comments = store.comments
    .filter((c) => c.cardId === card.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((c) => ({
      id: c.id,
      author: person(store, c.authorId),
      body: c.body,
      bodyText: c.bodyText,
      createdAt: c.createdAt,
      editedAt: c.editedAt,
      automationName: c.automationName ?? null,
      mine: c.authorId === ctx.user.id && !c.automationName,
    }));
  const activity = store.activities
    .filter((a) => a.cardId === card.id && a.type !== "card.comment")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50)
    .map((a) => ({
      id: a.id,
      actor: a.actorKind === "automation" ? { id: "automacao", name: String(a.data.automationName ?? "Automação"), username: null, avatarColor: "purple", avatarUrl: null } : person(store, a.actorId),
      kind: a.actorKind,
      text: activityText(a.type, a.data),
      createdAt: a.createdAt,
    }));
  const links = store.cardLinks
    .filter((l) => l.cardId === card.id)
    .map((l) => {
      const target =
        l.targetType === "campaign"
          ? store.campaigns.find((c) => c.id === l.campaignId)
          : l.targetType === "ad_set"
            ? store.adSets.find((s) => s.id === l.adSetId)
            : l.targetType === "ad"
              ? store.ads.find((a) => a.id === l.adId)
              : l.targetType === "product"
                ? store.products.find((p) => p.id === l.productId)
                : null;
      const account = target && "adAccountId" in target ? store.adAccounts.find((a) => a.id === target.adAccountId) : null;
      return {
        id: l.id,
        dashboardId: l.dashboardId,
        targetType: l.targetType,
        name: target?.name ?? (l.targetType === "dashboard" ? (store.dashboards.find((d) => d.id === l.dashboardId)?.name ?? "Dashboard") : "Item excluído na plataforma"),
        missing: l.targetType !== "dashboard" && !target,
        provider: account?.provider ?? null,
      };
    });
  const metric = getCardMetrics(ctx, [card.id]).get(card.id) ?? null;
  const readOnly = role === "observer" || !!board.closedAt;
  return {
    card: {
      id: card.id,
      number: card.number,
      name: card.name,
      description: card.description,
      descriptionText: card.descriptionText,
      version: card.version,
      listId: card.listId,
      listName: list?.name ?? "",
      startAt: card.startAt,
      dueAt: card.dueAt,
      dueComplete: card.dueComplete,
      dueReminderMinutes: card.dueReminderMinutes,
      dueRecurrence: card.dueRecurrence,
      cover: coverView(card.cover),
      archived: !!card.archivedAt,
      createdAt: card.createdAt,
      labelIds: store.cardLabels.filter((l) => l.cardId === card.id).map((l) => l.labelId),
      memberIds: store.cardMembers.filter((m) => m.cardId === card.id).map((m) => m.userId),
    },
    board: { id: board.id, name: board.name, workspaceId: board.workspaceId },
    lists: listsOfBoard(store, board.id).map((l) => ({ id: l.id, name: l.name })),
    checklists,
    comments,
    activity,
    links,
    // Todos os campos do quadro, com o valor deste card (ou null).
    fields: boardFields(store, board.id).map((field) => ({
      ...field,
      value: store.customFieldValues.find((v) => v.cardId === card.id && v.fieldId === field.id)?.value ?? null,
    })),
    // Mais novos primeiro. Arquivo abre pela rota com conferência de acesso; link, direto.
    attachments: store.attachments
      .filter((a) => a.cardId === card.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .map((a) => ({
        id: a.id,
        kind: a.kind,
        name: a.name,
        href: a.kind === "link" ? a.url! : attachmentUrl(a.id),
        downloadHref: a.kind === "file" ? `${attachmentUrl(a.id)}?baixar=1` : null,
        bytes: a.bytes,
        isImage: isImageAttachment(a),
        isCover: card.cover?.attachmentId === a.id,
        createdAt: a.createdAt,
        uploader: a.uploaderId ? person(store, a.uploaderId) : null,
      })),
    metric,
    canEdit: !readOnly,
    canComment: !board.closedAt && (role !== "observer" || board.prefs.comments === "observers"),
  };
}

export type CardDetail = Awaited<ReturnType<typeof getCardDetail>>;

/** Destinos para mover ou copiar um card: quadros onde o usuário edita, com as listas. */
export async function listWritableLists(ctx: Ctx) {
  return withLiveRead(ctx.user.id, () => writableLists(ctx));
}

function writableLists(ctx: Ctx) {
  const store = readStore();
  return store.boards
    .filter((b) => !b.closedAt)
    .flatMap((b) => {
      const role = boardRole(ctx, b);
      if (!role || role === "observer") return [];
      return listsOfBoard(store, b.id).map((l) => ({ boardId: b.id, boardName: b.name, listId: l.id, listName: l.name }));
    });
}

// ---- menu do quadro (S08): arquivados e atividade --------------------------------------------------

async function getBoardArchiveImpl(ctx: Ctx, boardId: string) {
  const { board } = requireBoard(ctx, boardId);
  const store = readStore();
  return {
    cards: store.cards
      .filter((c) => c.boardId === board.id && c.archivedAt)
      .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""))
      .map((c) => ({ id: c.id, name: c.name, listName: store.lists.find((l) => l.id === c.listId)?.name ?? "", archivedAt: c.archivedAt! })),
    lists: store.lists
      .filter((l) => l.boardId === board.id && l.archivedAt)
      .map((l) => ({ id: l.id, name: l.name, archivedAt: l.archivedAt! })),
    activity: store.activities
      .filter((a) => a.boardId === board.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 60)
      .map((a) => ({
        id: a.id,
        actor: person(store, a.actorId),
        text: activityText(a.type, a.data),
        cardName: a.cardId ? (store.cards.find((c) => c.id === a.cardId)?.name ?? String(a.data.name ?? "")) : null,
        cardId: a.cardId,
        isComment: a.type === "card.comment",
        createdAt: a.createdAt,
      })),
  };
}

// ---- compartilhar (S09) --------------------------------------------------------------------------

async function getBoardSharingImpl(ctx: Ctx, boardId: string) {
  const { board, role } = requireBoard(ctx, boardId);
  const store = readStore();
  const link = store.invites.find((i) => i.boardId === board.id && !i.email && !i.revokedAt && new Date(i.expiresAt).getTime() > Date.now());
  return {
    isAdmin: role === "admin",
    members: store.boardMembers.filter((m) => m.boardId === board.id).map((m) => ({ ...person(store, m.userId), role: m.role })),
    pending: store.invites
      .filter((i) => i.boardId === board.id && i.email && !i.revokedAt && i.usedCount === 0 && new Date(i.expiresAt).getTime() > Date.now())
      .map((i) => ({ id: i.id, email: i.email!, role: i.role, expiresAt: i.expiresAt })),
    linkRole: link?.role ?? null,
    workspaceMembers: store.workspaceMembers
      .filter((m) => m.workspaceId === board.workspaceId)
      .map((m) => person(store, m.userId))
      .filter((p) => !store.boardMembers.some((b) => b.boardId === board.id && b.userId === p.id)),
  };
}

// ---- workspace (S12) --------------------------------------------------------------------------------

export async function getWorkspaceMembers(ctx: Ctx, slug: string) {
  if (isLive()) {
    const data = await workspaceMembersLive(ctx, slug);
    // Quantos quadros cada um participa, entre os que quem olha pode ver.
    const counts = await withLiveRead(ctx.user.id, () => {
      const store = readStore();
      const boards = new Set(store.boards.filter((b) => b.workspaceId === data.workspace.id).map((b) => b.id));
      const count = new Map<string, number>();
      for (const m of store.boardMembers) if (boards.has(m.boardId)) count.set(m.userId, (count.get(m.userId) ?? 0) + 1);
      return count;
    });
    return { ...data, members: data.members.map((m) => ({ ...m, boards: counts.get(m.id) ?? 0 })) };
  }
  const { workspace, role } = await requireWorkspace(ctx, slug);
  const store = readStore();
  const boards = store.boards.filter((b) => b.workspaceId === workspace.id);
  return {
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, description: workspace.description, allowedEmailDomain: workspace.allowedEmailDomain },
    isAdmin: role === "admin",
    members: store.workspaceMembers
      .filter((m) => m.workspaceId === workspace.id)
      .map((m) => {
        const u = store.users.find((x) => x.id === m.userId);
        return {
          ...person(store, m.userId),
          email: u?.email ?? "",
          role: m.role,
          lastActiveAt: u?.lastActiveAt ?? null,
          boards: boards.filter((b) => store.boardMembers.some((bm) => bm.boardId === b.id && bm.userId === m.userId)).length,
          me: m.userId === ctx.user.id,
        };
      }),
    invites: store.invites
      .filter((i) => i.workspaceId === workspace.id && !i.boardId && !i.revokedAt && new Date(i.expiresAt).getTime() > Date.now() && (i.email ? i.usedCount === 0 : true))
      .map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, usedCount: i.usedCount, maxUses: i.maxUses })),
  };
}

// ---- meus cards (S30), busca (S10) e notificações (S11) ----------------------------------------------

async function getMyCardsImpl(ctx: Ctx) {
  const store = readStore();
  const mine = new Set(store.cardMembers.filter((m) => m.userId === ctx.user.id).map((m) => m.cardId));
  const visible = new Map(listBoardsFor(ctx).map((b) => [b.id, b]));
  const metrics = getCardMetrics(ctx, [...mine]);
  return store.cards
    .filter((c) => mine.has(c.id) && !c.archivedAt && visible.has(c.boardId))
    .map((c) => ({
      ...cardFront(store, c, metrics),
      boardId: c.boardId,
      boardName: visible.get(c.boardId)!.name,
      boardBackground: visible.get(c.boardId)!.background,
      listName: store.lists.find((l) => l.id === c.listId)?.name ?? "",
    }));
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

async function searchImpl(ctx: Ctx, q: string) {
  const term = fold(q.trim());
  if (term.length < 2) return { boards: [], cards: [], members: [], labels: [] };
  const store = readStore();
  const boards = listBoardsFor(ctx, true);
  const ids = new Set(boards.map((b) => b.id));
  return {
    boards: boards.filter((b) => fold(b.name).includes(term)).slice(0, 8),
    cards: store.cards
      .filter((c) => ids.has(c.boardId) && (fold(c.name).includes(term) || fold(c.descriptionText).includes(term)))
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        name: c.name,
        boardId: c.boardId,
        boardName: boards.find((b) => b.id === c.boardId)?.name ?? "",
        listName: store.lists.find((l) => l.id === c.listId)?.name ?? "",
        archived: !!c.archivedAt,
      })),
    members: store.workspaceMembers
      .filter((m) => workspaceRole(ctx, m.workspaceId))
      .map((m) => person(store, m.userId))
      .filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i)
      .filter((p) => fold(p.name).includes(term) || fold(p.username ?? "").includes(term)),
    labels: store.labels
      .filter((l) => ids.has(l.boardId) && l.name && fold(l.name).includes(term))
      .map((l) => ({ id: l.id, name: l.name, color: l.color, boardId: l.boardId, boardName: boards.find((b) => b.id === l.boardId)?.name ?? "" })),
  };
}

async function getNotificationsImpl(ctx: Ctx, onlyUnread = false) {
  const store = readStore();
  return store.notifications
    .filter((n) => n.userId === ctx.user.id && (!onlyUnread || !n.readAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50)
    .map((n) => ({
      id: n.id,
      type: n.type,
      actor: person(store, n.actorId),
      cardId: n.cardId,
      boardId: n.boardId,
      boardName: n.boardId ? (store.boards.find((b) => b.id === n.boardId)?.name ?? "") : "",
      data: n.data,
      read: !!n.readAt,
      createdAt: n.createdAt,
    }));
}

export async function getProfile(ctx: Ctx) {
  if (isLive()) {
    const profile = await profileViewLive(ctx.user.id);
    return { ...profile, activity: await withLiveRead(ctx.user.id, () => recentActivityOf(readStore(), ctx.user.id)) };
  }
  const store = readStore();
  const user = store.users.find((u) => u.id === ctx.user.id)!;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    bio: user.bio,
    timezone: user.timezone,
    theme: user.theme,
    avatarColor: user.avatarColor,
    avatarUrl: user.avatarFileId ? fileUrl(user.avatarFileId) : null,
    preferences: user.preferences,
    appearance: appearanceView(user.appearance),
    activity: recentActivityOf(store, user.id),
  };
}

/** As últimas 20 coisas que a pessoa fez (perfil). */
function recentActivityOf(store: Store, userId: string) {
  return store.activities
    .filter((a) => a.actorId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map((a) => ({
      id: a.id,
      text: activityText(a.type, a.data),
      cardName: a.cardId ? (store.cards.find((c) => c.id === a.cardId)?.name ?? null) : null,
      cardId: a.cardId,
      createdAt: a.createdAt,
    }));
}

async function getCardPreviewImpl(ctx: Ctx, cardId: string) {
  const store = readStore();
  const card = store.cards.find((c) => c.id === cardId);
  if (!card) return null;
  requireBoard(ctx, card.boardId);
  return { boardId: card.boardId };
}

// ---- aceitar convite (S02) --------------------------------------------------------------------------

/** Lê o convite pelo token do link (o banco só guarda o hash). Público: não exige login. */
export async function getInviteByToken(token: string, userId: string | null) {
  if (isLive()) return inviteByTokenLive(token, userId);
  const store = readStore();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invite = store.invites.find((i) => i.tokenHash === tokenHash);
  if (!invite) return { status: "invalid" as const };
  const workspace = store.workspaces.find((w) => w.id === invite.workspaceId);
  const board = invite.boardId ? store.boards.find((b) => b.id === invite.boardId) : null;
  const base = {
    workspaceName: workspace?.name ?? "",
    workspaceSlug: workspace?.slug ?? "",
    boardId: board?.id ?? null,
    boardName: board?.name ?? null,
    inviter: person(store, invite.createdBy).name,
    email: invite.email,
    role: invite.role,
  };
  if (invite.revokedAt) return { status: "revoked" as const, ...base };
  if (new Date(invite.expiresAt).getTime() < Date.now()) return { status: "expired" as const, ...base };
  const member = userId
    ? board
      ? store.boardMembers.some((m) => m.boardId === board.id && m.userId === userId)
      : store.workspaceMembers.some((m) => m.workspaceId === invite.workspaceId && m.userId === userId)
    : false;
  if (member) return { status: "member" as const, ...base };
  if (invite.maxUses != null && invite.usedCount >= invite.maxUses) return { status: "used" as const, ...base };
  return { status: "valid" as const, ...base };
}

// ---- modo real (AUTH_MODE=live): as leituras rodam sobre o retrato do Supabase (server/live/scope.ts) ----

export async function getWorkspaceHome(...args: Parameters<typeof getWorkspaceHomeImpl>): ReturnType<typeof getWorkspaceHomeImpl> {
  return withLiveRead(args[0].user.id, () => getWorkspaceHomeImpl(...args));
}

export async function getBoardView(...args: Parameters<typeof getBoardViewImpl>): ReturnType<typeof getBoardViewImpl> {
  return withLiveRead(args[0].user.id, () => getBoardViewImpl(...args), { tracking: true });
}

export async function getCardDetail(...args: Parameters<typeof getCardDetailImpl>): ReturnType<typeof getCardDetailImpl> {
  return withLiveRead(args[0].user.id, () => getCardDetailImpl(...args), { tracking: true });
}

export async function getBoardArchive(...args: Parameters<typeof getBoardArchiveImpl>): ReturnType<typeof getBoardArchiveImpl> {
  return withLiveRead(args[0].user.id, () => getBoardArchiveImpl(...args));
}

export async function getBoardSharing(...args: Parameters<typeof getBoardSharingImpl>): ReturnType<typeof getBoardSharingImpl> {
  return withLiveRead(args[0].user.id, () => getBoardSharingImpl(...args));
}

export async function getMyCards(...args: Parameters<typeof getMyCardsImpl>): ReturnType<typeof getMyCardsImpl> {
  return withLiveRead(args[0].user.id, () => getMyCardsImpl(...args), { tracking: true });
}

export async function search(...args: Parameters<typeof searchImpl>): ReturnType<typeof searchImpl> {
  return withLiveRead(args[0].user.id, () => searchImpl(...args));
}

export async function getNotifications(...args: Parameters<typeof getNotificationsImpl>): ReturnType<typeof getNotificationsImpl> {
  return withLiveRead(args[0].user.id, () => getNotificationsImpl(...args));
}

export async function getCardPreview(...args: Parameters<typeof getCardPreviewImpl>): ReturnType<typeof getCardPreviewImpl> {
  return withLiveRead(args[0].user.id, () => getCardPreviewImpl(...args));
}
