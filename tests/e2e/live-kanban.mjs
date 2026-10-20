// npm run test:e2e:live — o kanban no modo real (AUTH_MODE=live), num navegador
// de verdade, com o app ligado ao projeto de TESTE do Supabase (nunca o
// principal). Cria duas pessoas temporárias (Ana e Bia) num workspace novo,
// percorre o kanban e confere cada passo direto no banco. No fim, apaga tudo.
//
// O servidor precisa estar rodando no modo real com as chaves do projeto de
// teste (veja o README, "Testar o modo real").

import assert from "node:assert/strict";
import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Trava de segurança: este teste cria e apaga dados.
if (!url.includes("aqaijwpnudhftlxwsfdm") || !process.env.SUPABASE_SECRET_KEY) {
  console.error("Rode com --env-file=.env.test.local (projeto de teste).");
  process.exit(1);
}
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = crypto.randomUUID().slice(0, 8);
const PASSWORD = "Teste-Segura-123";
const slug = `e2e-${run}`;
const created = { users: [], workspace: null };

async function makePerson(name, role) {
  const email = `${name.toLowerCase()}-${run}@teste.intellect.local`;
  const res = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { name } });
  assert.ifError(res.error);
  const id = res.data.user.id;
  created.users.push(id);
  await admin.from("profiles").update({ name: `${name} E2E` }).eq("id", id);
  assert.ifError((await admin.from("workspace_members").insert({ workspace_id: created.workspace, user_id: id, role })).error);
  return { id, email };
}

const db = async (table, filter) => {
  const { data, error } = await filter(admin.from(table).select("*"));
  assert.ifError(error);
  return data;
};
/** Espera o banco chegar no estado (a gravação acontece depois do clique). */
async function until(check, what) {
  for (let i = 0; i < 40; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.fail(`o banco não chegou em: ${what}`);
}

const w = await admin.from("workspaces").insert({ name: "Espaço do teste no navegador", slug }).select("id").single();
assert.ifError(w.error);
created.workspace = w.data.id;
const ana = await makePerson("Ana", "admin");
const bia = await makePerson("Bia", "normal");

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER ?? "msedge", headless: true });
const problems = [];
async function openContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", reducedMotion: "reduce" });
  context.setDefaultTimeout(90_000);
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`erro na página: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/width\(0\)|Download the React DevTools/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  return page;
}
const page = await openContext();

let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FALHOU ${name}\n     ${String(error.message ?? error).split("\n").slice(0, 4).join("\n     ")}`);
    await page.screenshot({ path: `.data/e2e-live-falha-${failed}.png`, fullPage: true }).catch(() => {});
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

async function login(p, email) {
  await p.goto(`${BASE}/login`);
  await (await hydrated(p.getByLabel("E-mail"))).fill(email);
  await p.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await p.getByRole("button", { name: "Entrar", exact: true }).click();
  await p.waitForURL(new RegExp(`/w/${slug}`));
}

let boardId = "";
const CARD = "Card gravado no Supabase";

