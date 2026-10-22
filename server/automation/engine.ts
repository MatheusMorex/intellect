// Motor de automação (F07 a F09, F17). Roda dentro do mesmo mutate da mudança
// que o disparou, como uma transação: as atividades novas (automationCheckedAt
// nulo) são avaliadas contra as regras do quadro antes de gravar.
//
// Proteção contra loop (architecture.md): cada execução guarda a profundidade
// (até 5) e a sequência de automações que a trouxe até ali; a mesma automação
// não roda duas vezes na mesma sequência. Regra de métrica roda uma vez por
// objeto e janela (dedupeKey).
//
// No backend real isto vira os jobs automation.evaluate / automation.run /
// automation.scheduled / automation.due-date / automation.metric-check.

import { TZDate } from "@date-fns/tz";
import { addDays, endOfMonth, format } from "date-fns";

import type { AutomationAction, BoardAction, CardAction, CardFilter, DueTrigger, MetricTrigger, RuleTrigger, ScheduleTrigger } from "@/lib/automation/schema";
import { fillVariables, isCardAction } from "@/lib/automation/schema";
import { displayFieldValue, parseFieldValue, type FieldValue } from "@/lib/custom-fields";
import { orderBase } from "@/server/data/tracking";
import { appUrl, cardsOfList, insertCard, logActivity, notify, rankBetween, sendEmail, touchBoard, type AutomationActor } from "@/server/kanban/core";
import { makeConverter } from "@/server/fx/convert";
import { dayKeyIn, inRange, todayIn, type DateRange } from "@/server/period";
import { afterMutate, newId, nowIso } from "@/server/store/db";
import type { AutomationRow, AutomationRunRow, CardRow, Store } from "@/server/store/types";

export const MAX_DEPTH = 5;
const DISABLE_AFTER = 3;
const KEEP_RUNS = 1500;
const STALE_MS = 10 * 60_000;

class AutomationError extends Error {}

/** TZDate.toISOString() sai com o fuso (-03:00); o banco guarda tudo em UTC (Z). */
const utc = (d: Date) => new Date(d.getTime()).toISOString();

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

// ---- uma execução ---------------------------------------------------------------------------------------

type RunInput = {
  automation: AutomationRow;
  card: CardRow | null;
  triggerActivityId: string | null;
  depth: number;
  chain: string[];
  dedupeKey: string | null;
  actorName: string;
  extra?: Record<string, string>;
  /** Regra de métrica sem card ligado: cria o card (e o vínculo) dentro da execução. */
  createCard?: { listId: string; name: string; link: { dashboardId: string; level: "campaign" | "ad_set" | "ad"; objectId: string } };
};

// Tabelas que uma execução pode mudar: guardadas para desfazer tudo se der erro no meio.
const KANBAN_TABLES = ["cards", "cardLabels", "cardMembers", "checklists", "checklistItems", "comments", "activities", "notifications", "cardLinks", "outbox"] as const;

function actorOf(store: Store, automation: AutomationRow) {
  if (automation.createdBy && store.users.some((u) => u.id === automation.createdBy)) return automation.createdBy;
  return store.boardMembers.find((m) => m.boardId === automation.boardId && m.role === "admin")?.userId ?? store.users[0].id;
}

