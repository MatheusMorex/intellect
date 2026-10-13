// npm run screenshots -- <pasta> <largura>x<altura> nome=/caminho [nome2=/caminho2 ...]
// Tira capturas de tela das telas do app (já logado como a Ana, pelo login de teste).
// Só funciona com o app rodando em modo simulado (AUTH_MODE=fake).

import path from "node:path";

import { chromium } from "playwright-core";

const [dir, size, ...shots] = process.argv.slice(2);
if (!dir || !size || shots.length === 0) {
  console.log("uso: npm run screenshots -- <pasta> 1440x900 S05=/b/<id> [S06=/b/<id>?card=<id>]");
  process.exit(1);
}
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const [width, height] = size.split("x").map(Number);

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER ?? "msedge", headless: true });
const context = await browser.newContext({ viewport: { width, height }, locale: "pt-BR", reducedMotion: "reduce", colorScheme: process.env.THEME === "dark" ? "dark" : "light" });
context.setDefaultTimeout(120_000);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/width\(0\)|DevTools/.test(m.text()) && errors.push(m.text()));

let first = true;
for (const shot of shots) {
  const at = shot.indexOf("=");
  const name = shot.slice(0, at);
  const target = shot.slice(at + 1);
  const url = first ? `${BASE}/api/dev/login?next=${encodeURIComponent(target)}` : `${BASE}${target}`;
  first = false;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const file = path.join(dir, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(`ok ${file}`);
  } catch (error) {
    console.log(`FALHOU ${name}: ${String(error.message ?? error).split("\n")[0]}`);
  }
}
if (errors.length) console.log(`erros no console:\n  ${[...new Set(errors)].join("\n  ")}`);
await browser.close();
