import assert from "node:assert/strict";
import { test } from "node:test";

import { conditionsMet, dueWork, evaluatePending, metricObjects, nextScheduleRun, runButton, runDueWork, runMetricAutomation } from "../server/automation/engine.ts";
import { logActivity } from "../server/kanban/core.ts";
import { createSeed } from "../server/store/seed.ts";
import type { AutomationRow, Store } from "../server/store/types.ts";
import type { MetricTrigger } from "../lib/automation/schema.ts";

const fresh = () => createSeed(new Date());
const board = (s: Store) => s.boards[0];
const list = (s: Store, name: string) => s.lists.find((l) => l.boardId === board(s).id && l.name === name)!;
const card = (s: Store, name: string) => s.cards.find((c) => c.name === name)!;
const ana = (s: Store) => s.users[0];
const auto = (s: Store, name: string) => s.automations.find((a) => a.name === name)!;

function move(s: Store, cardName: string, to: string) {
  const c = card(s, cardName);
  const from = s.lists.find((l) => l.id === c.listId)!;
  const target = list(s, to);
  c.listId = target.id;
  logActivity(s, { workspaceId: board(s).workspaceId, boardId: board(s).id, cardId: c.id, actorId: ana(s).id, type: "card.moved", data: { from: from.name, to, fromListId: from.id, toListId: target.id } });
}