export function runAutomation(store: Store, input: RunInput): AutomationRunRow {
  const { automation } = input;
  const run: AutomationRunRow = {
    id: newId(),
    automationId: automation.id,
    boardId: automation.boardId,
    triggerActivityId: input.triggerActivityId,
    cardId: input.card?.id ?? null,
    status: "success",
    dedupeKey: input.dedupeKey,
    depth: input.depth,
    chain: [...input.chain, automation.id],
    message: null,
    operations: 0,
    startedAt: nowIso(),
    finishedAt: null,
  };
  const snapshot = Object.fromEntries(KANBAN_TABLES.map((t) => [t, structuredClone(store[t])])) as Pick<Store, (typeof KANBAN_TABLES)[number]>;
  const boardSnapshot = structuredClone(store.boards.find((b) => b.id === automation.boardId));
  store.automationRuns.push(run);
  const via: AutomationActor = { automationRunId: run.id, automationName: automation.name };
  const actorId = actorOf(store, automation);
  let card = input.card;

  try {
    if (!card && input.createCard) {
      const list = store.lists.find((l) => l.id === input.createCard!.listId && l.boardId === automation.boardId && !l.archivedAt);
      if (!list) throw new AutomationError("A lista onde a automação cria o card não existe mais.");
      card = insertCard(store, automation.boardId, list.id, input.createCard.name.slice(0, 500), actorId, "bottom", via);
      const { dashboardId, level, objectId } = input.createCard.link;
      store.cardLinks.push({
        id: newId(),
        cardId: card.id,
        dashboardId,
        targetType: level,
        campaignId: level === "campaign" ? objectId : null,
        adSetId: level === "ad_set" ? objectId : null,
        adId: level === "ad" ? objectId : null,
        productId: null,
        createdBy: actorId,
        createdAt: nowIso(),
      });
      run.cardId = card.id;
      run.operations++;
    }
    for (const action of automation.actions as unknown as AutomationAction[]) {
      const vars = variables(store, automation, card, input.actorName, input.extra);
      if (isCardAction(action)) {
        if (!card) throw new AutomationError("Esta ação precisa de um card.");
        applyCardAction(store, automation, card, action, via, actorId, vars);
      } else {
        const created = applyBoardAction(store, automation, action, via, actorId, vars);
        if (created) {
          card = created;
          run.cardId = created.id;
        }
      }
      run.operations++;
    }
    automation.failureCount = 0;
    run.message = run.operations === 1 ? "1 ação feita." : `${run.operations} ações feitas.`;
  } catch (error) {
    // Desfaz o que a execução mudou e registra o erro.
    for (const t of KANBAN_TABLES) (store as Record<string, unknown>)[t] = snapshot[t];
    const i = store.boards.findIndex((b) => b.id === automation.boardId);
    if (i >= 0 && boardSnapshot) store.boards[i] = boardSnapshot;
    run.status = "error";
    run.operations = 0;
    run.message = error instanceof AutomationError ? error.message : "Erro inesperado ao rodar a automação.";
    if (!(error instanceof AutomationError)) console.error("[automação]", error);
    automation.failureCount += 1;
    if (automation.failureCount >= DISABLE_AFTER) {
      automation.enabled = false;
      automation.disabledReason = `Desligada depois de ${DISABLE_AFTER} erros seguidos. Último erro: ${run.message}`;
      if (automation.createdBy) {
        notify(store, { userId: automation.createdBy, type: "automation_error", boardId: automation.boardId, cardId: null, actorId: null, data: { automationName: automation.name, error: run.message } });
      }
    }
  }
  run.finishedAt = nowIso();
  if (store.automationRuns.length > KEEP_RUNS) store.automationRuns.splice(0, store.automationRuns.length - KEEP_RUNS);
  touchBoard(store, automation.boardId);
  return run;
}

function skipRun(store: Store, automation: AutomationRow, cardId: string | null, depth: number, chain: string[], message: string, dedupeKey: string | null = null) {
  store.automationRuns.push({
    id: newId(),
    automationId: automation.id,
    boardId: automation.boardId,
    triggerActivityId: null,
    cardId,
    status: "skipped",
    dedupeKey,
    depth,
    chain,
    message,
    operations: 0,
    startedAt: nowIso(),
    finishedAt: nowIso(),
  });
}

function variables(store: Store, automation: AutomationRow, card: CardRow | null, actorName: string, extra: Record<string, string> = {}) {
  const board = store.boards.find((b) => b.id === automation.boardId);
  return {
    cardname: card?.name ?? "",
    cardlink: card ? appUrl(`/c/${card.id}`) : "",
    listname: card ? (store.lists.find((l) => l.id === card.listId)?.name ?? "") : "",
    boardname: board?.name ?? "",
    username: actorName,
    date: format(todayIn(automation.timezone), "dd/MM/yyyy"),
    ...extra,
  };
}

// ---- ações ---------------------------------------------------------------------------------------------

function textDoc(text: string) {
  return { type: "doc", content: text.split("\n").map((line) => ({ type: "paragraph", ...(line ? { content: [{ type: "text", text: line }] } : {}) })) };
}

