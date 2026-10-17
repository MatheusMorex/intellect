// Testes do Supabase de verdade (projeto de TESTE, nunca o principal). Rodam com
// `npm run test:live`, que carrega o .env.test.local.
//
// Duas pessoas em workspaces diferentes tentam ler e mexer no que não é delas pela
// API pública (chave publishable + login), que é o que um navegador consegue fazer.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, describe, test } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const enabled = Boolean(url && publishable && secret);
// Trava de segurança: estes testes criam e apagam dados.
const isTestProject = (url ?? "").includes("aqaijwpnudhftlxwsfdm");

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const run = crypto.randomUUID().slice(0, 8);
const password = "Teste-Segura-123";

type Person = { id: string; email: string; client: SupabaseClient; workspaceId: string };

describe("segurança do banco (RLS)", { skip: !enabled || !isTestProject ? "sem .env.test.local do projeto de teste" : false }, () => {
  const admin = enabled ? createClient(url!, secret!, options) : (null as unknown as SupabaseClient);
  const people: Record<"ana" | "bia", Person> = {} as never;
  const createdUsers: string[] = [];

  async function makePerson(key: "ana" | "bia") {
    const email = `${key}-${run}@teste.intellect.local`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: key } });
    assert.ifError(created.error);
    const id = created.data.user!.id;
    createdUsers.push(id);
    const workspace = await admin.from("workspaces").insert({ name: `Espaço ${key}`, slug: `${key}-${run}`, created_by: id }).select("id").single();
    assert.ifError(workspace.error);
    await admin.from("workspace_members").insert({ workspace_id: workspace.data!.id, user_id: id, role: "admin" });
    const client = createClient(url!, publishable!, options);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    assert.ifError(signedIn.error);
    people[key] = { id, email, client, workspaceId: workspace.data!.id };
  }

  before(async () => {
    await makePerson("ana");
    await makePerson("bia");
  });

  after(async () => {
    for (const person of Object.values(people)) await admin.from("workspaces").delete().eq("id", person.workspaceId);
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  });

  test("o gatilho cria o perfil de quem entra", async () => {
    const { data } = await admin.from("profiles").select("name, email, theme").eq("id", people.ana.id).single();
    assert.equal(data?.name, "ana");
    assert.equal(data?.email, people.ana.email);
  });

  test("cada pessoa vê o próprio perfil e não o de quem não divide workspace", async () => {
    const own = await people.ana.client.from("profiles").select("id").eq("id", people.ana.id);
    assert.equal(own.data?.length, 1);
    const other = await people.ana.client.from("profiles").select("id").eq("id", people.bia.id);
    assert.equal(other.data?.length, 0);
  });

  test("workspace e membros de outra pessoa ficam invisíveis", async () => {
    const workspaces = await people.ana.client.from("workspaces").select("id");
    assert.deepEqual(workspaces.data?.map((w) => w.id), [people.ana.workspaceId]);
    const members = await people.ana.client.from("workspace_members").select("user_id").eq("workspace_id", people.bia.workspaceId);
    assert.equal(members.data?.length, 0);
  });

  test("não dá para entrar sozinha no workspace de outra pessoa", async () => {
    const attempt = await people.ana.client.from("workspace_members").insert({ workspace_id: people.bia.workspaceId, user_id: people.ana.id, role: "admin" });
    assert.ok(attempt.error, "o banco deveria recusar");
    const check = await admin.from("workspace_members").select("id").eq("workspace_id", people.bia.workspaceId).eq("user_id", people.ana.id);
    assert.equal(check.data?.length, 0);
  });

  test("não dá para mudar o workspace de outra pessoa", async () => {
    await people.ana.client.from("workspaces").update({ name: "invadido" }).eq("id", people.bia.workspaceId);
    const { data } = await admin.from("workspaces").select("name").eq("id", people.bia.workspaceId).single();
    assert.equal(data?.name, "Espaço bia");
  });

  test("convites só aparecem para o admin do próprio workspace", async () => {
    const invite = await admin.from("invites").insert({
      workspace_id: people.bia.workspaceId,
      email: "alguem@teste.intellect.local",
      role: "normal",
      token_hash: crypto.randomBytes(16).toString("hex"),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      max_uses: 1,
    });
    assert.ifError(invite.error);
    const seen = await people.ana.client.from("invites").select("id").eq("workspace_id", people.bia.workspaceId);
    assert.equal(seen.data?.length, 0);
    const mine = await people.bia.client.from("invites").select("id").eq("workspace_id", people.bia.workspaceId);
    assert.equal(mine.data?.length, 1);
  });

  test("a pessoa muda o próprio perfil, mas não o e-mail nem o perfil de outra", async () => {
    const name = await people.ana.client.from("profiles").update({ name: "Ana Souza", bio: "oi" }).eq("id", people.ana.id).select("name");
    assert.equal(name.data?.[0]?.name, "Ana Souza");
    const email = await people.ana.client.from("profiles").update({ email: "outro@teste.intellect.local" }).eq("id", people.ana.id);
    assert.ok(email.error, "trocar o e-mail do perfil pela API deveria ser recusado");
    const other = await people.ana.client.from("profiles").update({ name: "hackeada" }).eq("id", people.bia.id).select("id");
    assert.equal(other.data?.length ?? 0, 0);
    const { data } = await admin.from("profiles").select("name, email").eq("id", people.bia.id).single();
    assert.equal(data?.name, "bia");
  });

  test("tabelas sensíveis recusam a chave publishable", async () => {
    for (const table of ["stores", "ad_connections", "webhook_deliveries"]) {
      const { data, error } = await people.ana.client.from(table).select("*").limit(1);
      assert.ok(error || (data ?? []).length === 0, `${table} não pode vazar`);
    }
    const anon = createClient(url!, publishable!, options);
    const profiles = await anon.from("profiles").select("id");
    assert.equal(profiles.data?.length ?? 0, 0, "sem login não se vê perfil nenhum");
  });

  test("imagens: grava na própria pasta, não na de outra pessoa, e o plano de fundo é só do dono", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const ownPath = `avatars/${people.ana.id}/${crypto.randomUUID()}.png`;
    const ok = await people.ana.client.storage.from("uploads").upload(ownPath, png, { contentType: "image/png" });
    assert.ifError(ok.error);

    const foreign = await people.ana.client.storage.from("uploads").upload(`avatars/${people.bia.id}/${crypto.randomUUID()}.png`, png, { contentType: "image/png" });
    assert.ok(foreign.error, "gravar na pasta de outra pessoa deveria ser recusado");

    const wallpaperPath = `wallpapers/${people.ana.id}/${crypto.randomUUID()}.png`;
    assert.ifError((await people.ana.client.storage.from("uploads").upload(wallpaperPath, png, { contentType: "image/png" })).error);
    const bia = await people.bia.client.storage.from("uploads").download(wallpaperPath);
    assert.ok(bia.error, "o plano de fundo de uma pessoa não é visível para outra");
    const owner = await people.ana.client.storage.from("uploads").download(wallpaperPath);
    assert.ifError(owner.error);

    const notImage = await people.ana.client.storage.from("uploads").upload(`avatars/${people.ana.id}/${crypto.randomUUID()}.html`, new Uint8Array([60, 104]), { contentType: "text/html" });
    assert.ok(notImage.error, "só imagem entra no bucket");
    await admin.storage.from("uploads").remove([ownPath, wallpaperPath]);
  });

  test("duas pessoas do mesmo workspace veem a foto uma da outra", async () => {
    await admin.from("workspace_members").insert({ workspace_id: people.ana.workspaceId, user_id: people.bia.id, role: "normal" });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const path = `avatars/${people.ana.id}/${crypto.randomUUID()}.png`;
    assert.ifError((await people.ana.client.storage.from("uploads").upload(path, png, { contentType: "image/png" })).error);
    const seen = await people.bia.client.storage.from("uploads").download(path);
    assert.ifError(seen.error);
    const profile = await people.bia.client.from("profiles").select("id").eq("id", people.ana.id);
    assert.equal(profile.data?.length, 1, "quem divide workspace vê o perfil");
    await admin.storage.from("uploads").remove([path]);
    await admin.from("workspace_members").delete().eq("workspace_id", people.ana.workspaceId).eq("user_id", people.bia.id);
  });
});
