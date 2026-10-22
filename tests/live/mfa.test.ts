// Verificação em duas etapas (2FA) no Supabase de verdade (projeto de TESTE).
// Rodam com `npm run test:live`.
//
// O "celular" é tests/totp.ts. Quem liga o 2FA e entra só com a senha não lê
// nada pela API pública (regras "restrictive" da migração mfa_aal2) até digitar
// o código; quem não ligou segue como antes.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, describe, test } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { freshTotp, totp } from "../totp.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const enabled = Boolean(url && publishable && secret);
// Trava de segurança: estes testes criam e apagam dados.
const isTestProject = (url ?? "").includes("aqaijwpnudhftlxwsfdm");

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const run = crypto.randomUUID().slice(0, 8);
const password = "Teste-Segura-123";

describe("verificação em duas etapas (2FA)", { skip: !enabled || !isTestProject ? "sem .env.test.local do projeto de teste" : false }, () => {
  const admin = enabled ? createClient(url!, secret!, options) : (null as unknown as SupabaseClient);
  const people = {} as Record<"ana" | "bia", { id: string; email: string; workspaceId: string }>;
  let mfa: typeof import("../../server/auth/mfa.ts");
  let secretKey = "";
  let factorId = "";
  const used = new Set<string>();

  async function signIn(email: string) {
    const client = createClient(url!, publishable!, options);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    assert.ifError(signedIn.error);
    return client;
  }
  const ownProfile = async (client: SupabaseClient, id: string) => (await client.from("profiles").select("id").eq("id", id)).data?.length ?? 0;
  const ownWorkspaces = async (client: SupabaseClient) => (await client.from("workspaces").select("id")).data?.length ?? 0;

  before(async () => {
    for (const key of ["ana", "bia"] as const) {
      const email = `${key}-2fa-${run}@teste.intellect.local`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: key } });
      assert.ifError(created.error);
      const id = created.data.user!.id;
      const workspace = await admin.from("workspaces").insert({ name: `Espaço ${key}`, slug: `${key}-2fa-${run}`, created_by: id }).select("id").single();
      assert.ifError(workspace.error);
      assert.ifError((await admin.from("workspace_members").insert({ workspace_id: workspace.data!.id, user_id: id, role: "admin" })).error);
      people[key] = { id, email, workspaceId: workspace.data!.id };
    }
    mfa = await import("../../server/auth/mfa.ts");
  });

  after(async () => {
    if (!enabled || !isTestProject) return;
    for (const p of Object.values(people)) {
      await admin.from("workspaces").delete().eq("id", p.workspaceId);
      await admin.auth.admin.deleteUser(p.id);
    }
  });

  test("sem 2FA, tudo como antes", async () => {
    const client = await signIn(people.ana.email);
    assert.equal(await ownProfile(client, people.ana.id), 1);
    assert.equal(await ownWorkspaces(client), 1);
    assert.equal(await mfa.hasVerifiedFactor(people.ana.id), false);
  });

  test("ligar: código errado não liga; o certo liga e a sessão sobe para aal2", async () => {
    const client = await signIn(people.ana.email);
    const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Aplicativo autenticador" });
    assert.ifError(enrolled.error);
    assert.match(enrolled.data!.totp.qr_code, /^data:image\/svg\+xml/);
    secretKey = enrolled.data!.totp.secret;
    factorId = enrolled.data!.id;
    // Fator ainda não confirmado não conta.
    mfa.forgetFactor(people.ana.id);
    assert.equal(await mfa.hasVerifiedFactor(people.ana.id), false);

    const wrong = await client.auth.mfa.challengeAndVerify({ factorId, code: totp(secretKey) === "000000" ? "111111" : "000000" });
    assert.ok(wrong.error, "código errado deveria falhar");
    const right = await client.auth.mfa.challengeAndVerify({ factorId, code: await freshTotp(secretKey, used) });
    assert.ifError(right.error);
    const level = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    assert.equal(level.data?.currentLevel, "aal2");
    assert.equal(await ownProfile(client, people.ana.id), 1);

    mfa.forgetFactor(people.ana.id);
    assert.equal(await mfa.hasVerifiedFactor(people.ana.id), true);
    assert.equal(await mfa.hasVerifiedFactor(people.bia.id), false);
  });

  test("com o 2FA ligado, entrar só com a senha não lê nem grava nada", async () => {
    const client = await signIn(people.ana.email);
    const level = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    assert.equal(level.data?.currentLevel, "aal1");
    assert.equal(level.data?.nextLevel, "aal2");
    assert.equal(await ownProfile(client, people.ana.id), 0);
    assert.equal(await ownWorkspaces(client), 0);
    const write = await client.from("workspaces").update({ name: "mudado sem o código" }).eq("id", people.ana.workspaceId).select("id");
    assert.equal(write.data?.length ?? 0, 0);
    const check = await admin.from("workspaces").select("name").eq("id", people.ana.workspaceId).single();
    assert.equal(check.data?.name, "Espaço ana");
    const files = await client.storage.from("uploads").list(`avatars/${people.ana.id}`);
    assert.equal(files.data?.length ?? 0, 0);
  });

  test("depois do código, lê de novo; a Bia (sem 2FA) nunca foi afetada", async () => {
    const client = await signIn(people.ana.email);
    assert.ifError((await client.auth.mfa.challengeAndVerify({ factorId, code: await freshTotp(secretKey, used) })).error);
    assert.equal(await ownProfile(client, people.ana.id), 1);
    assert.equal(await ownWorkspaces(client), 1);
    const bia = await signIn(people.bia.email);
    assert.equal(await ownProfile(bia, people.bia.id), 1);
  });

  test("desligar: tirar o fator (com a sessão aal2) volta ao normal", async () => {
    const client = await signIn(people.ana.email);
    assert.ifError((await client.auth.mfa.challengeAndVerify({ factorId, code: await freshTotp(secretKey, used) })).error);
    assert.ifError((await client.auth.mfa.unenroll({ factorId })).error);
    mfa.forgetFactor(people.ana.id);
    assert.equal(await mfa.hasVerifiedFactor(people.ana.id), false);
    const plain = await signIn(people.ana.email);
    assert.equal(await ownProfile(plain, people.ana.id), 1);
  });
});
