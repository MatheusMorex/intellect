// npm run test:e2e:live:vendas — vendas e anúncios no modo real (AUTH_MODE=live),
// num navegador de verdade, com o app ligado ao projeto de TESTE do Supabase
// (nunca o principal). Grava uma cópia do exemplo (ids e e-mails novos), entra
// como a Ana da cópia e percorre Resumo, Meta, Google, Vendas, Taxas, Despesas e
// Painéis, conferindo as mudanças direto no banco. Um pedido assinado como a
// Shopify assina entra pela rota do webhook. No fim, apaga tudo.
//
// O servidor precisa estar rodando no modo real com as chaves do projeto de
// teste (npm run dev:teste-real; veja o README, "Testar o modo real").

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

import { copyWithNewIds, writeSeed } from "../../server/live/write-seed.ts";
import { createSeed } from "../../server/store/seed.ts";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Trava de segurança: este teste cria e apaga dados.
if (!url.includes("aqaijwpnudhftlxwsfdm") || !process.env.SUPABASE_SECRET_KEY) {
  console.error("Rode com --env-file=.env.test.local (projeto de teste).");
  process.exit(1);
}
// A mesma chave do webhook que o servidor usa (vem do .env.local).
const webhookSecret = fs
  .readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("SHOPIFY_WEBHOOK_SECRET="))
  ?.slice("SHOPIFY_WEBHOOK_SECRET=".length)
  .trim();
if (!webhookSecret) {
  console.error("Falta o SHOPIFY_WEBHOOK_SECRET no .env.local.");
  process.exit(1);
}

const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = crypto.randomUUID().slice(0, 8);
const PASSWORD = "Teste-Segura-123";

const { data } = await writeSeed(admin, copyWithNewIds(createSeed(new Date()), `e2e-${run}`), PASSWORD);
const ana = data.users.find((u) => u.email.startsWith("ana-"));
const slug = data.workspaces[0].slug;
const dashboardId = data.dashboards[0].id;
const shop = data.stores[0];

const db = async (table, filter) => {
  const { data: found, error } = await filter(admin.from(table).select("*"));
  assert.ifError(error);
  return found;
};
/** Espera o banco chegar no estado (a gravação acontece depois do clique). */
async function until(check, what) {
  for (let i = 0; i < 60; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.fail(`o banco não chegou em: ${what}`);
}

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER ?? "msedge", headless: true });
const problems = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", reducedMotion: "reduce" });
context.setDefaultTimeout(90_000);
const page = await context.newPage();
page.on("pageerror", (e) => problems.push(`erro na página: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/width\(0\)|Download the React DevTools/.test(m.text())) problems.push(`console: ${m.text()}`);
});

let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FALHOU ${name}\n     ${String(error.message ?? error).split("\n").slice(0, 4).join("\n     ")}`);
    await page.screenshot({ path: `.data/e2e-live-vendas-falha-${failed}.png`, fullPage: true }).catch(() => {});
  }
}

async function hydrated(locator) {
  await locator.waitFor();
  await locator.evaluate(
    (el) =>
      new Promise((resolve) => {
        const check = () => (Object.keys(el).some((k) => k.startsWith("__reactProps$")) ? resolve() : setTimeout(check, 50));
        check();
      }),
  );
  return locator;
}

/** O número em destaque de um cartão ("R$ 1.234,56"). */
async function kpiValue(label) {
  const card = page.getByRole("group", { name: new RegExp(`^${label}: `) }).first();
  await card.waitFor();
  return (await card.locator("p.font-bold").first().innerText()).trim();
}