function applyCardAction(store: Store, automation: AutomationRow, card: CardRow, a: CardAction, via: AutomationActor, actorId: string, vars: Record<string, string>) {
  const board = store.boards.find((b) => b.id === card.boardId)!;
  const fill = (s: string) => fillVariables(s, vars);
  const log = (type: string, data: Record<string, unknown>) => {
    logActivity(store, {
      workspaceId: board.workspaceId,
      boardId: board.id,
      cardId: card.id,
      actorId,
      actorKind: "automation",
      automationRunId: via.automationRunId,
      type,
      data: { ...data, automationName: via.automationName },
    });
    card.lastActivityAt = nowIso();
  };
  const listOk = (listId: string) => {
    const list = store.lists.find((l) => l.id === listId && l.boardId === card.boardId && !l.archivedAt);
    if (!list) throw new AutomationError("A lista escolhida na automação não existe mais (foi arquivada ou excluída).");
    return list;
  };
  const labelOk = (labelId: string) => {
    const label = store.labels.find((l) => l.id === labelId && l.boardId === card.boardId);
    if (!label) throw new AutomationError("A etiqueta escolhida na automação não existe mais.");
    return label;
  };
  const personOk = (userId: string) => {
    const user = store.users.find((u) => u.id === userId);
    const allowed =
      store.boardMembers.some((m) => m.boardId === board.id && m.userId === userId) ||
      (board.visibility === "workspace" && store.workspaceMembers.some((m) => m.workspaceId === board.workspaceId && m.userId === userId));
    if (!user || !allowed) throw new AutomationError("A pessoa escolhida na automação não participa mais deste quadro.");
    return user;
  };

  switch (a.kind) {
    case "move_card": {
      const target = listOk(a.listId);
      const from = store.lists.find((l) => l.id === card.listId);
      const siblings = cardsOfList(store, target.id).filter((c) => c.id !== card.id);
      card.rank = a.position === "top" ? rankBetween(null, siblings[0]?.rank) : rankBetween(siblings.at(-1)?.rank, null);
      if (card.listId !== target.id) {
        card.listId = target.id;
        log("card.moved", { from: from?.name ?? "", to: target.name, fromListId: from?.id ?? null, toListId: target.id });
      } else touchBoard(store, board.id);
      return;
    }
    case "copy_card": {
      const target = listOk(a.listId);
      const copy = insertCard(store, board.id, target.id, card.name, actorId, "bottom", via);
      copy.description = card.description;
      copy.descriptionText = card.descriptionText;
      copy.dueAt = card.dueAt;
      for (const l of store.cardLabels.filter((x) => x.cardId === card.id)) store.cardLabels.push({ id: newId(), cardId: copy.id, labelId: l.labelId });
      for (const m of store.cardMembers.filter((x) => x.cardId === card.id)) store.cardMembers.push({ id: newId(), cardId: copy.id, userId: m.userId, createdAt: nowIso() });
      return;
    }
    case "archive_card":
      if (!card.archivedAt) {
        card.archivedAt = nowIso();
        log("card.archived", {});
      }
      return;
    case "add_label":
    case "remove_label": {
      const label = labelOk(a.labelId);
      const exists = store.cardLabels.some((l) => l.cardId === card.id && l.labelId === label.id);
      if (a.kind === "add_label" && !exists) {
        store.cardLabels.push({ id: newId(), cardId: card.id, labelId: label.id });
        log("card.label", { added: true, name: label.name, color: label.color, labelId: label.id });
      }
      if (a.kind === "remove_label" && exists) {
        store.cardLabels = store.cardLabels.filter((l) => !(l.cardId === card.id && l.labelId === label.id));
        log("card.label", { added: false, name: label.name, color: label.color, labelId: label.id });
      }
      return;
    }
    case "add_member":
    case "remove_member": {
      const user = personOk(a.userId);
      const exists = store.cardMembers.some((m) => m.cardId === card.id && m.userId === user.id);
      if (a.kind === "add_member" && !exists) {
        store.cardMembers.push({ id: newId(), cardId: card.id, userId: user.id, createdAt: nowIso() });
        log("card.member", { added: true, name: user.name, userId: user.id });
        notify(store, { userId: user.id, type: "assigned", boardId: board.id, cardId: card.id, actorId, data: { cardName: card.name } });
      }
      if (a.kind === "remove_member" && exists) {
        store.cardMembers = store.cardMembers.filter((m) => !(m.cardId === card.id && m.userId === user.id));
        log("card.member", { added: false, name: user.name, userId: user.id });
      }
      return;
    }
    case "set_due": {
      const day = addDays(todayIn(automation.timezone), a.days);
      card.dueAt = utc(new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), 18, 0, 0, automation.timezone));
      card.dueComplete = false;
      log("card.due", { dueAt: card.dueAt });
      return;
    }
    case "remove_due":
      if (card.dueAt) {
        card.dueAt = null;
        card.dueComplete = false;
        log("card.due", { dueAt: null });
      }
      return;
    case "complete_due":
      if (!card.dueComplete) {
        card.dueComplete = true;
        log("card.completed", { done: true });
      }
      return;
    case "add_checklist": {
      const last = store.checklists.filter((c) => c.cardId === card.id).sort((x, y) => (x.rank < y.rank ? -1 : 1)).at(-1);
      const checklist = { id: newId(), cardId: card.id, name: fill(a.name).slice(0, 200), rank: rankBetween(last?.rank, null), hideChecked: false, createdAt: nowIso() };
      store.checklists.push(checklist);
      let rank: string | null = null;
      for (const item of a.items) {
        rank = rankBetween(rank, null);
        store.checklistItems.push({ id: newId(), checklistId: checklist.id, name: fill(item).slice(0, 500), rank, completedAt: null, dueAt: null, assigneeId: null, createdAt: nowIso() });
      }
      log("card.checklist", { name: checklist.name });
      return;
    }
    case "add_comment": {
      const text = fill(a.text).slice(0, 16384);
      store.comments.push({ id: newId(), cardId: card.id, authorId: actorId, body: textDoc(text), bodyText: text, mentions: [], automationName: via.automationName, editedAt: null, createdAt: nowIso() });
      log("card.comment", { excerpt: text.slice(0, 140) });
      for (const m of store.cardMembers.filter((x) => x.cardId === card.id)) {
        notify(store, { userId: m.userId, type: "comment", boardId: board.id, cardId: card.id, actorId, data: { cardName: card.name, excerpt: text.slice(0, 140) } });
      }
      return;
    }
    case "set_field": {
      const field = store.customFields.find((f) => f.id === a.fieldId && f.boardId === card.boardId);
      if (!field) throw new AutomationError("O campo escolhido na automação não existe mais.");
      const parsed = parseFieldValue(field, typeof a.value === "string" ? fill(a.value) : a.value);
      if (!parsed.ok) throw new AutomationError(parsed.error);
      const row = store.customFieldValues.find((v) => v.cardId === card.id && v.fieldId === field.id);
      if ((row?.value ?? null) === parsed.value) return;
      if (parsed.value === null) store.customFieldValues = store.customFieldValues.filter((v) => v !== row);
      else if (row) row.value = parsed.value;
      else store.customFieldValues.push({ id: newId(), cardId: card.id, fieldId: field.id, value: parsed.value, createdAt: nowIso() });
      log("card.field", { fieldId: field.id, name: field.name, value: parsed.value === null ? null : displayFieldValue(field, parsed.value), raw: parsed.value });
      return;
    }
    case "rename_card": {
      const value = fill(a.name).replace(/\s+/g, " ").trim().slice(0, 500);
      if (value && value !== card.name) {
        card.name = value;
        log("card.renamed", { name: value });
      }
      return;
    }
  }
}

