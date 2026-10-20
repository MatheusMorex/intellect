// Etapa 2 da troca para o Supabase: o kanban no modo real. As actions e as
// leituras de verdade rodam contra o projeto de TESTE (nunca o principal), e
// cada resultado é conferido direto no banco. Rodam com `npm run test:live`.
//
// Três pessoas temporárias: Ana (admin) e Bia no mesmo workspace; Cid em outro.
// No fim, tudo o que o teste criou é apagado.

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

// O app em modo real, com a sessão e o revalidatePath substituídos (tests/live/stubs.mjs).
process.env.AUTH_MODE = "live";
register("./stubs.mjs", import.meta.url);

const run = crypto.randomUUID().slice(0, 8);
type Who = "ana" | "bia" | "cid";

describe("kanban no Supabase (etapa 2)", { skip: !enabled || !isTestProject ? "sem .env.test.local do projeto de teste" : false }, () => {
  const admin = enabled ? createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } }) : (null as unknown as SupabaseClient);
  const people = {} as Record<Who, SessionUser>;
  const workspaces: string[] = [];
  let ws1 = "";

  let m: {
    kanban: typeof import("../../server/actions/kanban.ts");
    cards: typeof import("../../server/actions/cards.ts");
    people: typeof import("../../server/actions/people.ts");
    data: typeof import("../../server/data/boards.ts");
    session: typeof import("./test-session.ts");
  };

  const as = (who: Who) => m.session.actAs(people[who]);
  const ctx = (who: Who) => ({ user: people[who] });
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
  const isNotFound = (e: unknown) => String((e as { digest?: string }).digest ?? (e as Error).message).includes("404");

  async function makePerson(who: Who, workspaceId: string, role: "admin" | "normal") {
    const email = `${who}-${run}@teste.intellect.local`;
    const created = await admin.auth.admin.createUser({ email, password: "Teste-Segura-123", email_confirm: true, user_metadata: { name: who } });
    assert.ifError(created.error);
    const id = created.data.user!.id;
    await admin.from("profiles").update({ name: who === "ana" ? "Ana Teste" : who === "bia" ? "Bia Teste" : "Cid Teste" }).eq("id", id);
    assert.ifError((await admin.from("workspace_members").insert({ workspace_id: workspaceId, user_id: id, role })).error);
    people[who] = { id, name: who, email, username: null, avatarColor: "purple", timezone: "America/Sao_Paulo" };
  }

  before(async () => {
    for (const slug of [`ws1-${run}`, `ws2-${run}`]) {
      const w = await admin.from("workspaces").insert({ name: `Espaço ${slug}`, slug }).select("id").single();
      assert.ifError(w.error);
      workspaces.push(w.data!.id as string);
    }
    ws1 = workspaces[0];
    await makePerson("ana", ws1, "admin");
    await makePerson("bia", ws1, "normal");
    await makePerson("cid", workspaces[1], "admin");
    m = {
      kanban: await import("../../server/actions/kanban.ts"),
      cards: await import("../../server/actions/cards.ts"),
      people: await import("../../server/actions/people.ts"),
      data: await import("../../server/data/boards.ts"),
      session: await import("./test-session.ts"),
    };
  });

  after(async () => {
    if (!enabled || !isTestProject) return;
    for (const id of workspaces) await admin.from("workspaces").delete().eq("id", id);
    for (const p of Object.values(people)) await admin.auth.admin.deleteUser(p.id);
  });

  let board = "";
  let todo = "";
  let doing = "";
  const cardIds: string[] = [];

  test("criar quadro: o quadro, a Ana como admin, 6 etiquetas e a atividade ficam no banco", async () => {
    as("ana");
    board = ok(await m.kanban.createBoard({ workspaceId: ws1, name: "Quadro do teste", background: "purple", visibility: "workspace" })).id;
    const row = await one("boards", board);
    assert.equal(row.name, "Quadro do teste");
    assert.equal(row.workspace_id, ws1);
    assert.deepEqual(await rows("board_members", (q) => q.eq("board_id", board).select("user_id, role")), [{ user_id: people.ana.id, role: "admin" }]);
    assert.equal((await rows("labels", (q) => q.eq("board_id", board))).length, 6);
    assert.equal((await rows("activities", (q) => q.eq("board_id", board).eq("type", "board.created"))).length, 1);
  });

  test("listas e cards: números 1, 2 e 3, na ordem", async () => {
    as("ana");
    todo = ok(await m.kanban.createList(board, "A fazer")).id;
    doing = ok(await m.kanban.createList(board, "Fazendo")).id;
    for (const name of ["Primeiro", "Segundo", "Terceiro"]) cardIds.push(ok(await m.cards.createCard({ boardId: board, listId: todo, name })).id);
    const cards = await rows("cards", (q) => q.eq("list_id", todo).order("rank"));
    assert.deepEqual(
      cards.map((c) => [c.name, c.number]),
      [
        ["Primeiro", 1],
        ["Segundo", 2],
        ["Terceiro", 3],
      ],
    );
    const view = await m.data.getBoardView(ctx("ana"), board);
    assert.deepEqual(
      view.lists.map((l) => l.name),
      ["A fazer", "Fazendo"],
    );
    assert.equal(view.cards.length, 3);
  });

  test("cinco cards criados ao mesmo tempo não repetem número", async () => {
    as("ana");
    const results = await Promise.all([1, 2, 3, 4, 5].map((i) => m.cards.createCard({ boardId: board, listId: todo, name: `Ao mesmo tempo ${i}` })));
    for (const r of results) ok(r);
    const numbers = (await rows("cards", (q) => q.eq("board_id", board))).map((c) => c.number as number).sort((a, b) => a - b);
    assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal((await one("boards", board)).next_card_number, 9);
  });

  test("mover card para o topo de outra lista grava a lista, a posição e a atividade", async () => {
    as("ana");
    ok(await m.cards.createCard({ boardId: board, listId: doing, name: "Já estava lá" }));
    ok(await m.kanban.moveCard({ cardId: cardIds[2], toListId: doing, position: "top" }));
    const inDoing = await rows("cards", (q) => q.eq("list_id", doing).order("rank"));
    assert.deepEqual(
      inDoing.map((c) => c.name),
      ["Terceiro", "Já estava lá"],
    );
    const moved = await rows("activities", (q) => q.eq("card_id", cardIds[2]).eq("type", "card.moved"));
    assert.equal(moved[0].data.to, "Fazendo");
  });

  test("descrição com versão: editar com a versão velha volta conflito, sem apagar o que a outra pessoa escreveu", async () => {
    as("ana");
    const first = ok(await m.kanban.updateCard({ cardId: cardIds[0], description: { type: "doc" }, descriptionText: "Versão da Ana", expectedVersion: 1 }));
    assert.equal(first.version, 2);
    as("bia");
    const stale = await m.kanban.updateCard({ cardId: cardIds[0], description: { type: "doc" }, descriptionText: "Versão da Bia", expectedVersion: 1 });
    assert.equal(stale.ok, false);
    assert.equal((stale as { conflict?: boolean }).conflict, true);
    const row = await one("cards", cardIds[0]);
    assert.equal(row.description_text, "Versão da Ana");
    assert.equal(row.version, 2);
  });

  test("membro, etiqueta, checklist e item concluído", async () => {
    as("ana");
    ok(await m.kanban.toggleCardMember(cardIds[0], people.bia.id, true));
    const label = (await rows("labels", (q) => q.eq("board_id", board)))[0];
    ok(await m.kanban.toggleCardLabel(cardIds[0], label.id, true));
    const checklist = ok(await m.kanban.createChecklist(cardIds[0], "Passos")).id;
    const item = ok(await m.kanban.addChecklistItem(checklist, "Fazer o teste")).id;
    ok(await m.kanban.updateChecklistItem(item, { done: true }));

    assert.deepEqual((await rows("card_members", (q) => q.eq("card_id", cardIds[0]))).map((r) => r.user_id), [people.bia.id]);
    assert.deepEqual((await rows("card_labels", (q) => q.eq("card_id", cardIds[0]))).map((r) => r.label_id), [label.id]);
    assert.ok((await one("checklist_items", item)).completed_at);
    // Colocar a Bia no card avisa a Bia.
    assert.equal((await rows("notifications", (q) => q.eq("user_id", people.bia.id).eq("type", "assigned"))).length, 1);
    const front = (await m.data.getBoardView(ctx("ana"), board)).cards.find((c) => c.id === cardIds[0])!;
    assert.deepEqual(front.checklist, { done: 1, total: 1 });
    assert.deepEqual(front.memberIds, [people.bia.id]);
  });

  test("comentário com @menção avisa a Bia; ela vê no sino e marca como lida", async () => {
    as("ana");
    ok(await m.kanban.addComment(cardIds[1], { body: { type: "doc" }, bodyText: "@Bia dá uma olhada", mentions: [people.bia.id] }));
    as("bia");
    const unread = await m.data.getNotifications(ctx("bia"), true);
    const mention = unread.find((n) => n.type === "mention");
    assert.ok(mention, "a Bia deveria ter a menção");
    assert.equal(mention.actor.name, "Ana Teste");
    ok(await m.people.markNotificationsRead("all"));
    assert.equal((await m.data.getNotifications(ctx("bia"), true)).length, 0);
    assert.equal((await rows("notifications", (q) => q.eq("user_id", people.bia.id).is("read_at", null))).length, 0);
  });

  test("quem é de outro workspace não vê o quadro nem consegue mexer", async () => {
    as("cid");
    await assert.rejects(m.data.getBoardView(ctx("cid"), board), isNotFound);
    await assert.rejects(m.cards.createCard({ boardId: board, listId: todo, name: "Invasão" }), isNotFound);
    // A lista nem existe no retrato de quem é de fora.
    assert.equal((await m.kanban.renameList(todo, "Invadida")).ok, false);
    assert.equal((await one("lists", todo)).name, "A fazer");
    assert.equal((await m.data.search(ctx("cid"), "Primeiro")).cards.length, 0);
  });

  test("quadro privado: a Bia só vê depois de ser convidada", async () => {
    as("ana");
    const secret = ok(await m.kanban.createBoard({ workspaceId: ws1, name: "Quadro privado", background: "blue", visibility: "private" })).id;
    await assert.rejects(m.data.getBoardView(ctx("bia"), secret), isNotFound);
    const added = ok(await m.people.inviteToBoard({ boardId: secret, who: people.bia.id, role: "normal" }));
    assert.equal(added.added, true);
    const view = await m.data.getBoardView(ctx("bia"), secret);
    assert.equal(view.board.name, "Quadro privado");
    assert.equal((await rows("notifications", (q) => q.eq("user_id", people.bia.id).eq("type", "added_to_board"))).length, 1);
    // Convite por e-mail para quem é de fora: vira um convite com link.
    const link = ok(await m.people.inviteToBoard({ boardId: secret, who: `fora-${run}@teste.intellect.local`, role: "observer" }));
    assert.match(link.link ?? "", /\/invite\//);
    assert.equal((await rows("invites", (q) => q.eq("board_id", secret))).length, 1);
  });

  test("copiar card leva a checklist com os itens desmarcados", async () => {
    as("ana");
    const copy = ok(await m.kanban.copyCard({ cardId: cardIds[0], toListId: doing, name: "Cópia", keep: { labels: true, members: false, checklists: true, links: false } })).id;
    const checklists = await rows("checklists", (q) => q.eq("card_id", copy));
    assert.equal(checklists.length, 1);
    const items = await rows("checklist_items", (q) => q.eq("checklist_id", checklists[0].id));
    assert.deepEqual(
      items.map((i) => [i.name, i.completed_at]),
      [["Fazer o teste", null]],
    );
    assert.equal((await rows("card_labels", (q) => q.eq("card_id", copy))).length, 1);
  });

  test("a hora do quadro anda a cada mudança (quem está com ele aberto recarrega)", async () => {
    as("ana");
    const before = (await one("boards", board)).updated_at;
    await new Promise((r) => setTimeout(r, 20));
    ok(await m.kanban.renameList(doing, "Em andamento"));
    const after = (await one("boards", board)).updated_at;
    assert.notEqual(after, before);
    const view = await m.data.getBoardView(ctx("ana"), board);
    assert.equal(view.board.stamp, after);
  });

  test("arquivar e excluir card: o card some do banco, a atividade fica", async () => {
    as("ana");
    ok(await m.kanban.setCardArchived(cardIds[1], true));
    assert.ok((await one("cards", cardIds[1])).archived_at);
    assert.ok((await m.data.getBoardArchive(ctx("ana"), board)).cards.some((c) => c.id === cardIds[1]));
    ok(await m.kanban.deleteCard(cardIds[1]));
    assert.equal(await one("cards", cardIds[1]), undefined);
    assert.equal((await rows("comments", (q) => q.eq("card_id", cardIds[1]))).length, 0);
    const kept = await rows("activities", (q) => q.eq("board_id", board).eq("type", "card.created").eq("data->>name", "Segundo"));
    assert.equal(kept.length, 1);
  });

  test("início do workspace, meus cards, verso do card e busca leem do banco", async () => {
    as("bia");
    const home = await m.data.getWorkspaceHome(ctx("bia"), `ws1-${run}`);
    assert.ok(home.boards.some((b) => b.id === board));
    const mine = await m.data.getMyCards(ctx("bia"));
    assert.ok(mine.some((c) => c.id === cardIds[0]));
    const detail = await m.data.getCardDetail(ctx("bia"), cardIds[0]);
    assert.equal(detail.card.descriptionText, "Versão da Ana");
    assert.ok(detail.activity.some((a) => a.text.includes("checklist")));
    const found = await m.data.search(ctx("bia"), "primeir");
    assert.ok(found.cards.some((c) => c.id === cardIds[0]));
    const shell = await m.data.getShellData(ctx("bia"));
    assert.ok(shell.boards.some((b) => b.id === board));
  });

  test("lista: cor, ordem, arquivar e voltar", async () => {
    as("ana");
    ok(await m.kanban.setListColor(todo, "green"));
    const moved = ok(await m.kanban.moveList(todo, doing, null));
    assert.equal((await one("lists", todo)).rank, moved.rank);
    ok(await m.kanban.setListArchived(doing, true));
    assert.ok((await one("lists", doing)).archived_at);
    ok(await m.kanban.setListArchived(doing, false));
    assert.equal((await one("lists", doing)).archived_at, null);
    assert.equal((await one("lists", todo)).color, "green");
  });

  test("etiqueta nova, renomeada e apagada (sai dos cards junto)", async () => {
    as("ana");
    const id = ok(await m.kanban.upsertLabel({ boardId: board, name: "Urgente", color: "red" })).id;
    ok(await m.kanban.toggleCardLabel(cardIds[0], id, true));
    ok(await m.kanban.upsertLabel({ boardId: board, labelId: id, name: "Muito urgente", color: "red_dark" }));
    assert.equal((await one("labels", id)).name, "Muito urgente");
    ok(await m.kanban.deleteLabel(id));
    assert.equal(await one("labels", id), undefined);
    assert.equal((await rows("card_labels", (q) => q.eq("label_id", id))).length, 0);
  });

  test("fechar e excluir o quadro apaga tudo dele", async () => {
    as("ana");
    assert.equal((await m.kanban.deleteBoard(board)).ok, false, "precisa fechar antes");
    ok(await m.kanban.setBoardClosed(board, true));
    ok(await m.kanban.deleteBoard(board));
    assert.equal(await one("boards", board), undefined);
    assert.equal((await rows("cards", (q) => q.eq("board_id", board))).length, 0);
    assert.equal((await rows("lists", (q) => q.eq("board_id", board))).length, 0);
  });
});
