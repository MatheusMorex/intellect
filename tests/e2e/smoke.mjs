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
  await list.getByRole("button", { name, exact: true }).waitFor();
  await list.getByRole("textbox").waitFor();
  assert.equal(await list.getByRole("textbox").inputValue(), "", "o campo deveria limpar e continuar aberto");
});

// ---- kanban (etapa 2.2) -------------------------------------------------------------------------------

const FRETE = "Testar frete grátis acima de R$ 200";
const cardByName = (name) => store().cards.find((c) => c.name === name);
const listOf = (card) => store().lists.find((l) => l.id === card.listId)?.name;

await step("quadro: Enter abre o verso do card", async () => {
  await page.goto(`${BASE}/b/${boardId}`);
  await page.getByRole("button", { name: FRETE, exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/card=/);
  await page.getByRole("dialog").getByRole("heading", { name: /Testar frete grátis/ }).waitFor();
});

await step("card: descrição salva com Ctrl+Enter", async () => {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Adicione uma descrição/ }).click();
  const editor = dialog.getByRole("textbox", { name: "Descrição do card" });
  await editor.click();
  await editor.pressSequentially("Comparar a conversão com e sem frete grátis.");
  await page.keyboard.press("Control+Enter");
  await editor.waitFor({ state: "detached" });
  await dialog.getByText("Comparar a conversão com e sem frete grátis.").waitFor();
  assert.match(cardByName(FRETE).descriptionText, /frete grátis/);
});

await step("card: checklist com item concluído", async () => {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Checklist", exact: true }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Passos do teste");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await dialog.getByRole("heading", { name: "Passos do teste" }).waitFor();
  await dialog.getByRole("button", { name: "Adicionar um item" }).click();
  await dialog.getByRole("textbox", { name: "Novo item" }).fill("Primeiro passo");
  await dialog.getByRole("textbox", { name: "Novo item" }).press("Enter");
  await dialog.getByRole("checkbox", { name: "Primeiro passo" }).click();
  await dialog.getByText("100%").waitFor();
});

await step("card: comentário com @menção avisa o Bruno", async () => {
  const s0 = store();
  const bruno = s0.users.find((u) => u.email.startsWith("bruno"));
  const before = s0.notifications.filter((n) => n.userId === bruno.id && n.type === "mention").length;
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Escreva um comentário…" }).click();
  const editor = dialog.getByRole("textbox", { name: "Novo comentário" });
  await editor.pressSequentially("Pode revisar, @bru");
  await page.getByRole("option", { name: /Bruno Rocha/ }).waitFor();
  await page.keyboard.press("Enter");
  await editor.pressSequentially("obrigado!");
  await dialog.getByRole("button", { name: "Comentar", exact: true }).click();
  await editor.waitFor({ state: "detached" });
  await dialog.getByText("obrigado!").waitFor();
  const after = store().notifications.filter((n) => n.userId === bruno.id && n.type === "mention").length;
  assert.equal(after, before + 1, "o Bruno deveria ter uma menção nova");
});

await step("quadro: Esc fecha o card e o teclado move o card de lista", async () => {
  await page.keyboard.press("Escape");
  await page.waitForURL((u) => !new URL(u).searchParams.has("card"));
  assert.equal(listOf(cardByName(FRETE)), "Ideias");
  await page.getByRole("button", { name: FRETE, exact: true }).focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  await page.keyboard.press("Space");
  for (let i = 0; i < 20 && listOf(cardByName(FRETE)) === "Ideias"; i++) await page.waitForTimeout(500);
  assert.equal(listOf(cardByName(FRETE)), "A fazer");
});

await step("compartilhar: e-mail de fora recebe convite", async () => {
  await page.getByRole("button", { name: "Compartilhar" }).click();
  await page.getByLabel("E-mail ou nome").fill("convidada.teste@intellect.test");
  await page.getByRole("dialog").getByRole("button", { name: "Convidar" }).click();
  await page.getByLabel("Link do convite").waitFor();
  const mail = store().outbox.at(-1);
  assert.equal(mail.to, "convidada.teste@intellect.test");
  assert.ok(mail.link?.includes("/invite/"), "o e-mail deveria ter o link do convite");
  await page.keyboard.press("Escape");
});