function rule(s: Store, name: string, trigger: Record<string, unknown>, actions: Record<string, unknown>[]): AutomationRow {
  const row: AutomationRow = {
    id: crypto.randomUUID(),
    boardId: board(s).id,
    type: "rule",
    name,
    trigger,
    filters: [],
    actions,
    enabled: true,
    timezone: "America/Sao_Paulo",
    nextRunAt: null,
    dashboardId: null,
    createdBy: ana(s).id,
    failureCount: 0,
    disabledReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  s.automations.push(row);
  return row;
}

test("regra: card movido para Feito conclui o prazo e comenta com as variáveis", () => {
  const s = fresh();
  move(s, "Escalar o Remarketing 30d", "Feito");
  evaluatePending(s);
  const c = card(s, "Escalar o Remarketing 30d");
  assert.equal(c.dueComplete, true);
  const comment = s.comments.find((x) => x.cardId === c.id && x.automationName === "Concluir ao chegar em Feito");
  assert.ok(comment, "deveria ter o comentário da automação");
  assert.match(comment.bodyText, /^Concluído por Ana Lima em \d{2}\/\d{2}\/\d{4}\.$/);
  assert.equal(s.automationRuns.at(-1)!.status, "success");
});

test("regra: mover para outra lista não dispara", () => {
  const s = fresh();
  move(s, "Escalar o Remarketing 30d", "A fazer");
  evaluatePending(s);
  assert.equal(card(s, "Escalar o Remarketing 30d").dueComplete, false);
  assert.equal(s.automationRuns.length, 0);
});

test("loop: duas regras que se chamam param na proteção", () => {
  const s = fresh();
  rule(s, "Vai", { kind: "card_moved", toListId: list(s, "A fazer").id, fromListId: null }, [{ kind: "move_card", listId: list(s, "Em andamento").id, position: "top" }]);
  rule(s, "Volta", { kind: "card_moved", toListId: list(s, "Em andamento").id, fromListId: null }, [{ kind: "move_card", listId: list(s, "A fazer").id, position: "top" }]);
  move(s, "Testar frete grátis acima de R$ 200", "A fazer");
  evaluatePending(s);
  const runs = s.automationRuns.filter((r) => ["Vai", "Volta"].includes(s.automations.find((a) => a.id === r.automationId)!.name));
  assert.deepEqual(
    runs.map((r) => r.status),
    ["success", "success", "skipped"],
  );
  assert.match(runs[2].message!, /loop/);
  assert.equal(card(s, "Testar frete grátis acima de R$ 200").listId, list(s, "A fazer").id);
});

test("erro: desfaz as ações da execução e desliga depois de 3 erros seguidos", () => {
  const s = fresh();
  const urgente = s.labels.find((l) => l.name === "Urgente")!;
  const archived = list(s, "Ideias");
  const r = rule(s, "Quebrada", { kind: "card_moved", toListId: list(s, "A fazer").id, fromListId: null }, [
    { kind: "add_label", labelId: urgente.id },
    { kind: "move_card", listId: archived.id, position: "top" },
  ]);
  archived.archivedAt = new Date().toISOString();
  for (const name of ["Testar frete grátis acima de R$ 200", "Roteiro de vídeo com depoimento de cliente", "Criar público semelhante a partir dos compradores de 90 dias"]) {
    move(s, name, "A fazer");
    evaluatePending(s);
    const c = card(s, name);
    assert.ok(!s.cardLabels.some((l) => l.cardId === c.id && l.labelId === urgente.id), "a etiqueta deveria ter sido desfeita");
  }
  const runs = s.automationRuns.filter((x) => x.automationId === r.id);
  assert.deepEqual(
    runs.map((x) => x.status),
    ["error", "error", "error"],
  );
  assert.equal(r.enabled, false);
  assert.match(r.disabledReason!, /3 erros/);
  assert.ok(s.notifications.some((n) => n.type === "automation_error" && n.userId === ana(s).id));
});

test("métrica: age nos cards ligados ao que bate e só uma vez por janela", () => {
  const s = fresh();
  const a = auto(s, "ROAS baixo nos últimos 7 dias");
  const t = a.trigger as unknown as MetricTrigger;
  const now = new Date();
  const matched = metricObjects(s, t, now).objects.filter((o) => conditionsMet(t, o));
  assert.ok(matched.length > 0, "o seed deveria ter campanha com ROAS abaixo de 2");
  const first = runMetricAutomation(s, a, now);
  assert.equal(first.matched, matched.length);
  const urgente = s.labels.find((l) => l.name === "Urgente")!;
  const linked = s.cardLinks.filter((l) => l.targetType === "campaign" && matched.some((o) => o.id === l.campaignId)).map((l) => l.cardId);
  for (const cardId of linked) assert.ok(s.cardLabels.some((l) => l.cardId === cardId && l.labelId === urgente.id));
  const second = runMetricAutomation(s, a, now);
  assert.equal(second.runs, 0, "não deveria rodar de novo na mesma janela");
});

test("métrica: sem card ligado, cria o card na lista escolhida", () => {
  const s = fresh();
  const a = auto(s, "ROAS baixo nos últimos 7 dias");
  (a.trigger as Record<string, unknown>).createInListId = list(s, "Ideias").id;
  const before = s.cards.length;
  runMetricAutomation(s, a, new Date());
  const created = s.cards.slice(before);
  assert.ok(created.length > 0);
  for (const c of created) assert.ok(s.cardLinks.some((l) => l.cardId === c.id && l.targetType === "campaign"));
});

test("programada: próxima execução no fuso e no dia certos", () => {
  const tz = "America/Sao_Paulo";
  const weekly = { kind: "schedule" as const, every: "week" as const, time: "09:00", weekday: 1, monthDay: 1 };
  assert.equal(nextScheduleRun(weekly, tz, new Date("2026-10-13T15:00:00Z")), "2026-10-19T12:00:00.000Z");
  const monthly = { ...weekly, every: "month" as const, monthDay: 31 };
  assert.equal(nextScheduleRun(monthly, tz, new Date("2026-11-02T12:00:00Z")), "2026-11-30T12:00:00.000Z");
  const weekdays = { ...weekly, every: "weekday" as const };
  assert.equal(nextScheduleRun(weekdays, tz, new Date("2026-10-16T13:00:00Z")), "2026-10-19T12:00:00.000Z");
});

test("botão do card: coloca o Bruno, move e comenta", () => {
  const s = fresh();
  const c = card(s, "Testar frete grátis acima de R$ 200");
  const bruno = s.users[1];
  runButton(s, auto(s, "Pedir revisão"), c, "Ana Lima");
  evaluatePending(s);
  assert.ok(s.cardMembers.some((m) => m.cardId === c.id && m.userId === bruno.id));
  assert.equal(c.listId, list(s, "Em andamento").id);
  assert.ok(s.notifications.some((n) => n.type === "assigned" && n.userId === bruno.id && n.cardId === c.id));
});

test("lembrete de prazo avisa os membros uma vez", () => {
  const s = fresh();
  const c = card(s, "Escalar o Remarketing 30d");
  c.dueAt = new Date(Date.now() + 30 * 60_000).toISOString();
  c.dueReminderMinutes = 60;
  const now = new Date();
  assert.ok(dueWork(s, now).reminders.some((x) => x.id === c.id));
  runDueWork(s, now);
  const count = () => s.notifications.filter((n) => n.type === "due_soon" && n.cardId === c.id).length;
  const first = count();
  assert.ok(first >= 1);
  runDueWork(s, now);
  assert.equal(count(), first);
});
