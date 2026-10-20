// Etapa 3 da troca para o Supabase: as automações no modo real. Regras, botões,
// proteção contra loop e o relógio (agendadas, prazos e lembretes) rodam contra
// o projeto de TESTE (nunca o principal); cada resultado é conferido no banco.
// Rodam com `npm run test:live`. No fim, tudo o que o teste criou é apagado.

/* eslint-disable @typescript-eslint/no-explicit-any -- linhas cruas do banco, conferidas campo a campo */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { register } from "node:module";
import { after, before, describe, test } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { SessionUser } from "../../server/auth/session.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const enabled = Boolean(url && secret && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
// Trava de segurança: estes testes criam e apagam dados.
const isTestProject = (url ?? "").includes("aqaijwpnudhftlxwsfdm");

process.env.AUTH_MODE = "live";
register("./stubs.mjs", import.meta.url);

const run = crypto.randomUUID().slice(0, 8);
const MIN = 60_000;

describe("automações no Supabase (etapa 3)", { skip: !enabled || !isTestProject ? "sem .env.test.local do projeto de teste" : false }, () => {
  const admin = enabled ? createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } }) : (null as unknown as SupabaseClient);
  const people = {} as Record<"ana" | "bia", SessionUser>;
  let workspaceId = "";

  let m: {
    kanban: typeof import("../../server/actions/kanban.ts");
    cards: typeof import("../../server/actions/cards.ts");
    automation: typeof import("../../server/actions/automation.ts");
    data: typeof import("../../server/data/automation.ts");
    clock: typeof import("../../server/live/clock.ts");
    session: typeof import("./test-session.ts");
  };

  const rows = async (table: string, filter: (q: any) => any) => {
    const { data, error } = await filter(admin.from(table).select("*"));
    assert.ifError(error);
    return data as Record<string, any>[];
  };
  const one = async (table: string, id: string) => (await rows(table, (q) => q.eq("id", id)))[0];
  const ok = <T>(r: { ok: true; data: T } | { ok: false; error: string }) => {
    assert.ok(r.ok, r.ok ? "" : r.error);
    return (r as { ok: true; data: T }).data;
  };
  const runsOf = (automationId: string) => rows("automation_runs", (q) => q.eq("automation_id", automationId).order("started_at"));

  async function makePerson(who: "ana" | "bia", role: "admin" | "normal") {
    const email = `${who}-auto-${run}@teste.intellect.local`;
    const created = await admin.auth.admin.createUser({ email, password: "Teste-Segura-123", email_confirm: true, user_metadata: { name: who } });
    assert.ifError(created.error);
    const id = created.data.user!.id;
    await admin.from("profiles").update({ name: who === "ana" ? "Ana Auto" : "Bia Auto" }).eq("id", id);
    assert.ifError((await admin.from("workspace_members").insert({ workspace_id: workspaceId, user_id: id, role })).error);
    people[who] = { id, name: who, email, username: null, avatarColor: "purple", timezone: "America/Sao_Paulo" };
  }

  let board = "";
  const list: Record<"entrada" | "revisao" | "feito", string> = { entrada: "", revisao: "", feito: "" };
  let card = "";
  let label = "";

  before(async () => {
    const w = await admin.from("workspaces").insert({ name: "Espaço das automações", slug: `auto-${run}` }).select("id").single();
    assert.ifError(w.error);
    workspaceId = w.data!.id as string;
    await makePerson("ana", "admin");
    await makePerson("bia", "normal");
    m = {
      kanban: await import("../../server/actions/kanban.ts"),
      cards: await import("../../server/actions/cards.ts"),
      automation: await import("../../server/actions/automation.ts"),
      data: await import("../../server/data/automation.ts"),
      clock: await import("../../server/live/clock.ts"),
      session: await import("./test-session.ts"),
    };
    m.session.actAs(people.ana);
    board = ok(await m.kanban.createBoard({ workspaceId, name: "Quadro das automações", background: "blue", visibility: "workspace" })).id;
    list.entrada = ok(await m.kanban.createList(board, "Entrada")).id;
    list.revisao = ok(await m.kanban.createList(board, "Revisão")).id;
    list.feito = ok(await m.kanban.createList(board, "Feito")).id;
    card = ok(await m.cards.createCard({ boardId: board, listId: list.entrada, name: "Campanha nova" })).id;
    label = (await rows("labels", (q) => q.eq("board_id", board)))[0].id;
  });

  after(async () => {
    if (!enabled || !isTestProject) return;
    await admin.from("workspaces").delete().eq("id", workspaceId);
    for (const p of Object.values(people)) await admin.auth.admin.deleteUser(p.id);
  });

  let rule = "";

  test("regra: card movido para Revisão ganha etiqueta e comentário da automação", async () => {
    m.session.actAs(people.ana);
    rule = ok(
      await m.automation.createAutomation(board, {
        type: "rule",
        name: "Revisão marca e avisa",
        trigger: { kind: "card_moved", toListId: list.revisao, fromListId: null },
        filters: [],
        actions: [
          { kind: "add_label", labelId: label },
          { kind: "add_comment", text: "Revisar {cardname}" },
        ],
      }),
    ).id;
    ok(await m.kanban.moveCard({ cardId: card, toListId: list.revisao, position: "bottom" }));

    assert.deepEqual((await rows("card_labels", (q) => q.eq("card_id", card))).map((r) => r.label_id), [label]);
    const comments = await rows("comments", (q) => q.eq("card_id", card));
    assert.deepEqual(
      comments.map((c) => [c.body_text, c.automation_name]),
      [["Revisar Campanha nova", "Revisão marca e avisa"]],
    );
    const [r] = await runsOf(rule);
    assert.equal(r.status, "success");
    assert.equal(r.card_id, card);
    assert.ok(r.trigger_activity_id, "a execução aponta para a atividade que a disparou (segunda passada)");
    assert.equal((await one("activities", r.trigger_activity_id)).type, "card.moved");
    const byRun = await rows("activities", (q) => q.eq("automation_run_id", r.id));
    assert.ok(byRun.length >= 1 && byRun.every((a) => a.actor_kind === "automation"));
  });

  test("botão do card move o card e registra a execução", async () => {
    m.session.actAs(people.ana);
    const button = ok(
      await m.automation.createAutomation(board, {
        type: "card_button",
        name: "Concluir",
        trigger: { kind: "button", label: "Concluir" },
        filters: [],
        actions: [{ kind: "move_card", listId: list.feito, position: "bottom" }],
      }),
    ).id;
    const pressed = ok(await m.automation.pressButton(button, card));
    assert.equal(pressed.status, "success");
    assert.equal((await one("cards", card)).list_id, list.feito);
    assert.equal((await runsOf(button)).length, 1);
  });

  test("proteção contra loop: duas regras que se chamam param, sem erro no banco", async () => {
    m.session.actAs(people.ana);
    const x = ok(
      await m.automation.createAutomation(board, {
        type: "rule",
        name: "X: Entrada vai para Feito",
        trigger: { kind: "card_moved", toListId: list.entrada, fromListId: null },
        filters: [],
        actions: [{ kind: "move_card", listId: list.feito, position: "bottom" }],
      }),
    ).id;
    const y = ok(
      await m.automation.createAutomation(board, {
        type: "rule",
        name: "Y: Feito volta para Entrada",
        trigger: { kind: "card_moved", toListId: list.feito, fromListId: null },
        filters: [],
        actions: [{ kind: "move_card", listId: list.entrada, position: "bottom" }],
      }),
    ).id;
    ok(await m.kanban.moveCard({ cardId: card, toListId: list.entrada, position: "bottom" }));
    const statuses = [...(await runsOf(x)), ...(await runsOf(y))].map((r) => r.status).sort();
    assert.ok(statuses.includes("skipped"), `deveria ter parado (${statuses.join(", ")})`);
    for (const r of [...(await runsOf(x)), ...(await runsOf(y))]) assert.ok(r.depth <= 5);
    ok(await m.automation.toggleAutomation(x, false));
    ok(await m.automation.toggleAutomation(y, false));
    assert.equal((await one("automations", x)).enabled, false);
  });

  test("agendada roda pelo relógio uma vez só", async () => {
    m.session.actAs(people.ana);
    const scheduled = ok(
      await m.automation.createAutomation(board, {
        type: "scheduled",
        name: "Resumo do dia",
        trigger: { kind: "schedule", every: "day", time: "09:00", weekday: 1, monthDay: 1 },
        filters: [],
        actions: [{ kind: "create_card", listId: list.entrada, name: "Resumo do dia" }],
      }),
    ).id;
    // Venceu há um minuto.
    await admin.from("automations").update({ next_run_at: new Date(Date.now() - MIN).toISOString() }).eq("id", scheduled);
    assert.ok((await m.clock.workspacesWithWork()).includes(workspaceId));
    await m.clock.tickLive();
    await m.clock.tickLive();
    const created = await rows("cards", (q) => q.eq("board_id", board).eq("name", "Resumo do dia"));
    assert.equal(created.length, 1, "o card do resumo nasce uma vez só");
    const runs = await runsOf(scheduled);
    assert.equal(runs.length, 1);
    assert.ok(runs[0].dedupe_key);
    assert.ok(Date.parse((await one("automations", scheduled)).next_run_at) > Date.now(), "a próxima vez fica para o futuro");
  });

  test("regra por prazo roda uma vez, pelo relógio", async () => {
    m.session.actAs(people.ana);
    const due = ok(
      await m.automation.createAutomation(board, {
        type: "due_date",
        name: "Uma hora antes do prazo",
        trigger: { kind: "due", when: "before", amount: 1, unit: "hours" },
        filters: [],
        actions: [{ kind: "add_comment", text: "Falta uma hora para {cardname}" }],
      }),
    ).id;
    // Regra nova não dispara para prazos de antes dela: a regra "nasceu" há duas horas.
    await admin.from("automations").update({ created_at: new Date(Date.now() - 120 * MIN).toISOString() }).eq("id", due);
    const target = ok(await m.cards.createCard({ boardId: board, listId: list.revisao, name: "Prazo chegando" })).id;
    ok(await m.kanban.updateCard({ cardId: target, dueAt: new Date(Date.now() + 59 * MIN).toISOString() }));
    await m.clock.tickLive();
    await m.clock.tickLive();
    const comments = await rows("comments", (q) => q.eq("card_id", target));
    assert.deepEqual(
      comments.map((c) => c.body_text),
      ["Falta uma hora para Prazo chegando"],
    );
    assert.equal((await runsOf(due)).length, 1);
  });

  test("lembrete de prazo avisa a pessoa do card uma vez", async () => {
    m.session.actAs(people.ana);
    const target = ok(await m.cards.createCard({ boardId: board, listId: list.revisao, name: "Lembrar a Bia" })).id;
    ok(await m.kanban.toggleCardMember(target, people.bia.id, true));
    ok(await m.kanban.updateCard({ cardId: target, dueAt: new Date(Date.now() + 30 * MIN).toISOString(), dueReminderMinutes: 60 }));
    await m.clock.tickLive();
    await m.clock.tickLive();
    const reminders = await rows("notifications", (q) => q.eq("user_id", people.bia.id).eq("type", "due_soon").eq("card_id", target));
    assert.equal(reminders.length, 1);
  });

  test("diretório e histórico leem do banco", async () => {
    m.session.actAs(people.ana);
    const directory = await m.data.getAutomationDirectory({ user: people.ana }, board);
    const found = directory.automations.find((a) => a.id === rule)!;
    assert.equal(found.lastRun?.status, "success");
    assert.match(found.description, /Revisão/);
    const history = await m.data.getAutomationRuns({ user: people.ana }, board);
    assert.ok(history.some((h) => h.automationId === rule && h.cardName === "Campanha nova"));
    assert.ok(history.some((h) => h.status === "skipped"));
  });

  test("excluir a automação leva o histórico junto", async () => {
    m.session.actAs(people.ana);
    ok(await m.automation.deleteAutomation(rule));
    assert.equal(await one("automations", rule), undefined);
    assert.equal((await runsOf(rule)).length, 0);
  });
});
