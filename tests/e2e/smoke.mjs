// npm run test:e2e — percorre os fluxos principais num navegador de verdade
// (o Edge instalado no Windows, sem baixar outro), com o app rodando em
// http://localhost:3000 no modo simulado. Cada passo imprime ok ou o erro.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

import { chromium } from "playwright-core";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const store = () => JSON.parse(fs.readFileSync(".data/store.json", "utf8"));

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER ?? "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", reducedMotion: "reduce" });
context.setDefaultTimeout(90_000);
const page = await context.newPage();
const problems = [];
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
    await page.screenshot({ path: `.data/e2e-falha-${failed}.png`, fullPage: true }).catch(() => {});
  }
}

const dashboardId = store().dashboards[0].id;
const boardId = store().boards[0].id;

await step("login com senha errada mostra o erro", async () => {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("E-mail").fill("ana@intellect.test");
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByText("E-mail ou senha não conferem.").waitFor();
});

await step("login com a senha de teste entra no Início", async () => {
  await page.getByLabel("Senha", { exact: true }).fill(env.DEMO_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/w\/intellect/);
  await page.getByRole("heading", { name: /Olá, Ana/ }).waitFor();
});

await step("criar card no quadro", async () => {
  await page.goto(`${BASE}/b/${boardId}`);
  const list = page.getByRole("region", { name: "Lista Ideias" });
  await list.getByRole("button", { name: "Adicionar card" }).click();
  const name = `Card do teste automático ${Date.now()}`;
  await list.getByRole("textbox").fill(name);
  await list.getByRole("textbox").press("Enter");
  await list.getByRole("link", { name }).waitFor();
  await list.getByRole("textbox").waitFor();
  assert.equal(await list.getByRole("textbox").inputValue(), "", "o campo deveria limpar e continuar aberto");
});

await step("período: escolher Ontem muda a URL", async () => {
  await page.goto(`${BASE}/d/${dashboardId}`);
  await page.getByRole("button", { name: /Últimos 7 dias/ }).click();
  await page.getByRole("radio", { name: "Ontem" }).click();
  await page.waitForURL(/periodo=ontem/);
});

await step("filtro de fonte: só Meta", async () => {
  await page.getByRole("button", { name: /Fonte de tráfego/ }).click();
  await page.getByRole("option", { name: "Meta" }).click();
  await page.keyboard.press("Escape");
  await page.waitForURL(/fonte=meta/);
});

await step("Meta: criar card a partir da campanha", async () => {
  await page.goto(`${BASE}/d/${dashboardId}/meta?periodo=30d`);
  await page.getByRole("button", { name: /Ações de \[Vendas\] Remarketing 30d/ }).click();
  await page.getByRole("menuitem", { name: "Criar card" }).click();
  await page.getByRole("button", { name: "Criar card" }).click();
  await page.getByText(/Card criado em/).waitFor();
  const s = store();
  const card = s.cards.find((c) => c.name === "Acompanhar [Vendas] Remarketing 30d");
  assert.ok(card, "o card não foi gravado");
  assert.ok(s.cardLinks.some((l) => l.cardId === card.id && l.targetType === "campaign"), "o card não ficou ligado à campanha");
});