function applyBoardAction(store: Store, automation: AutomationRow, a: BoardAction, via: AutomationActor, actorId: string, vars: Record<string, string>): CardRow | null {
  const board = store.boards.find((b) => b.id === automation.boardId)!;
  const listOk = (listId: string) => {
    const list = store.lists.find((l) => l.id === listId && l.boardId === board.id && !l.archivedAt);
    if (!list) throw new AutomationError("A lista escolhida na automação não existe mais (foi arquivada ou excluída).");
    return list;
  };
  const log = (card: CardRow, type: string, data: Record<string, unknown>) => {
    logActivity(store, { workspaceId: board.workspaceId, boardId: board.id, cardId: card.id, actorId, actorKind: "automation", automationRunId: via.automationRunId, type, data: { ...data, automationName: via.automationName } });
    card.lastActivityAt = nowIso();
  };
  switch (a.kind) {
    case "create_card": {
      const list = listOk(a.listId);
      const name = fillVariables(a.name, vars).replace(/\s+/g, " ").trim().slice(0, 500) || "Card sem nome";
      return insertCard(store, board.id, list.id, name, actorId, "bottom", via);
    }
    case "move_list_cards": {
      const from = listOk(a.fromListId);
      const to = listOk(a.toListId);
      if (from.id === to.id) return null;
      let last = cardsOfList(store, to.id).at(-1)?.rank ?? null;
      for (const card of cardsOfList(store, from.id)) {
        card.listId = to.id;
        card.rank = rankBetween(last, null);
        last = card.rank;
        log(card, "card.moved", { from: from.name, to: to.name, fromListId: from.id, toListId: to.id });
      }
      return null;
    }
    case "archive_list_cards": {
      const list = listOk(a.listId);
      for (const card of cardsOfList(store, list.id)) {
        card.archivedAt = nowIso();
        log(card, "card.archived", {});
      }
      return null;
    }
  }
}

// ---- regras por evento ----------------------------------------------------------------------------------

type CardEvent =
  | { kind: "card_created"; listId: string }
  | { kind: "card_moved"; toListId: string; fromListId: string | null }
  | { kind: "card_archived" }
  | { kind: "label_added"; labelId: string | null }
  | { kind: "member_added"; userId: string | null }
  | { kind: "due_completed" }
  | { kind: "checklist_completed" }
  | { kind: "comment_added"; text: string }
  | { kind: "field_changed"; fieldId: string; value: FieldValue | null };

