// Segurança da tabela de painéis (dashboard_panels) no Supabase de verdade
// (projeto de TESTE, nunca o principal). Roda com `npm run test:live`.
//
// Ana é admin do workspace A; Caio e Dani são membros comuns de A; Bia é admin
// de outro workspace. Cada um tenta, pela API pública (chave publishable +
// login, o que um navegador consegue fazer), ver e mexer em painéis.

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

type Key = "ana" | "bia" | "caio" | "dani";
type Person = { id: string; client: SupabaseClient };

describe("segurança dos painéis (RLS)", { skip: !enabled || !isTestProject ? "sem .env.test.local do projeto de teste" : false }, () => {
  const admin = enabled ? createClient(url!, secret!, options) : (null as unknown as SupabaseClient);
  const people = {} as Record<Key, Person>;
  const users: string[] = [];
  const workspaces: string[] = [];
  let dashboardA = "";
  let dashboardB = "";

  async function person(key: Key): Promise<Person> {
    const email = `${key}-paineis-${run}@teste.intellect.local`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: key } });
    assert.ifError(created.error);
    users.push(created.data.user!.id);
    const client = createClient(url!, publishable!, options);
    assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
    return { id: created.data.user!.id, client };
  }

  async function workspace(name: string, slug: string, members: { id: string; role: "admin" | "normal" }[]) {
    const ws = await admin.from("workspaces").insert({ name, slug: `${slug}-${run}`, created_by: members[0].id }).select("id").single();
    assert.ifError(ws.error);
    workspaces.push(ws.data!.id);
    for (const m of members) assert.ifError((await admin.from("workspace_members").insert({ workspace_id: ws.data!.id, user_id: m.id, role: m.role })).error);
    const dashboard = await admin.from("dashboards").insert({ workspace_id: ws.data!.id, name: `Loja ${name}` }).select("id").single();
    assert.ifError(dashboard.error);
    return dashboard.data!.id as string;
  }

  const panel = (dashboardId: string, over: Record<string, unknown> = {}) => ({
    dashboard_id: dashboardId,
    name: "Visão geral",
    widgets: [{ id: "kpi-liquido", type: "kpi", metric: "net" }],
    layout: [{ i: "kpi-liquido", x: 0, y: 0, w: 3, h: 3 }],
    ...over,
  });

  before(async () => {
    for (const key of ["ana", "bia", "caio", "dani"] as const) people[key] = await person(key);
    dashboardA = await workspace("Espaço A", "paineis-a", [
      { id: people.ana.id, role: "admin" },
      { id: people.caio.id, role: "normal" },
      { id: people.dani.id, role: "normal" },
    ]);
    dashboardB = await workspace("Espaço B", "paineis-b", [{ id: people.bia.id, role: "admin" }]);
  });

  after(async () => {
    for (const id of workspaces) await admin.from("workspaces").delete().eq("id", id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
  });

  test("o admin cria, muda e apaga painéis do próprio dashboard", async () => {
    const created = await people.ana.client.from("dashboard_panels").insert(panel(dashboardA, { is_default: true })).select("id, name").single();
    assert.ifError(created.error);
    const renamed = await people.ana.client.from("dashboard_panels").update({ name: "Tráfego" }).eq("id", created.data!.id).select("name").single();
    assert.equal(renamed.data?.name, "Tráfego");
    const extra = await people.ana.client.from("dashboard_panels").insert(panel(dashboardA, { name: "Rascunho", position: 1 })).select("id").single();
    assert.ifError(extra.error);
    assert.ifError((await people.ana.client.from("dashboard_panels").delete().eq("id", extra.data!.id)).error);
    const left = await admin.from("dashboard_panels").select("id").eq("id", extra.data!.id);
    assert.equal(left.data?.length, 0);
  });

  test("quem é de outro workspace não vê, não cria e não muda", async () => {
    const seen = await people.bia.client.from("dashboard_panels").select("id").eq("dashboard_id", dashboardA);
    assert.equal(seen.data?.length ?? 0, 0);
    const insert = await people.bia.client.from("dashboard_panels").insert(panel(dashboardA, { name: "Invasão" }));
    assert.ok(insert.error, "criar painel no dashboard de outro workspace deveria ser recusado");
    await people.bia.client.from("dashboard_panels").update({ name: "invadido" }).eq("dashboard_id", dashboardA);
    const names = await admin.from("dashboard_panels").select("name").eq("dashboard_id", dashboardA);
    assert.ok(names.data?.every((p) => p.name !== "invadido"));
    // E a Bia continua mandando no próprio dashboard.
    assert.ifError((await people.bia.client.from("dashboard_panels").insert(panel(dashboardB))).error);
  });

  test("o membro comum vê os painéis do workspace, mas não muda nada", async () => {
    const seen = await people.caio.client.from("dashboard_panels").select("id, name").eq("dashboard_id", dashboardA);
    assert.ok((seen.data?.length ?? 0) >= 1);
    const insert = await people.caio.client.from("dashboard_panels").insert(panel(dashboardA, { name: "Do Caio" }));
    assert.ok(insert.error, "membro comum não cria painel");
    await people.caio.client.from("dashboard_panels").update({ name: "mudado pelo Caio" }).eq("dashboard_id", dashboardA);
    await people.caio.client.from("dashboard_panels").delete().eq("dashboard_id", dashboardA);
    const after = await admin.from("dashboard_panels").select("name").eq("dashboard_id", dashboardA);
    assert.ok((after.data?.length ?? 0) >= 1, "nada foi apagado");
    assert.ok(after.data?.every((p) => p.name !== "mudado pelo Caio"));
  });

  test("painel restrito: só as pessoas liberadas (e o admin) veem", async () => {
    const restricted = await people.ana.client
      .from("dashboard_panels")
      .insert(panel(dashboardA, { name: "Só da Dani", position: 2, visibility: "restricted", viewer_ids: [people.dani.id] }))
      .select("id")
      .single();
    assert.ifError(restricted.error);
    const id = restricted.data!.id;
    assert.equal((await people.dani.client.from("dashboard_panels").select("id").eq("id", id)).data?.length, 1);
    assert.equal((await people.caio.client.from("dashboard_panels").select("id").eq("id", id)).data?.length ?? 0, 0);
    assert.equal((await people.ana.client.from("dashboard_panels").select("id").eq("id", id)).data?.length, 1);
  });

  test("um painel padrão só por dashboard, e formato dos gráficos conferido", async () => {
    const second = await people.ana.client.from("dashboard_panels").insert(panel(dashboardA, { name: "Outro padrão", is_default: true }));
    assert.ok(second.error, "dois painéis padrão no mesmo dashboard deveriam ser recusados");
    const notArray = await people.ana.client.from("dashboard_panels").insert(panel(dashboardA, { name: "Errado", widgets: {} }));
    assert.ok(notArray.error, "widgets precisa ser uma lista");
    const tooMany = await people.ana.client
      .from("dashboard_panels")
      .insert(panel(dashboardA, { name: "Demais", widgets: Array.from({ length: 41 }, (_, i) => ({ id: `k${i}`, type: "kpi", metric: "net" })) }));
    assert.ok(tooMany.error, "mais de 40 gráficos deveria ser recusado");
    const blank = await people.ana.client.from("dashboard_panels").insert(panel(dashboardA, { name: "   " }));
    assert.ok(blank.error, "nome em branco deveria ser recusado");
  });

  test("sem login, nada", async () => {
    const anon = createClient(url!, publishable!, options);
    const { data } = await anon.from("dashboard_panels").select("id");
    assert.equal(data?.length ?? 0, 0);
  });
});