try {
  await step("login como a Ana da cópia", async () => {
    await page.goto(`${BASE}/login`);
    await (await hydrated(page.getByLabel("E-mail"))).fill(ana.email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(new RegExp(`/w/${slug}`));
  });

  await step("Resumo: números do banco, iguais aos dos Painéis no mesmo período", async () => {
    await page.goto(`${BASE}/d/${dashboardId}?periodo=30d`);
    const resumo = { net: await kpiValue("Faturamento líquido"), roas: await kpiValue("ROAS"), cpa: await kpiValue("CPA") };
    assert.notEqual(resumo.net, "R$ 0,00", "o Resumo veio zerado");
    await page.goto(`${BASE}/d/${dashboardId}/paineis?periodo=30d`);
    const paineis = { net: await kpiValue("Faturamento líquido"), roas: await kpiValue("ROAS"), cpa: await kpiValue("CPA") };
    assert.deepEqual({ ...paineis, roas: paineis.roas.replace(/x$/, "") }, resumo);
    await page.locator("figure canvas").first().waitFor();
    assert.ok((await page.locator("figure canvas").count()) >= 6, "deveria ter pelo menos 6 gráficos desenhados");
  });

  await step("Meta: pausar e ativar a campanha grava no banco", async () => {
    await page.goto(`${BASE}/d/${dashboardId}/meta?periodo=30d`);
    const name = "[Vendas] Semelhantes a compradores 1%";
    const campaign = data.campaigns.find((c) => c.name === name);
    await (await hydrated(page.getByRole("switch", { name: new RegExp(`${name.replace(/[[\]]/g, "\\$&")}: ativo`) }))).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Pausar" }).click();
    await until(async () => (await db("campaigns", (q) => q.eq("id", campaign.id)))[0].status === "paused", "campanha pausada");
    await page.getByRole("switch", { name: /Semelhantes a compradores 1%: pausado/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Ativar" }).click();
    await until(async () => (await db("campaigns", (q) => q.eq("id", campaign.id)))[0].status === "active", "campanha ativa de novo");
  });

  await step("Meta: mudar o orçamento diário grava no banco", async () => {
    const campaign = data.campaigns.find((c) => c.name === "[Vendas] Remarketing 30d");
    const row = page.getByRole("row", { name: /\[Vendas\] Remarketing 30d/ });
    await row.hover();
    await page.getByRole("button", { name: "Editar orçamento de [Vendas] Remarketing 30d" }).click();
    await page.getByLabel("Novo orçamento (R$)").fill("123,45");
    await page.getByRole("button", { name: "Mudar orçamento" }).click();
    await page.getByText("R$ 123,45").first().waitFor();
    await until(async () => (await db("campaigns", (q) => q.eq("id", campaign.id)))[0].daily_budget_cents === 12345, "orçamento 123,45");
  });

  await step("Meta: abrir os conjuntos de uma campanha", async () => {
    await page.getByRole("link", { name: "[Vendas] Remarketing 30d" }).click();
    await page.waitForURL(/nivel=conjuntos/);
    await page.getByText("Visitou produto 30d").first().waitFor();
  });

  await step("Google: campanhas e palavras-chave", async () => {
    await page.goto(`${BASE}/d/${dashboardId}/google?periodo=30d`);
    await page.getByText("Pesquisa · Genérica").first().waitFor();
    await page.goto(`${BASE}/d/${dashboardId}/google?periodo=30d&nivel=palavras`);
    await page.getByRole("table").getByRole("row").nth(1).waitFor();
  });

  await step("Taxas: salvar o imposto sobre vendas grava no banco", async () => {
    await page.goto(`${BASE}/d/${dashboardId}/fees`);
    await (await hydrated(page.getByLabel("Imposto sobre vendas (%)"))).fill("6,5");
    await page.getByRole("button", { name: "Salvar impostos" }).click();
    await page.getByText("Impostos salvos").waitFor();
    await until(async () => (await db("cost_settings", (q) => q.eq("dashboard_id", dashboardId).eq("sales_tax_bp", 650))).length === 1, "imposto 6,5%");
  });

  await step("Despesas: lançar e excluir, no banco", async () => {
    const description = `Despesa do teste ${run}`;
    await page.goto(`${BASE}/d/${dashboardId}/expenses?periodo=mes`);
    await (await hydrated(page.getByRole("button", { name: "Nova despesa" }))).click();
    await page.getByLabel("Descrição (obrigatório)").fill(description);
    await page.getByLabel("Valor (R$)").fill("99,90");
    await page.getByRole("button", { name: "Salvar despesa" }).click();
    await page.getByText(description, { exact: true }).waitFor();
    const [row] = await db("expenses", (q) => q.eq("dashboard_id", dashboardId).eq("description", description));
    assert.equal(row?.amount_cents, 9990);
    await page.getByRole("button", { name: `Excluir a despesa ${description}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
    await page.getByText(description, { exact: true }).waitFor({ state: "detached" });
    await until(async () => (await db("expenses", (q) => q.eq("id", row.id))).length === 0, "despesa apagada");
  });

  await step("webhook da Shopify: o pedido assinado entra no banco e aparece em Vendas", async () => {
    const numericId = Date.now();
    const at = new Date().toISOString();
    const order = {
      id: numericId,
      admin_graphql_api_id: `gid://shopify/Order/${numericId}`,
      name: `#E2E${run}`,
      created_at: at,
      updated_at: at,
      processed_at: at,
      cancelled_at: null,
      financial_status: "paid",
      currency: "BRL",
      total_price: "497.00",
      subtotal_price: "497.00",
      total_tax: "0.00",
      total_discounts: "0.00",
      total_shipping_price_set: { shop_money: { amount: "0.00", currency_code: "BRL" } },
      payment_gateway_names: ["pix"],
      test: false,
      line_items: [{ id: numericId + 1, product_id: 8400100, title: "Kit Essencial", quantity: 1, price: "497.00" }],
      refunds: [],
    };
    const body = JSON.stringify(order);
    const headers = {
      "content-type": "application/json",
      "x-shopify-topic": "orders/paid",
      "x-shopify-shop-domain": shop.shopDomain,
      "x-shopify-webhook-id": `e2e-${run}`,
    };
    const forged = await fetch(`${BASE}/api/webhooks/shopify`, { method: "POST", headers: { ...headers, "x-shopify-hmac-sha256": "assinatura-falsa" }, body });
    assert.equal(forged.status, 401, "assinatura falsa deveria ser recusada");
    const hmac = crypto.createHmac("sha256", webhookSecret).update(body, "utf8").digest("base64");
    const response = await fetch(`${BASE}/api/webhooks/shopify`, { method: "POST", headers: { ...headers, "x-shopify-hmac-sha256": hmac }, body });
    assert.equal(response.status, 200);
    await until(async () => (await db("orders", (q) => q.eq("store_id", shop.id).eq("name", order.name))).length === 1, "pedido gravado");
    const [saved] = await db("orders", (q) => q.eq("store_id", shop.id).eq("name", order.name));
    assert.equal(saved.total_cents, 49700);
    assert.equal(saved.status, "paid");
    await page.goto(`${BASE}/d/${dashboardId}/orders?periodo=hoje`);
    await page.getByText(order.name).first().waitFor();
  });

  await step("Vendas: abrir o detalhe de um pedido", async () => {
    await (await hydrated(page.locator("table a").first())).click();
    await page.getByRole("heading", { name: /Pedido #/ }).waitFor();
    await page.getByText("Jornada até a compra").waitFor();
  });

  await step("quadro: o card ligado à campanha mostra o ROAS (vendas e anúncios do banco)", async () => {
    const link = data.cardLinks[0];
    const card = data.cards.find((c) => c.id === link.cardId);
    await page.goto(`${BASE}/b/${card.boardId}`);
    const front = page.getByRole("button", { name: new RegExp(card.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first();
    await front.waitFor();
    assert.match(await front.innerText(), /ROAS/);
  });

  await step("sem erros no console", async () => {
    assert.deepEqual(problems, []);
  });
} finally {
  await browser.close();
  await admin.from("workspaces").delete().eq("id", data.workspaces[0].id);
  await admin.from("stores").delete().eq("shop_domain", shop.shopDomain);
  await admin.from("webhook_deliveries").delete().eq("delivery_id", `e2e-${run}`);
  for (const u of data.users) await admin.auth.admin.deleteUser(u.id);
}

console.log(failed ? `\n${failed} passo(s) falharam.` : "\nTudo certo.");
process.exit(failed ? 1 : 0);