function eventOf(store: Store, type: string, data: Record<string, unknown>, card: CardRow): CardEvent | null {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  switch (type) {
    case "card.created":
      return { kind: "card_created", listId: str(data.listId) ?? card.listId };
    case "card.moved":
      return { kind: "card_moved", toListId: str(data.toListId) ?? card.listId, fromListId: str(data.fromListId) };
    case "card.archived":
      return { kind: "card_archived" };
    case "card.label":
      return data.added ? { kind: "label_added", labelId: str(data.labelId) } : null;
    case "card.member":
      return data.added ? { kind: "member_added", userId: str(data.userId) } : null;
    case "card.completed":
      return data.done ? { kind: "due_completed" } : null;
    case "card.item": {
      if (!data.done) return null;
      const items = store.checklistItems.filter((i) => i.checklistId === data.checklistId);
      return items.length > 0 && items.every((i) => i.completedAt) ? { kind: "checklist_completed" } : null;
    }
    case "card.comment":
      return { kind: "comment_added", text: String(data.excerpt ?? "") };
    case "card.field":
      return { kind: "field_changed", fieldId: str(data.fieldId) ?? "", value: (data.raw ?? null) as FieldValue | null };
  }
  return null;
}

function triggerMatches(t: RuleTrigger, e: CardEvent) {
  if (t.kind !== e.kind) return false;
  switch (t.kind) {
    case "card_created":
      return !t.listId || t.listId === (e as { listId: string }).listId;
    case "card_moved": {
      const m = e as { toListId: string; fromListId: string | null };
      return (!t.toListId || t.toListId === m.toListId) && (!t.fromListId || t.fromListId === m.fromListId);
    }
    case "label_added":
      return !t.labelId || t.labelId === (e as { labelId: string | null }).labelId;
    case "member_added":
      return !t.userId || t.userId === (e as { userId: string | null }).userId;
    case "comment_added":
      return !t.contains || fold((e as { text: string }).text).includes(fold(t.contains));
    case "field_changed": {
      const f = e as { fieldId: string; value: FieldValue | null };
      if (t.fieldId !== f.fieldId) return false;
      if (t.value == null) return true;
      // Texto sem diferenciar maiúscula e acento; número, data, caixa e opção pelo valor.
      return typeof t.value === "string" && typeof f.value === "string" ? fold(t.value) === fold(f.value) : t.value === f.value;
    }
    default:
      return true;
  }
}

export function filtersPass(store: Store, card: CardRow, filters: CardFilter[]) {
  return filters.every((f) => {
    switch (f.kind) {
      case "in_list":
        return card.listId === f.listId;
      case "has_label":
        return store.cardLabels.some((l) => l.cardId === card.id && l.labelId === f.labelId);
      case "not_label":
        return !store.cardLabels.some((l) => l.cardId === card.id && l.labelId === f.labelId);
      case "has_member":
        return store.cardMembers.some((m) => m.cardId === card.id && m.userId === f.userId);
      case "name_contains":
        return fold(card.name).includes(fold(f.text));
    }
  });
}

/** Avalia as atividades novas. Roda no fim de cada mutate, antes de gravar. */
export function evaluatePending(store: Store) {
  if (!store.automations) return;
  // As ações das regras geram atividades novas; repete até não sobrar nenhuma (a profundidade limita).
  for (let round = 0; round < 50; round++) {
    const fresh = [];
    for (let i = store.activities.length - 1; i >= 0; i--) {
      if (store.activities[i].automationCheckedAt !== null) break;
      fresh.push(store.activities[i]);
    }
    if (fresh.length === 0) return;
    const checkedAt = nowIso();
    for (const act of fresh.reverse()) {
      act.automationCheckedAt = checkedAt;
      if (Date.now() - Date.parse(act.createdAt) > STALE_MS || !act.boardId || !act.cardId) continue;
      const rules = store.automations.filter((a) => a.boardId === act.boardId && a.enabled && a.type === "rule");
      if (rules.length === 0) continue;
      const card = store.cards.find((c) => c.id === act.cardId);
      if (!card) continue;
      const event = eventOf(store, act.type, act.data, card);
      if (!event) continue;
      const parent = act.automationRunId ? store.automationRuns.find((r) => r.id === act.automationRunId) : undefined;
      const depth = parent ? parent.depth + 1 : 0;
      const chain = parent?.chain ?? [];
      const actorName = act.actorKind === "automation" ? `Automação ${String(act.data.automationName ?? "")}` : (store.users.find((u) => u.id === act.actorId)?.name ?? "");
      for (const rule of rules) {
        if (!rule.enabled || !triggerMatches(rule.trigger as RuleTrigger, event)) continue;
        if (card.archivedAt && event.kind !== "card_archived") continue;
        if (!filtersPass(store, card, rule.filters as CardFilter[])) continue;
        if (chain.includes(rule.id)) {
          skipRun(store, rule, card.id, depth, chain, "Não rodou de novo: ela já tinha rodado nesta mesma sequência (proteção contra loop).");
          continue;
        }
        if (depth > MAX_DEPTH) {
          skipRun(store, rule, card.id, depth, chain, `Parou: a sequência de automações passou de ${MAX_DEPTH} passos (proteção contra loop).`);
          continue;
        }
        runAutomation(store, { automation: rule, card, triggerActivityId: act.id, depth, chain, dedupeKey: null, actorName });
      }
    }
  }
}

