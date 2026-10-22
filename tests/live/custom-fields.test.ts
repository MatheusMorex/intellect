// Campos personalizados no Supabase, contra o projeto de TESTE (nunca o
// principal): criar campos de cada tipo, preencher no card (o valor muda na mesma
// linha), a frente e o verso do card, opção apagada leva o valor junto, copiar o
// card no mesmo quadro, apagar campo e card. Quem não vê o quadro não lê nada.
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
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const enabled = Boolean(url && secret && publishable);
// Trava de segurança: estes testes criam e apagam dados.
const isTestProject = (url ?? "").includes("aqaijwpnudhftlxwsfdm");

process.env.AUTH_MODE = "live";
register("./stubs.mjs", import.meta.url);

const run = crypto.randomUUID().slice(0, 8);
const PASSWORD = "Teste-Segura-123";

type Who = "ana" | "bia" | "cid";

describe("campos personalizados no Supabase", { skip: !enabled || !isTestProject ? "sem .env.test.local do projeto de teste" : false }, () => {
  const admin = enabled ? createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } }) : (null as unknown as SupabaseClient);
  const people = {} as Record<Who, SessionUser>;
  const clients = {} as Record<Who, SupabaseClient>;
  const workspaces: string[] = [];
  let board = "";
  let list = "";
  let card = "";
  const field = { verba: "", situacao: "", entrega: "", aprovado: "", id: "" };

  let m: {
    fields: typeof import("../../server/actions/custom-fields.ts");
    kanban: typeof import("../../server/actions/kanban.ts");
    cards: typeof import("../../server/actions/cards.ts");
    data: typeof import("../../server/data/boards.ts");
    session: typeof import("./test-session.ts");
  };

  const rows = async (table: string, filter: (q: any) => any) => {
    const { data, error } = await filter(admin.from(table).select("*"));
    assert.ifError(error);
    return data as Record<string, any>[];
  };
  const ok = <T>(r: { ok: true; data: T } | { ok: false; error: string }) => {
    assert.ok(r.ok, r.ok ? "" : r.error);
    return (r as { ok: true; data: T }).data;
  };
  const valueOf = async (fieldId: string, cardId = card) => (await rows("custom_field_values", (q) => q.eq("card_id", cardId).eq("field_id", fieldId)))[0];

  async function makePerson(who: Who, workspaceId: string, role: "admin" | "normal") {
    const email = `${who}-campos-${run}@teste.intellect.local`;
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { name: who } });
    assert.ifError(created.error);
    const id = created.data.user!.id;
    await admin.from("profiles").update({ name: `${who} campos` }).eq("id", id);
    assert.ifError((await admin.from("workspace_members").insert({ workspace_id: workspaceId, user_id: id, role })).error);
    people[who] = { id, name: `${who} campos`, email, username: null, avatarColor: "purple", timezone: "America/Sao_Paulo" };
    const client = createClient(url!, publishable!, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.ifError((await client.auth.signInWithPassword({ email, password: PASSWORD })).error);
    clients[who] = client;
  }

  before(async () => {
    for (const slug of [`campos1-${run}`, `campos2-${run}`]) {
      const w = await admin.from("workspaces").insert({ name: `Espaço ${slug}`, slug }).select("id").single();
      assert.ifError(w.error);
      workspaces.push(w.data!.id as string);
    }
    await makePerson("ana", workspaces[0], "admin");
    await makePerson("bia", workspaces[0], "normal");
    await makePerson("cid", workspaces[1], "admin");
    m = {
      fields: await import("../../server/actions/custom-fields.ts"),
      kanban: await import("../../server/actions/kanban.ts"),
      cards: await import("../../server/actions/cards.ts"),
      data: await import("../../server/data/boards.ts"),
      session: await import("./test-session.ts"),
    };
    m.session.actAs(people.ana);
    board = ok(await m.kanban.createBoard({ workspaceId: workspaces[0], name: "Quadro dos campos", background: "purple", visibility: "workspace" })).id;
    list = ok(await m.kanban.createList(board, "A fazer")).id;
    card = ok(await m.cards.createCard({ boardId: board, listId: list, name: "Campanha de Black Friday" })).id;
  });

  after(async () => {
    if (!enabled || !isTestProject) return;
    for (const id of workspaces) await admin.from("workspaces").delete().eq("id", id);
    for (const p of Object.values(people)) await admin.auth.admin.deleteUser(p.id);
  });

  test("criar campos de cada tipo (quem edita o quadro cria); nome repetido e lista vazia são recusados", async () => {
    m.session.actAs(people.bia);
    field.verba = ok(await m.fields.saveCustomField({ boardId: board, name: "Verba", type: "number", showOnFront: true })).id;
    m.session.actAs(people.ana);
    field.situacao = ok(await m.fields.saveCustomField({ boardId: board, name: "Situação", type: "list", options: [{ label: "Rascunho" }, { label: "Aprovado" }], showOnFront: true })).id;
    field.entrega = ok(await m.fields.saveCustomField({ boardId: board, name: "Entrega ao cliente", type: "date", showOnFront: false })).id;
    field.aprovado = ok(await m.fields.saveCustomField({ boardId: board, name: "Aprovado pelo cliente", type: "checkbox", showOnFront: false })).id;
    field.id = ok(await m.fields.saveCustomField({ boardId: board, name: "ID da campanha", type: "text", showOnFront: false })).id;
    assert.equal((await m.fields.saveCustomField({ boardId: board, name: "verba", type: "text", showOnFront: false })).ok, false, "nome repetido");
    assert.equal((await m.fields.saveCustomField({ boardId: board, name: "Lista vazia", type: "list", options: [], showOnFront: false })).ok, false);
    const saved = await rows("custom_fields", (q) => q.eq("board_id", board).order("rank"));
    assert.deepEqual(
      saved.map((f) => [f.name, f.type]),
      [
        ["Verba", "number"],
        ["Situação", "list"],
        ["Entrega ao cliente", "date"],
        ["Aprovado pelo cliente", "checkbox"],
        ["ID da campanha", "text"],
      ],
    );
    assert.deepEqual(
      saved[1].options.map((o: { label: string }) => o.label),
      ["Rascunho", "Aprovado"],
    );
  });

  test("preencher no card: cada tipo guardado como deve; mudar o valor usa a mesma linha", async () => {
    m.session.actAs(people.ana);
    const situacao = (await rows("custom_fields", (q) => q.eq("id", field.situacao)))[0];
    const aprovado = situacao.options.find((o: { label: string }) => o.label === "Aprovado").id as string;
    ok(await m.fields.setCardField({ cardId: card, fieldId: field.verba, value: "1.500,50" }));
    ok(await m.fields.setCardField({ cardId: card, fieldId: field.situacao, value: aprovado }));
    ok(await m.fields.setCardField({ cardId: card, fieldId: field.entrega, value: "2026-11-27" }));
    ok(await m.fields.setCardField({ cardId: card, fieldId: field.aprovado, value: true }));
    ok(await m.fields.setCardField({ cardId: card, fieldId: field.id, value: "  120 2345  " }));
    assert.equal(Number((await valueOf(field.verba)).value), 1500.5);
    assert.equal((await valueOf(field.situacao)).value, aprovado);
    assert.equal((await valueOf(field.entrega)).value, "2026-11-27");
    assert.equal((await valueOf(field.aprovado)).value, true);
    assert.equal((await valueOf(field.id)).value, "120 2345");

    const before = (await valueOf(field.verba)).id;
    ok(await m.fields.setCardField({ cardId: card, fieldId: field.verba, value: "2000" }));
    const after = await valueOf(field.verba);
    assert.equal(after.id, before, "o valor deveria mudar na mesma linha");
    assert.equal(Number(after.value), 2000);

    const bad = await m.fields.setCardField({ cardId: card, fieldId: field.verba, value: "duas mil" });
    assert.equal(bad.ok, false);
    assert.equal((await m.fields.setCardField({ cardId: card, fieldId: field.entrega, value: "2026-02-30" })).ok, false);
    // A atividade do card conta o que mudou.
    assert.ok((await rows("activities", (q) => q.eq("card_id", card).eq("type", "card.field"))).length >= 6);
  });

  test("frente do card mostra só os campos marcados; o verso mostra todos", async () => {
    const view = await m.data.getBoardView({ user: people.ana }, board);
    const front = view.cards.find((c) => c.id === card)!;
    assert.deepEqual(front.fields.map((f) => [f.name, f.text]), [
      ["Verba", "2.000"],
      ["Situação", "Aprovado"],
    ]);
    assert.deepEqual(
      view.customFields.map((f) => f.name),
      ["Verba", "Situação", "Entrega ao cliente", "Aprovado pelo cliente", "ID da campanha"],
    );
    const detail = await m.data.getCardDetail({ user: people.ana }, card);
    assert.deepEqual(
      detail.fields.map((f) => [f.name, f.value]),
      [
        ["Verba", 2000],
        ["Situação", (await valueOf(field.situacao)).value],
        ["Entrega ao cliente", "2026-11-27"],
        ["Aprovado pelo cliente", true],
        ["ID da campanha", "120 2345"],
      ],
    );
  });

  test("quem é de outro workspace não lê os campos nem os valores", async () => {
    const fieldsSeen = await clients.cid.from("custom_fields").select("id").eq("board_id", board);
    const valuesSeen = await clients.cid.from("custom_field_values").select("id").eq("card_id", card);
    assert.equal(fieldsSeen.data?.length ?? 0, 0);
    assert.equal(valuesSeen.data?.length ?? 0, 0);
    const biaSees = await clients.bia.from("custom_field_values").select("id").eq("card_id", card);
    assert.equal(biaSees.data?.length, 5, "a Bia (do workspace) vê os valores");
  });

  test("limpar o valor apaga a linha; tirar a opção da lista limpa os cards que estavam nela", async () => {
    m.session.actAs(people.ana);
    ok(await m.fields.setCardField({ cardId: card, fieldId: field.aprovado, value: false }));
    assert.equal(await valueOf(field.aprovado), undefined);
    const situacao = (await rows("custom_fields", (q) => q.eq("id", field.situacao)))[0];
    const rascunho = situacao.options.find((o: { label: string }) => o.label === "Rascunho");
    ok(await m.fields.saveCustomField({ boardId: board, fieldId: field.situacao, name: "Situação", type: "list", options: [rascunho], showOnFront: true }));
    assert.equal(await valueOf(field.situacao), undefined, "o card estava em Aprovado, que saiu da lista");
    assert.equal((await m.fields.saveCustomField({ boardId: board, fieldId: field.verba, name: "Verba", type: "text", showOnFront: true })).ok, false, "o tipo não muda");
  });

  test("copiar o card no mesmo quadro leva os valores; apagar o campo e o card leva os valores junto", async () => {
    m.session.actAs(people.ana);
    const copy = ok(await m.kanban.copyCard({ cardId: card, toListId: list, name: "Cópia", keep: { labels: false, members: false, checklists: false, links: false } })).id;
    const copied = await rows("custom_field_values", (q) => q.eq("card_id", copy));
    assert.equal(copied.length, (await rows("custom_field_values", (q) => q.eq("card_id", card))).length);
    ok(await m.fields.deleteCustomField({ fieldId: field.verba }));
    assert.equal((await rows("custom_field_values", (q) => q.eq("field_id", field.verba))).length, 0);
    assert.equal((await rows("custom_fields", (q) => q.eq("id", field.verba))).length, 0);
    ok(await m.kanban.setCardArchived(copy, true));
    ok(await m.kanban.deleteCard(copy));
    assert.equal((await rows("custom_field_values", (q) => q.eq("card_id", copy))).length, 0);
  });
});