await step("convite: senha fraca dá erro, depois cria a conta e abre o quadro", async () => {
  const link = store().outbox.at(-1).link;
  const guest = await browser.newContext({ locale: "pt-BR", reducedMotion: "reduce" });
  guest.setDefaultTimeout(90_000);
  const gp = await guest.newPage();
  await gp.goto(link);
  await gp.getByRole("heading", { name: /convidou você para o quadro/ }).waitFor();
  await gp.getByLabel("Seu nome").fill("Convidada Teste");
  await gp.getByLabel("Crie uma senha").fill("fraca");
  await gp.getByRole("button", { name: "Criar conta e entrar" }).click();
  await gp.getByText(/A senha precisa de 8 a 50 caracteres/).waitFor();
  assert.equal(await gp.getByLabel("Seu nome").inputValue(), "Convidada Teste", "o nome digitado deveria continuar no campo");
  await gp.getByLabel("Crie uma senha").fill(`Teste#${Date.now()}`);
  await gp.getByRole("button", { name: "Criar conta e entrar" }).click();
  await gp.waitForURL(new RegExp(`/b/${boardId}`));
  await guest.close();
  const s = store();
  const guestUser = s.users.find((u) => u.email === "convidada.teste@intellect.test");
  assert.ok(s.boardMembers.some((m) => m.boardId === boardId && m.userId === guestUser.id), "a convidada deveria virar membro do quadro");
});

await step("busca global: / acha o card e abre", async () => {
  await page.goto(`${BASE}/w/intellect`);
  await page.getByRole("heading", { name: /Olá, Ana/ }).click();
  await page.keyboard.press("/");
  await page.getByPlaceholder(/Buscar quadros, cards/).fill("remarketing");
  await page.getByRole("option", { name: /Escalar o Remarketing 30d/ }).click();
  await page.waitForURL(/card=/);
  await page.getByRole("dialog").getByRole("heading", { name: /Escalar o Remarketing 30d/ }).waitFor();
});