await step("Meta: pausar campanha com confirmação", async () => {
  await page.getByRole("switch", { name: /\[Vendas\] Semelhantes a compradores 1%: ativo/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Pausar" }).click();
  await page.getByRole("switch", { name: /\[Vendas\] Semelhantes a compradores 1%: pausado/ }).waitFor();
  assert.equal(store().campaigns.find((c) => c.name.startsWith("[Vendas] Semelhantes")).status, "paused");
});

await step("Meta: ativar de novo", async () => {
  await page.getByRole("switch", { name: /\[Vendas\] Semelhantes a compradores 1%: pausado/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Ativar" }).click();
  await page.getByRole("switch", { name: /\[Vendas\] Semelhantes a compradores 1%: ativo/ }).waitFor();
});

await step("Meta: mudar o orçamento diário", async () => {
  const row = page.getByRole("row", { name: /\[Vendas\] Remarketing 30d/ });
  await row.hover();
  await page.getByRole("button", { name: "Editar orçamento de [Vendas] Remarketing 30d" }).click();
  await page.getByLabel("Novo orçamento (R$)").fill("123,45");
  await page.getByRole("button", { name: "Mudar orçamento" }).click();
  await page.getByText("R$ 123,45").first().waitFor();
  assert.equal(store().campaigns.find((c) => c.name === "[Vendas] Remarketing 30d").dailyBudgetCents, 12345);
});

await step("Meta: abrir os conjuntos de uma campanha", async () => {
  await page.getByRole("link", { name: "[Vendas] Remarketing 30d" }).click();
  await page.waitForURL(/nivel=conjuntos/);
  await page.getByText("Visitou produto 30d").first().waitFor();
});

await step("Taxas: salvar o imposto sobre vendas", async () => {
  await page.goto(`${BASE}/d/${dashboardId}/fees`);
  await page.getByLabel("Imposto sobre vendas (%)").fill("6,5");
  await page.getByRole("button", { name: "Salvar impostos" }).click();
  await page.getByText("Impostos salvos").waitFor();
  await page.getByText("Histórico de impostos").waitFor();
  const settings = store().costSettings.sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
  assert.equal(settings[0].salesTaxBp, 650);
});

await step("Taxas: valor inválido mostra o erro", async () => {
  await page.getByLabel("Imposto sobre vendas (%)").fill("abc");
  await page.getByRole("button", { name: "Salvar impostos" }).click();
  await page.getByText(/use um percentual entre 0 e 100/).waitFor();
});

await step("Despesas: lançar e excluir", async () => {
  await page.goto(`${BASE}/d/${dashboardId}/expenses?periodo=mes`);
  await page.getByRole("button", { name: "Nova despesa" }).click();
  await page.getByLabel("Descrição (obrigatório)").fill("Despesa do teste automático");
  await page.getByLabel("Valor (R$)").fill("99,90");
  await page.getByRole("button", { name: "Salvar despesa" }).click();
  await page.getByText("Despesa do teste automático").waitFor();
  await page.getByRole("button", { name: "Excluir a despesa Despesa do teste automático" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
  await page.getByText("Despesa do teste automático").waitFor({ state: "detached" });
});

await step("Integrações: teste de integração recebe o pedido simulado", async () => {
  await page.goto(`${BASE}/d/${dashboardId}/integrations?aba=testes`);
  await page.getByLabel("Link da página da campanha").fill("https://intellect-loja-demo.myshopify.com/products/kit-essencial");
  await page.getByRole("button", { name: "Gerar link de teste" }).click();
  await page.getByText(/simulate:order -- --teste/).waitFor();
  const code = store().integrationTests.at(-1).testCode;
  execFileSync(process.execPath, ["scripts/simulate-order.mjs", "--campanha", "remarketing", "--teste", code], { stdio: "pipe" });
  for (let i = 0; i < 30; i++) {
    if (store().integrationTests.find((t) => t.testCode === code)?.status !== "waiting") break;
    await page.waitForTimeout(1000);
  }
  assert.equal(store().integrationTests.find((t) => t.testCode === code).status, "attributed");
  const order = store().orders.at(-1);
  assert.equal(order.isTest, true, "o pedido de teste deveria ficar fora das métricas");
});

await step("Vendas: abrir o detalhe de um pedido", async () => {
  await page.goto(`${BASE}/d/${dashboardId}/orders?periodo=hoje`);
  await page.locator("table a").first().click();
  await page.getByRole("heading", { name: /Pedido #/ }).waitFor();
  await page.getByText("Jornada até a compra").waitFor();
});

await step("sair", async () => {
  await page.getByRole("button", { name: /Menu de Ana Lima/ }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await page.waitForURL(/\/login/);
});

await step("sem erros no console", async () => {
  assert.deepEqual(problems, []);
});

await browser.close();
console.log(failed ? `\n${failed} passo(s) falharam. Capturas em .data/e2e-falha-*.png` : "\nTodos os passos passaram.");
process.exit(failed ? 1 : 0);