try {
  await step("login de verdade (Supabase Auth): senha errada dá erro, a certa entra no Início", async () => {
    await page.goto(`${BASE}/login`);
    await (await hydrated(page.getByLabel("E-mail"))).fill(ana.email);
    await page.getByLabel("Senha", { exact: true }).fill("senha-errada");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByText("E-mail ou senha não conferem.").waitFor();
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(new RegExp(`/w/${slug}`));
    await page.getByRole("heading", { name: /Olá, Ana/ }).waitFor();
  });

  await step("criar quadro pelo Início: o quadro fica no banco", async () => {
    await (await hydrated(page.getByRole("main").getByRole("button", { name: "Criar quadro" }).first())).click();
    await page.getByLabel("Nome do quadro").fill("Quadro no Supabase");
    await page.getByRole("radio", { name: "verde" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Criar quadro" }).click();
    await page.waitForURL(/\/b\//);
    boardId = new URL(page.url()).pathname.split("/")[2];
    await page.getByRole("heading", { name: /Quadro no Supabase/ }).waitFor();
    const [row] = await db("boards", (q) => q.eq("id", boardId));
    assert.equal(row.name, "Quadro no Supabase");
    assert.deepEqual(row.background, { type: "color", value: "green" });
  });

  await step("duas listas e um card", async () => {
    await (await hydrated(page.getByRole("button", { name: "Adicionar outra lista" }))).click();
    await page.getByLabel("Nome da nova lista").fill("A fazer");
    await page.getByLabel("Nome da nova lista").press("Enter");
    await page.getByRole("region", { name: "Lista A fazer" }).waitFor();
    await page.getByLabel("Nome da nova lista").fill("Feito");
    await page.getByLabel("Nome da nova lista").press("Enter");
    await page.getByRole("region", { name: "Lista Feito" }).waitFor();
    const list = page.getByRole("region", { name: "Lista A fazer" });
    await list.getByRole("button", { name: "Adicionar card" }).click();
    await list.getByRole("textbox").fill(CARD);
    await list.getByRole("textbox").press("Enter");
    await list.getByRole("button", { name: CARD, exact: true }).waitFor();
    await until(async () => (await db("cards", (q) => q.eq("board_id", boardId))).length === 1, "o card no banco");
    const [card] = await db("cards", (q) => q.eq("board_id", boardId));
    assert.equal(card.number, 1);
    assert.equal((await db("lists", (q) => q.eq("board_id", boardId))).length, 2);
  });

  await step("verso do card: descrição, checklist e comentário com @menção da Bia", async () => {
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: CARD, exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/card=/);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: CARD }).waitFor();
    await dialog.getByRole("button", { name: /Adicione uma descrição/ }).click();
    const editor = dialog.getByRole("textbox", { name: "Descrição do card" });
    await editor.click();
    await editor.pressSequentially("Descrição salva no banco de verdade.");
    await page.keyboard.press("Control+Enter");
    await editor.waitFor({ state: "detached" });
    await dialog.getByRole("button", { name: "Checklist", exact: true }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Passos");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await dialog.getByRole("heading", { name: "Passos" }).waitFor();
    await dialog.getByRole("button", { name: "Adicionar um item" }).click();
    await dialog.getByRole("textbox", { name: "Novo item" }).fill("Primeiro passo");
    await dialog.getByRole("textbox", { name: "Novo item" }).press("Enter");
    await dialog.getByRole("checkbox", { name: "Primeiro passo" }).click();
    await dialog.getByText("100%").waitFor();
    await dialog.getByRole("button", { name: "Escreva um comentário…" }).click();
    const comment = dialog.getByRole("textbox", { name: "Novo comentário" });
    await comment.pressSequentially("Pode revisar, @bia");
    await page.getByRole("option", { name: /Bia E2E/ }).waitFor();
    await page.keyboard.press("Enter");
    await comment.pressSequentially("obrigada!");
    await dialog.getByRole("button", { name: "Comentar", exact: true }).click();
    await comment.waitFor({ state: "detached" });
    await dialog.getByText("obrigada!").waitFor();

    const [card] = await db("cards", (q) => q.eq("board_id", boardId));
    await until(async () => (await db("notifications", (q) => q.eq("user_id", bia.id).eq("type", "mention"))).length === 1, "a menção da Bia");
    assert.match((await db("cards", (q) => q.eq("id", card.id)))[0].description_text, /banco de verdade/);
    const [checklist] = await db("checklists", (q) => q.eq("card_id", card.id));
    const [item] = await db("checklist_items", (q) => q.eq("checklist_id", checklist.id));
    assert.ok(item.completed_at, "o item deveria estar concluído");
  });

  await step("tempo real: a Bia, com o quadro aberto, vê o card mudar de lista sem recarregar", async () => {
    await page.keyboard.press("Escape");
    await page.waitForURL((u) => !new URL(u).searchParams.has("card"));
    const biaPage = await openContext();
    await login(biaPage, bia.email);
    await biaPage.goto(`${BASE}/b/${boardId}`);
    const biaDone = biaPage.getByRole("region", { name: "Lista Feito" });
    await biaPage.getByRole("region", { name: "Lista A fazer" }).getByRole("button", { name: CARD, exact: true }).waitFor();
    // Ana move pelo teclado (Espaço, seta, Espaço).
    await page.getByRole("button", { name: CARD, exact: true }).focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(400);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    await page.keyboard.press("Space");
    const [done] = await db("lists", (q) => q.eq("board_id", boardId).eq("name", "Feito"));
    await until(async () => (await db("cards", (q) => q.eq("board_id", boardId)))[0].list_id === done.id, "o card na lista Feito");
    await biaDone.getByRole("button", { name: CARD, exact: true }).waitFor({ timeout: 30_000 });
    await biaPage.context().close();
  });

  await step("a Bia vê a menção no sino e marca como lida", async () => {
    const biaPage = await openContext();
    await login(biaPage, bia.email);
    await (await hydrated(biaPage.getByRole("button", { name: /Notificações, \d+ não lidas/ }))).click();
    await biaPage.getByText(new RegExp(`mencionou você em ${CARD}`)).first().waitFor();
    await biaPage.getByRole("button", { name: "Marcar todas como lidas" }).click();
    await biaPage.getByRole("button", { name: "Notificações", exact: true }).waitFor();
    await until(async () => (await db("notifications", (q) => q.eq("user_id", bia.id).is("read_at", null))).length === 0, "as notificações lidas");
    await biaPage.context().close();
  });

  await step("busca global: / acha o card no banco e abre", async () => {
    await page.goto(`${BASE}/w/${slug}`);
    await (await hydrated(page.getByRole("heading", { name: /Olá, Ana/ }))).click();
    await page.keyboard.press("/");
    await page.getByPlaceholder(/Buscar quadros, cards/).fill("gravado no supa");
    await page.getByRole("option", { name: new RegExp(CARD) }).click();
    await page.waitForURL(/card=/);
    await page.getByRole("dialog").getByRole("heading", { name: CARD }).waitFor();
  });

  await step("arquivar o card pelo verso", async () => {
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Arquivar", exact: true }).click();
    await until(async () => Boolean((await db("cards", (q) => q.eq("board_id", boardId)))[0].archived_at), "o card arquivado");
  });

  await step("automação: criar regra pelo construtor (card novo em A fazer ganha comentário)", async () => {
    await page.goto(`${BASE}/b/${boardId}/automation`);
    await (await hydrated(page.getByRole("link", { name: "Criar regra" }).first())).click();
    await page.waitForURL(/automation\/new\?tipo=rule/);
    await (await hydrated(page.getByLabel("Nome da automação"))).fill("Boas-vindas ao card");
    await page.getByLabel("Quando", { exact: true }).click();
    await page.getByRole("option", { name: "Um card for criado" }).click();
    await page.getByLabel("Na lista").click();
    await page.getByRole("option", { name: "A fazer" }).click();
    await page.getByLabel("Comentário", { exact: true }).fill("Bem-vindo, {cardname}");
    await page.getByRole("button", { name: "Criar automação" }).click();
    await page.waitForURL(/automation\?aba=regras/);
    await page.getByRole("heading", { name: "Boas-vindas ao card" }).waitFor();
    const [rule] = await db("automations", (q) => q.eq("board_id", boardId).eq("name", "Boas-vindas ao card"));
    assert.equal(rule.type, "rule");
  });

  await step("automação: a regra roda quando o card nasce, e a execução fica no histórico", async () => {
    await page.goto(`${BASE}/b/${boardId}`);
    const list = page.getByRole("region", { name: "Lista A fazer" });
    await (await hydrated(list.getByRole("button", { name: "Adicionar card" }))).click();
    await list.getByRole("textbox").fill("Card da regra");
    await list.getByRole("textbox").press("Enter");
    await list.getByRole("button", { name: "Card da regra", exact: true }).waitFor();
    let card = null;
    await until(async () => {
      [card] = await db("cards", (q) => q.eq("board_id", boardId).eq("name", "Card da regra"));
      return Boolean(card);
    }, "o card da regra");
    await until(async () => (await db("comments", (q) => q.eq("card_id", card.id))).length === 1, "o comentário da automação");
    const [comment] = await db("comments", (q) => q.eq("card_id", card.id));
    assert.equal(comment.body_text, "Bem-vindo, Card da regra");
    assert.equal(comment.automation_name, "Boas-vindas ao card");
    await page.goto(`${BASE}/b/${boardId}/automation?aba=historico`);
    await page.getByRole("link", { name: "Boas-vindas ao card" }).first().waitFor();
  });

  await step("sem erros no console", async () => {
    assert.deepEqual(problems, []);
  });
} finally {
  await browser.close();
  await admin.from("workspaces").delete().eq("id", created.workspace);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
}

console.log(failed ? `\n${failed} passo(s) falharam. Capturas em .data/e2e-live-falha-*.png` : "\nTodos os passos passaram.");
process.exit(failed ? 1 : 0);