afterMutate(evaluatePending);

// ---- botões --------------------------------------------------------------------------------------------

export function runButton(store: Store, automation: AutomationRow, card: CardRow | null, actorName: string) {
  if (automation.type === "card_button" && card && !filtersPass(store, card, automation.filters as CardFilter[])) {
    skipRun(store, automation, card.id, 0, [], "O card não passou nos filtros do botão.");
    return store.automationRuns.at(-1)!;
  }
  return runAutomation(store, { automation, card, triggerActivityId: null, depth: 0, chain: [], dedupeKey: null, actorName });
}

// ---- métrica ----------------------------------------------------------------------------------------------

function windowRange(win: MetricTrigger["window"], timezone: string, now: Date): DateRange {
  const today = todayIn(timezone, now);
  const k = (d: Date) => format(d, "yyyy-MM-dd");
  const back = { today: 0, yesterday: 1, "3d": 2, "7d": 6, "14d": 13, "30d": 29 }[win];
  if (win === "yesterday") return { from: k(addDays(today, -1)), to: k(addDays(today, -1)) };
  return { from: k(addDays(today, -back)), to: k(today) };
}

export type MetricObject = { id: string; name: string; values: Record<"roas" | "cpa" | "spend" | "revenue" | "sales", number | null> };

/** Números de cada campanha, conjunto ou anúncio do dashboard na janela da regra. */
export function metricObjects(store: Store, t: MetricTrigger, now: Date): { objects: MetricObject[]; range: DateRange } {
  const dashboard = store.dashboards.find((d) => d.id === t.dashboardId);
  if (!dashboard) throw new AutomationError("O dashboard desta automação não existe mais.");
  const accountIds = new Set(store.dashboardAdAccounts.filter((l) => l.dashboardId === dashboard.id).map((l) => l.adAccountId));
  const provider = new Map(store.adAccounts.map((a) => [a.id, a.provider]));
  const pool: { id: string; name: string; adAccountId: string; status: string }[] = t.level === "campaign" ? store.campaigns : t.level === "ad_set" ? store.adSets : store.ads;
  const chosen = pool.filter(
    (o) =>
      accountIds.has(o.adAccountId) &&
      (t.status === "any" || o.status === t.status) &&
      (t.provider === "any" || provider.get(o.adAccountId) === t.provider) &&
      (!t.nameContains || fold(o.name).includes(fold(t.nameContains))),
  );
  const ids = new Set(chosen.map((o) => o.id));
  const range = windowRange(t.window, dashboard.timezone, now);
  const keyOf = (r: { campaignId: string | null; adSetId: string | null; adId: string | null }) => (t.level === "campaign" ? r.campaignId : t.level === "ad_set" ? r.adSetId : r.adId);
  // Tudo na moeda do dashboard, pelas cotações guardadas (o Resumo busca as que faltam).
  const fx = makeConverter(store.fxRates, dashboard.currency);
  const toDashboard = (cents: number, currency: string, day: string) => fx.cents(cents, currency, day) ?? 0;
  const spend = new Map<string, number>();
  for (const i of store.adInsightsDaily) {
    const k = keyOf(i);
    if (k && ids.has(k) && inRange(i.date, range)) spend.set(k, (spend.get(k) ?? 0) + toDashboard(i.spendCents, i.currency, i.date));
  }
  const storeIds = new Set(store.dashboardStores.filter((l) => l.dashboardId === dashboard.id).map((l) => l.storeId));
  const revenue = new Map<string, number>();
  const sales = new Map<string, number>();
  for (const o of store.orders) {
    if (!storeIds.has(o.storeId) || o.isTest || o.status !== "paid") continue;
    const k = keyOf(o);
    const day = dayKeyIn(o.placedAt, dashboard.timezone);
    if (!k || !ids.has(k) || !inRange(day, range)) continue;
    revenue.set(k, (revenue.get(k) ?? 0) + toDashboard(orderBase(o, dashboard), o.currency, day));
    sales.set(k, (sales.get(k) ?? 0) + 1);
  }
  // Agir em cima de número convertido pela metade seria pior do que não agir.
  if (fx.misses() > 0) throw new AutomationError("Faltou a cotação de alguma moeda para converter os valores. A regra roda de novo na próxima vez.");
  const objects = chosen.map((o) => {
    const s = spend.get(o.id) ?? 0;
    const r = revenue.get(o.id) ?? 0;
    const n = sales.get(o.id) ?? 0;
    return { id: o.id, name: o.name, values: { spend: s / 100, revenue: r / 100, sales: n, roas: s > 0 ? r / s : null, cpa: n > 0 ? s / n / 100 : null } };
  });
  return { objects, range };
}