await step("criar quadro pelo Início", async () => {
  await page.goto(`${BASE}/w/intellect`);
  await page.getByRole("main").getByRole("button", { name: "Criar quadro" }).first().click();
  await page.getByLabel("Nome do quadro").fill("Quadro do teste automático");
  await page.getByRole("radio", { name: "verde" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Criar quadro" }).click();
  await page.waitForURL(/\/b\//);
  await page.getByRole("heading", { name: /Quadro do teste automático/ }).waitFor();
});

await step("perfil: modo para daltônicos liga e desliga", async () => {
  await page.goto(`${BASE}/me`);
  const toggle = page.getByRole("switch", { name: "Modo para daltônicos" });
  await toggle.click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.colorblind === "on");
  await toggle.click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.colorblind !== "on");
});

await step("notificações: o Bruno vê a menção e marca como lida", async () => {
  await page.goto(`${BASE}/api/dev/login?email=bruno@intellect.test&next=${encodeURIComponent("/w/intellect")}`);
  await page.getByRole("button", { name: /Notificações, \d+ não lidas/ }).click();
  await page.getByText(/mencionou você em Testar frete grátis/).first().waitFor();
  await page.getByRole("button", { name: "Marcar todas como lidas" }).click();
  await page.getByRole("button", { name: "Notificações", exact: true }).waitFor();
  await page.goto(`${BASE}/api/dev/login?email=ana@intellect.test&next=${encodeURIComponent("/w/intellect")}`);
  await page.getByRole("heading", { name: /Olá, Ana/ }).waitFor();
});

// ---- automação (etapa 2.3) ----------------------------------------------------------------------------

await step("automação: criar regra pelo construtor", async () => {
  await page.goto(`${BASE}/b/${boardId}/automation`);
  await page.getByRole("heading", { name: "Concluir ao chegar em Feito" }).waitFor();
  await page.getByRole("link", { name: "Criar regra" }).first().click();
  await page.waitForURL(/automation\/new\?tipo=rule/);
  await page.getByLabel("Nome da automação").fill("Criativo novo ganha etiqueta");
  await page.getByLabel("Quando", { exact: true }).click();
  await page.getByRole("option", { name: "Um card for criado" }).click();
  await page.getByLabel("Na lista").click();
  await page.getByRole("option", { name: "Ideias" }).click();
  await page.getByLabel("Ação 1", { exact: true }).click();
  await page.getByRole("option", { name: "Colocar etiqueta" }).click();
  await page.getByLabel("Etiqueta", { exact: true }).click();
  await page.getByRole("option", { name: "Criativo" }).click();
  await page.getByText(/criado em “Ideias”: colocar a etiqueta “Criativo”/).waitFor();
  await page.getByRole("button", { name: "Criar automação" }).click();
  await page.waitForURL(/automation\?aba=regras/);
  await page.getByRole("heading", { name: "Criativo novo ganha etiqueta" }).waitFor();
});

await step("automação: a regra roda quando o card nasce", async () => {
  await page.goto(`${BASE}/b/${boardId}`);
  const list = page.getByRole("region", { name: "Lista Ideias" });
  await list.getByRole("button", { name: "Adicionar card" }).click();
  await list.getByRole("textbox").fill("Ideia de criativo com a regra");
  await list.getByRole("textbox").press("Enter");
  await list.getByRole("button", { name: "Ideia de criativo com a regra", exact: true }).waitFor();
  const s = store();
  const card = s.cards.find((c) => c.name === "Ideia de criativo com a regra");
  const criativo = s.labels.find((l) => l.boardId === boardId && l.name === "Criativo");
  assert.ok(s.cardLabels.some((l) => l.cardId === card.id && l.labelId === criativo.id), "a regra deveria ter colocado a etiqueta");
  const auto = s.automations.find((a) => a.name === "Criativo novo ganha etiqueta");
  assert.equal(s.automationRuns.filter((r) => r.automationId === auto.id).at(-1).status, "success");
});

await step("automação: botão do card no verso", async () => {
  const card = store().cards.find((c) => c.name === "Roteiro de vídeo com depoimento de cliente");
  await page.goto(`${BASE}/b/${boardId}?card=${card.id}`);
  await page.getByRole("dialog").getByRole("button", { name: "Pedir revisão" }).click();
  await page.getByText("Pedir revisão: feito").waitFor();
  const s = store();
  const bruno = s.users.find((u) => u.email.startsWith("bruno"));
  const after = s.cards.find((c) => c.id === card.id);
  assert.ok(s.cardMembers.some((m) => m.cardId === card.id && m.userId === bruno.id));
  assert.equal(s.lists.find((l) => l.id === after.listId).name, "Em andamento");
  await page.getByRole("dialog").getByText(/via automação Pedir revisão/).waitFor();
  await page.keyboard.press("Escape");
});

await step("automação: regra de métrica roda agora e aparece no histórico", async () => {
  await page.goto(`${BASE}/b/${boardId}/automation?aba=metricas`);
  await page.getByRole("button", { name: "Ações de ROAS baixo nos últimos 7 dias" }).click();
  await page.getByRole("menuitem", { name: "Rodar agora" }).click();
  await page.getByText(/^Rodou:/).waitFor();
  await page.goto(`${BASE}/b/${boardId}/automation?aba=historico`);
  await page.getByRole("heading", { name: /Histórico de execuções/ }).waitFor();
  await page.getByRole("link", { name: "ROAS baixo nos últimos 7 dias" }).first().waitFor();
});

await step("automação: desligar pelo diretório", async () => {
  await page.goto(`${BASE}/b/${boardId}/automation?aba=regras`);
  await page.getByRole("switch", { name: "Criativo novo ganha etiqueta: ligada" }).click();
  await page.getByRole("switch", { name: "Criativo novo ganha etiqueta: desligada" }).waitFor();
  for (let i = 0; i < 20 && store().automations.find((a) => a.name === "Criativo novo ganha etiqueta").enabled; i++) await page.waitForTimeout(300);
  assert.equal(store().automations.find((a) => a.name === "Criativo novo ganha etiqueta").enabled, false);
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
  await page.getByText("Despesa do teste automático", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Excluir a despesa Despesa do teste automático" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
  // exact: o título da confirmação também contém o nome enquanto a janela fecha.
  await page.getByText("Despesa do teste automático", { exact: true }).waitFor({ state: "detached" });
});

await step("Integrações: teste de integração recebe o pedido simulado", async () => {
  await page.goto(`${BASE}/d/${dashboardId}/integrations?aba=testes`);
  await page.waitForLoadState("networkidle");
  const field = page.getByLabel("Link da página da campanha");
  const url = "https://intellect-loja-demo.myshopify.com/products/kit-essencial";
  // Preenche de novo se a página terminar de carregar e limpar o campo.
  for (let i = 0; i < 5; i++) {
    await field.fill(url);
    await page.waitForTimeout(300);
    if ((await field.inputValue()) === url) break;
  }
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

// ---- Painéis (S28) ------------------------------------------------------------------------------

/** O número em destaque de um cartão ("R$ 1.234,56"). */
async function kpiValue(label) {
  const card = page.getByRole("group", { name: new RegExp(`^${label}: `) }).first();
  await card.waitFor();
  return (await card.locator("p.font-bold").first().innerText()).trim();
}

await step("Painéis: abre pelo menu, com cartões e gráficos", async () => {
  await page.goto(`${BASE}/d/${dashboardId}?periodo=30d`);
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Painéis" }).click();
  await page.waitForURL(/\/paineis/);
  await page.getByRole("heading", { name: "Painéis" }).waitFor();
  await page.getByRole("group", { name: /^ROAS: / }).waitFor();
  await page.getByText("Faturamento líquido e ROAS", { exact: true }).waitFor();
  await page.getByText("Top 10 campanhas por faturamento líquido", { exact: true }).waitFor();
  // O ECharts desenha num canvas dentro de cada gráfico.
  await page.locator("figure canvas").first().waitFor();
  assert.ok((await page.locator("figure canvas").count()) >= 6, "deveria ter pelo menos 6 gráficos desenhados");
});

await step("Painéis: mesmo número do Resumo no mesmo período", async () => {
  await page.goto(`${BASE}/d/${dashboardId}?periodo=30d`);
  const resumo = { net: await kpiValue("Faturamento líquido"), roas: await kpiValue("ROAS"), cpa: await kpiValue("CPA") };
  await page.goto(`${BASE}/d/${dashboardId}/paineis?periodo=30d`);
  const paineis = { net: await kpiValue("Faturamento líquido"), roas: await kpiValue("ROAS"), cpa: await kpiValue("CPA") };
  // No Resumo o ROAS é "2,35"; nos Painéis, "2,35x".
  assert.deepEqual({ ...paineis, roas: paineis.roas.replace(/x$/, "") }, resumo);
});

await step("Painéis: dica do gráfico com o período por extenso e a comparação", async () => {
  const chart = page.locator("figure", { hasText: "Faturamento líquido e ROAS" });
  const canvas = chart.locator("canvas").first();
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await chart.getByText(/período anterior, /).first().waitFor({ timeout: 10_000 });
});

await step("Painéis: agrupar por semana e comparar com o ano anterior", async () => {
  await page.getByRole("combobox", { name: "Agrupar por" }).click();
  await page.getByRole("option", { name: "Semana" }).click();
  await page.waitForURL(/agrupar=semana/);
  await page.getByRole("combobox", { name: "Comparar com" }).click();
  await page.getByRole("option", { name: "Mesmo período do ano anterior" }).click();
  await page.waitForURL(/comparar=ano/);
  await page.getByText(/^Comparando com .* de 2025\.$/).waitFor();
  await page.getByText(/vs\. mesmo período do ano anterior/).first().waitFor();
});

await step("Painéis: por hora num período longo vira por dia, com o aviso", async () => {
  await page.goto(`${BASE}/d/${dashboardId}/paineis?periodo=ano&agrupar=hora`);
  await page.getByText("Agrupamento ajustado").waitFor();
  await page.getByText("Por hora dá para ver até 31 dias.", { exact: false }).waitFor();
});

await step("Painéis: ver como tabela, com 'Outros' no ranking", async () => {
  await page.goto(`${BASE}/d/${dashboardId}/paineis?periodo=30d`);
  const chart = page.locator("figure", { hasText: "Top 10 campanhas por faturamento líquido" });
  await chart.getByRole("button", { name: "Ver como tabela" }).click();
  await chart.getByRole("table").waitFor();
  assert.ok((await chart.getByRole("row").count()) >= 3, "a tabela deveria ter linhas");
  await chart.getByRole("button", { name: "Ver como gráfico" }).click();
  await chart.locator("canvas").waitFor();
});

await step("Relatórios (endereço antigo) leva para Painéis", async () => {
  await page.goto(`${BASE}/d/${dashboardId}/reports?periodo=7d`);
  await page.waitForURL(/\/paineis\?periodo=7d/);
  await page.getByRole("heading", { name: "Painéis" }).waitFor();
  // Só segue com a tela pronta (gráficos desenhados): abrir um menu antes de a página terminar
  // de carregar no navegador faz o React reclamar dos atributos que o menu põe no resto da tela.
  await page.locator("figure canvas").first().waitFor();
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
