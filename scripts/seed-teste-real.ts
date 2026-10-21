// npm run seed:teste-real — grava os dados de exemplo do modo simulado no
// projeto de TESTE do Supabase (nunca no principal): as contas da Ana, do Bruno
// e da Carla (com a senha DEMO_PASSWORD do .env.local), o workspace "intellect",
// quadros, cards, automações, dashboards, anúncios, pedidos, custos e painéis.
// Serve para testar o modo real (npm run dev:teste-real) com dados de verdade
// no banco. Rodar de novo apaga o que o script criou antes e grava tudo de novo.

import fs from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { writeSeed } from "../server/live/write-seed.ts";
import { createSeed } from "../server/store/seed.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secret = process.env.SUPABASE_SECRET_KEY ?? "";
if (!url.includes("aqaijwpnudhftlxwsfdm") || !secret) {
  console.error("Rode com --env-file=.env.test.local (só o projeto de teste, intellect-teste).");
  process.exit(1);
}

/** A senha das contas de exemplo: a mesma do modo simulado (DEMO_PASSWORD no .env.local). */
function demoPassword() {
  const line = fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DEMO_PASSWORD="));
  const value = line?.slice("DEMO_PASSWORD=".length).trim();
  if (!value) throw new Error("Falta DEMO_PASSWORD no .env.local.");
  return value;
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const step = (text: string) => console.log(`- ${text}`);

const seed = createSeed(new Date());
const password = demoPassword();

// 1. Apaga o que uma rodada anterior criou (o workspace leva junto quadros, dashboards, pedidos...).
for (const w of seed.workspaces) await admin.from("workspaces").delete().eq("slug", w.slug);
const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 });
for (const u of existing?.users ?? []) {
  if (seed.users.some((s) => s.email.toLowerCase() === u.email?.toLowerCase())) await admin.auth.admin.deleteUser(u.id);
}
// As lojas do exemplo também (a loja é única pelo endereço, em qualquer workspace).
for (const s of seed.stores) await admin.from("stores").delete().eq("shop_domain", s.shopDomain);
step("rodada anterior apagada");

// 2. Contas, perfis, workspace e todo o resto (imagens enviadas ficam de fora).
const started = Date.now();
const { changes } = await writeSeed(admin, seed, password);
step(`${seed.users.length} contas criadas (senha: a DEMO_PASSWORD do .env.local)`);
for (const c of changes) {
  const count = c.inserts.length + c.upserts.length;
  if (count) step(`${c.spec.table}: ${count}`);
}
step(`gravado em ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log("\nPronto. Ligue o app com npm run dev:teste-real e entre como ana@intellect.test.");