export function conditionsMet(t: MetricTrigger, o: MetricObject) {
  return t.conditions.every((c) => {
    const v = o.values[c.metric];
    if (v == null) return false;
    return c.op === "gt" ? v > c.value : v < c.value;
  });
}

const money = (value: number, currency: string) => value.toLocaleString("pt-BR", { style: "currency", currency });

/** Roda uma regra de métrica: cada objeto que bate as condições aciona os cards ligados a ele. */
export function runMetricAutomation(store: Store, automation: AutomationRow, now: Date) {
  const t = automation.trigger as unknown as MetricTrigger;
  automation.nextRunAt = new Date(now.getTime() + t.everyMinutes * 60_000).toISOString();
  let result: { objects: MetricObject[]; range: DateRange };
  try {
    result = metricObjects(store, t, now);
  } catch (error) {
    skipRun(store, automation, null, 0, [], error instanceof Error ? error.message : "Erro ao calcular as métricas.");
    return { matched: 0, runs: 0 };
  }
  const matched = result.objects.filter((o) => conditionsMet(t, o));
  let runs = 0;
  for (const o of matched) {
    const windowKey = `${automation.id}:${o.id}:${result.range.from}:${result.range.to}`;
    const currency = store.dashboards.find((d) => d.id === t.dashboardId)?.currency ?? "BRL";
    const extra = {
      campaign: o.name,
      roas: (o.values.roas ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      spend: money(o.values.spend ?? 0, currency),
    };
    const targetKey = t.level === "campaign" ? "campaignId" : t.level === "ad_set" ? "adSetId" : "adId";
    const cards = store.cardLinks
      .filter((l) => l.dashboardId === t.dashboardId && l.targetType === t.level && l[targetKey] === o.id)
      .map((l) => store.cards.find((c) => c.id === l.cardId && c.boardId === automation.boardId && !c.archivedAt))
      .filter((c): c is CardRow => !!c);
    if (cards.length === 0) {
      const key = `${windowKey}:novo`;
      if (store.automationRuns.some((r) => r.automationId === automation.id && r.dedupeKey === key)) continue;
      if (!t.createInListId) {
        skipRun(store, automation, null, 0, [], `${o.name} bateu as condições, mas não tem card ligado neste quadro.`, key);
        continue;
      }
      runAutomation(store, {
        automation,
        card: null,
        triggerActivityId: null,
        depth: 0,
        chain: [],
        dedupeKey: key,
        actorName: "Automação",
        extra,
        createCard: { listId: t.createInListId, name: o.name, link: { dashboardId: t.dashboardId, level: t.level, objectId: o.id } },
      });
      runs++;
      continue;
    }
    for (const card of [...new Set(cards)]) {
      const key = `${windowKey}:${card.id}`;
      if (store.automationRuns.some((r) => r.automationId === automation.id && r.dedupeKey === key)) continue;
      runAutomation(store, { automation, card, triggerActivityId: null, depth: 0, chain: [], dedupeKey: key, actorName: "Automação", extra });
      runs++;
    }
  }
  return { matched: matched.length, runs };
}

// ---- agendadas, por prazo e lembretes (o "relógio") ----------------------------------------------------------

export function nextScheduleRun(t: ScheduleTrigger, timezone: string, from: Date): string {
  const [h, m] = t.time.split(":").map(Number);
  const today = todayIn(timezone, from);
  for (let i = 0; i < 400; i++) {
    const day = addDays(today, i);
    const candidate = new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, timezone);
    if (candidate.getTime() <= from.getTime()) continue;
    const weekday = candidate.getDay();
    if (t.every === "weekday" && (weekday === 0 || weekday === 6)) continue;
    if (t.every === "week" && weekday !== t.weekday) continue;
    if (t.every === "month" && candidate.getDate() !== Math.min(t.monthDay, endOfMonth(candidate).getDate())) continue;
    return utc(candidate);
  }
  return new Date(from.getTime() + 86_400_000).toISOString();
}

