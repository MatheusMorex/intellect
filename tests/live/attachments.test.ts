// Etapa 5 da troca para o Supabase: anexos dos cards. Contra o projeto de TESTE
// (nunca o principal): arquivo no Storage enviado com a sessão da própria pessoa
// (as regras do Storage decidem), link, renomear, capa, excluir (o arquivo sai do
// Storage) e o card apagado levando os arquivos junto. Quem não vê o quadro não
// baixa nada. Rodam com `npm run test:live`. No fim, tudo o que o teste criou é apagado.

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
/** Um PNG de 1×1 pixel de verdade (os primeiros bytes dizem que é imagem). */
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));

type Who = "ana" | "bia" | "cid";

describe("anexos no Supabase (etapa 5)", { skip: !enabled || !isTestProject ? "sem .env.test.local do projeto de teste" : false }, () => {
  const admin = enabled ? createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } }) : (null as unknown as SupabaseClient);
  const people = {} as Record<Who, SessionUser>;
  const clients = {} as Record<Who, SupabaseClient>;
  const workspaces: string[] = [];
  let board = "";
  let card = "";

  let m: {
    attachments: typeof import("../../server/attachments.ts");
    actions: typeof import("../../server/actions/attachments.ts");
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
  const one = async (table: string, id: string) => (await rows(table, (q) => q.eq("id", id)))[0];
  const ok = <T>(r: { ok: true; data: T } | { ok: false; error: string }) => {
    assert.ok(r.ok, r.ok ? "" : r.error);
    return (r as { ok: true; data: T }).data;
  };
  /** O arquivo ainda está no Storage? (pela chave secreta, sem regra nenhuma) */
  const stored = async (key: string) => {
    const [folder, cardId, name] = key.split("/");
    const { data, error } = await admin.storage.from("attachments").list(`${folder}/${cardId}`, { search: name });
    assert.ifError(error);
    return (data ?? []).some((f) => f.name === name);
  };
  const storageOf = (who: Who) => m.attachments.bucketStorage(clients[who]);

  async function makePerson(who: Who, workspaceId: string, role: "admin" | "normal") {
    const email = `${who}-anexos-${run}@teste.intellect.local`;
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { name: who } });
    assert.ifError(created.error);
    const id = created.data.user!.id;
    await admin.from("profiles").update({ name: `${who} anexos` }).eq("id", id);
    assert.ifError((await admin.from("workspace_members").insert({ workspace_id: workspaceId, user_id: id, role })).error);
    people[who] = { id, name: `${who} anexos`, email, username: null, avatarColor: "purple", timezone: "America/Sao_Paulo" };
    const client = createClient(url!, publishable!, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.ifError((await client.auth.signInWithPassword({ email, password: PASSWORD })).error);
    clients[who] = client;
  }

  before(async () => {
    for (const slug of [`anexos1-${run}`, `anexos2-${run}`]) {
      const w = await admin.from("workspaces").insert({ name: `Espaço ${slug}`, slug }).select("id").single();
      assert.ifError(w.error);
      workspaces.push(w.data!.id as string);
    }
    await makePerson("ana", workspaces[0], "admin");
    await makePerson("bia", workspaces[0], "normal");
    await makePerson("cid", workspaces[1], "admin");
    m = {
      attachments: await import("../../server/attachments.ts"),
      actions: await import("../../server/actions/attachments.ts"),
      kanban: await import("../../server/actions/kanban.ts"),
      cards: await import("../../server/actions/cards.ts"),
      data: await import("../../server/data/boards.ts"),
      session: await import("./test-session.ts"),
    };
    m.session.actAs(people.ana);
    board = ok(await m.kanban.createBoard({ workspaceId: workspaces[0], name: "Quadro dos anexos", background: "purple", visibility: "workspace" })).id;
    const list = ok(await m.kanban.createList(board, "A fazer")).id;
    card = ok(await m.cards.createCard({ boardId: board, listId: list, name: "Card com anexos" })).id;
  });

  after(async () => {
    if (!enabled || !isTestProject) return;
    const { data } = await admin.storage.from("attachments").list(`cards/${card}`);
    if (data?.length) await admin.storage.from("attachments").remove(data.map((f) => `cards/${card}/${f.name}`));
    for (const id of workspaces) await admin.from("workspaces").delete().eq("id", id);
    for (const p of Object.values(people)) await admin.auth.admin.deleteUser(p.id);
  });

  let image = "";
  let imageKey = "";

  test("arquivo: vai para o Storage com a sessão da Ana e a linha entra no banco", async () => {
    m.session.actAs(people.ana);
    const result = await m.attachments.addFileAttachment(people.ana, card, { name: "foto da vitrine.png", type: "image/png", bytes: PNG }, storageOf("ana"));
    assert.ok(result.ok, result.ok ? "" : result.error);
    image = (result as { id: string }).id;
    const row = await one("attachments", image);
    assert.equal(row.card_id, card);
    assert.equal(row.kind, "file");
    assert.equal(row.name, "foto da vitrine.png");
    assert.equal(row.mime_type, "image/png");
    assert.equal(Number(row.bytes), PNG.length);
    assert.match(row.storage_key, new RegExp(`^cards/${card}/[0-9a-f-]{36}$`));
    imageKey = row.storage_key;
    assert.ok(await stored(imageKey), "o arquivo não chegou ao Storage");
    assert.equal((await rows("activities", (q) => q.eq("card_id", card).eq("type", "card.attachment"))).length, 1);
  });

  test("baixar: quem vê o quadro baixa; quem é de outro workspace, não (nem pelo app, nem direto no Storage)", async () => {
    const asBia = await m.attachments.readAttachment(people.bia, image, storageOf("bia"));
    assert.ok(asBia, "a Bia (do workspace) deveria baixar");
    assert.deepEqual([...asBia!.bytes], [...PNG]);
    assert.equal(await m.attachments.readAttachment(people.cid, image, storageOf("cid")), null);
    const direct = await clients.cid.storage.from("attachments").download(imageKey);
    assert.ok(direct.error || !direct.data, "o Cid baixou direto do Storage");
    const upload = await clients.cid.storage.from("attachments").upload(`cards/${card}/${crypto.randomUUID()}`, PNG);
    assert.ok(upload.error, "o Cid enviou arquivo para um card que não vê");
  });

  test("cabeçalhos do download: só imagem conferida abre no navegador; o resto baixa como arquivo genérico", () => {
    const img = m.attachments.downloadHeaders({ name: "foto.png", kind: "file", mimeType: "image/png" }, 10, false);
    assert.equal(img["Content-Type"], "image/png");
    assert.match(img["Content-Disposition"], /^inline/);
    const html = m.attachments.downloadHeaders({ name: "página.html", kind: "file", mimeType: "text/html" }, 10, false);
    assert.equal(html["Content-Type"], "application/octet-stream");
    assert.match(html["Content-Disposition"], /^attachment; filename="p_gina.html"; filename\*=UTF-8''p%C3%A1gina\.html$/);
    assert.equal(html["X-Content-Type-Options"], "nosniff");
    assert.match(html["Content-Security-Policy"], /sandbox/);
    // Um arquivo qualquer dizendo ser PNG não vira imagem (os bytes mandam).
    assert.equal(m.attachments.storedType(new TextEncoder().encode("<script>alert(1)</script>"), "image/png"), "application/octet-stream");
    assert.equal(m.attachments.storedType(PNG, "application/octet-stream"), "image/png");
  });

  let link = "";

  test("link: só http e https; sem texto, o endereço vira o nome", async () => {
    m.session.actAs(people.bia);
    const bad = await m.actions.addLinkAttachment({ cardId: card, url: "javascript:alert(1)" });
    assert.equal(bad.ok, false);
    link = ok(await m.actions.addLinkAttachment({ cardId: card, url: "https://exemplo.com.br/briefing/" })).id;
    const row = await one("attachments", link);
    assert.equal(row.kind, "link");
    assert.equal(row.url, "https://exemplo.com.br/briefing/");
    assert.equal(row.name, "exemplo.com.br/briefing");
    assert.equal(row.storage_key, null);
  });

  test("renomear e usar como capa; link não vira capa", async () => {
    m.session.actAs(people.ana);
    ok(await m.actions.renameAttachment({ attachmentId: image, name: "Vitrine nova" }));
    assert.equal((await one("attachments", image)).name, "Vitrine nova");
    ok(await m.actions.setAttachmentCover({ attachmentId: image, cover: true }));
    assert.deepEqual((await one("cards", card)).cover, { attachmentId: image, size: "strip" });
    assert.equal((await m.actions.setAttachmentCover({ attachmentId: link, cover: true })).ok, false);

    // O verso e a frente do card mostram os anexos e a capa.
    const detail = await m.data.getCardDetail({ user: people.ana }, card);
    assert.deepEqual(
      detail.attachments.map((a) => [a.name, a.kind, a.isImage, a.isCover]),
      [
        ["exemplo.com.br/briefing", "link", false, false],
        ["Vitrine nova", "file", true, true],
      ],
    );
    const view = await m.data.getBoardView({ user: people.ana }, board);
    const front = view.cards.find((c) => c.id === card)!;
    assert.equal(front.attachments, 2);
    assert.equal(front.cover?.imageUrl, `/api/attachments/${image}`);
  });

  test("excluir: a linha sai, o arquivo sai do Storage e a capa some", async () => {
    m.session.actAs(people.ana);
    ok(await m.actions.deleteAttachment({ attachmentId: image }));
    assert.equal(await one("attachments", image), undefined);
    assert.equal((await one("cards", card)).cover, null);
    assert.equal(await stored(imageKey), false, "o arquivo ficou no Storage");
  });

  test("copiar o card com os anexos: arquivo copiado na pasta do card novo, capa junto; sem a opção, nada", async () => {
    m.session.actAs(people.ana);
    const added = await m.attachments.addFileAttachment(people.ana, card, { name: "capa.png", type: "image/png", bytes: PNG }, storageOf("ana"));
    assert.ok(added.ok);
    const original = await one("attachments", (added as { id: string }).id);
    ok(await m.actions.setAttachmentCover({ attachmentId: original.id, cover: true }));
    const list = (await one("cards", card)).list_id as string;
    const copy = ok(await m.kanban.copyCard({ cardId: card, toListId: list, name: "Cópia com anexos", keep: { labels: false, members: false, checklists: false, links: false, attachments: true } }));
    const copied = await rows("attachments", (q) => q.eq("card_id", copy.id));
    assert.deepEqual(copied.map((a) => a.name).sort(), ["capa.png", "exemplo.com.br/briefing"]);
    const file = copied.find((a) => a.kind === "file")!;
    assert.notEqual(file.storage_key, original.storage_key);
    assert.match(file.storage_key, new RegExp(`^cards/${copy.id}/`));
    assert.ok(await stored(file.storage_key), "o arquivo da cópia não está no Storage");
    assert.ok(await stored(original.storage_key), "o arquivo do card original sumiu");
    assert.deepEqual((await one("cards", copy.id)).cover, { attachmentId: file.id, size: "strip" });

    const bare = ok(await m.kanban.copyCard({ cardId: card, toListId: list, name: "Cópia sem anexos", keep: { labels: false, members: false, checklists: false, links: false, attachments: false } }));
    assert.equal((await rows("attachments", (q) => q.eq("card_id", bare.id))).length, 0);
    assert.equal((await one("cards", bare.id)).cover, null);

    // Limpa as cópias (apagar o card leva o arquivo da cópia junto).
    for (const id of [copy.id, bare.id]) {
      ok(await m.kanban.setCardArchived(id, true));
      ok(await m.kanban.deleteCard(id));
    }
    assert.equal(await stored(file.storage_key), false, "o arquivo da cópia apagada ficou no Storage");
  });

  test("apagar o card leva os arquivos junto", async () => {
    m.session.actAs(people.ana);
    const added = await m.attachments.addFileAttachment(people.ana, card, { name: "contrato.pdf", type: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.4 teste") }, storageOf("ana"));
    assert.ok(added.ok);
    const key = (await one("attachments", (added as { id: string }).id)).storage_key as string;
    assert.ok(await stored(key));
    ok(await m.kanban.setCardArchived(card, true));
    ok(await m.kanban.deleteCard(card));
    assert.equal((await rows("attachments", (q) => q.eq("card_id", card))).length, 0);
    assert.equal(await stored(key), false, "o arquivo do card apagado ficou no Storage");
  });
});