function dueFireAt(t: DueTrigger, dueAt: string) {
  const ms = t.amount * (t.unit === "hours" ? 3_600_000 : 86_400_000);
  return Date.parse(dueAt) + (t.when === "before" ? -ms : ms);
}

type Work = { metric: AutomationRow[]; scheduled: AutomationRow[]; due: { automation: AutomationRow; card: CardRow; key: string }[]; reminders: CardRow[] };

/** O que está vencido agora. Só lê: o relógio só grava quando há algo a fazer. */
export function dueWork(store: Store, now: Date): Work {
  const t = now.getTime();
  const enabled = (store.automations ?? []).filter((a) => a.enabled);
  const work: Work = { metric: [], scheduled: [], due: [], reminders: [] };
  for (const a of enabled) {
    if (a.type === "metric" && (!a.nextRunAt || Date.parse(a.nextRunAt) <= t)) work.metric.push(a);
    if (a.type === "scheduled" && a.nextRunAt && Date.parse(a.nextRunAt) <= t) work.scheduled.push(a);
    if (a.type === "due_date") {
      const trig = a.trigger as unknown as DueTrigger;
      for (const card of store.cards) {
        if (card.boardId !== a.boardId || !card.dueAt || card.archivedAt || (trig.when === "before" && card.dueComplete)) continue;
        const fireAt = dueFireAt(trig, card.dueAt);
        // Só o que venceu nas últimas 24 h: regra nova não dispara para prazos antigos.
        if (fireAt > t || t - fireAt > 86_400_000 || fireAt < Date.parse(a.createdAt)) continue;
        const key = `${a.id}:${card.id}:${card.dueAt}`;
        if (store.automationRuns.some((r) => r.automationId === a.id && r.dedupeKey === key)) continue;
        if (!filtersPass(store, card, a.filters as CardFilter[])) continue;
        work.due.push({ automation: a, card, key });
      }
    }
  }
  for (const card of store.cards) {
    if (!card.dueAt || card.dueComplete || card.archivedAt || card.dueReminderMinutes == null) continue;
    const remindAt = Date.parse(card.dueAt) - card.dueReminderMinutes * 60_000;
    if (remindAt > t || t - remindAt > 86_400_000) continue;
    if (store.notifications.some((n) => n.type === "due_soon" && n.cardId === card.id && n.data.dueAt === card.dueAt)) continue;
    work.reminders.push(card);
  }
  return work;
}

export function hasWork(w: Work) {
  return w.metric.length + w.scheduled.length + w.due.length + w.reminders.length > 0;
}

/** Faz o trabalho vencido (dentro de um mutate). */
export function runDueWork(store: Store, now: Date) {
  const w = dueWork(store, now);
  for (const a of w.metric) runMetricAutomation(store, a, now);
  for (const a of w.scheduled) {
    const trig = a.trigger as unknown as ScheduleTrigger;
    const key = `${a.id}:${a.nextRunAt}`;
    a.nextRunAt = nextScheduleRun(trig, a.timezone, now);
    if (!store.automationRuns.some((r) => r.automationId === a.id && r.dedupeKey === key)) {
      runAutomation(store, { automation: a, card: null, triggerActivityId: null, depth: 0, chain: [], dedupeKey: key, actorName: "Automação" });
    }
  }
  for (const { automation, card, key } of w.due) {
    runAutomation(store, { automation, card, triggerActivityId: null, depth: 0, chain: [], dedupeKey: key, actorName: "Automação" });
  }
  for (const card of w.reminders) {
    const members = store.cardMembers.filter((m) => m.cardId === card.id);
    for (const m of members) {
      notify(store, { userId: m.userId, type: "due_soon", boardId: card.boardId, cardId: card.id, actorId: null, data: { cardName: card.name, dueAt: card.dueAt } });
      const user = store.users.find((u) => u.id === m.userId);
      if (user?.preferences.emailNotifications === "instant") {
        sendEmail(store, user.email, `Prazo chegando: ${card.name}`, `O card "${card.name}" vence em breve.`, appUrl(`/c/${card.id}`));
      }
    }
    // Sem membros: o aviso vai para quem criou o card.
    if (members.length === 0 && card.createdBy) {
      notify(store, { userId: card.createdBy, type: "due_soon", boardId: card.boardId, cardId: card.id, actorId: null, data: { cardName: card.name, dueAt: card.dueAt } });
    }
  }
  return w;
}
