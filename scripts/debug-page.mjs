// Diagnóstico: conta quantas vezes cada tela recarrega sozinha em 15 s (modo de desenvolvimento).
import { chromium } from "playwright-core";

const targets = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://localhost:3000/api/dev/login?next=${encodeURIComponent("/me")}`, { waitUntil: "load", timeout: 180_000 });
await page.waitForTimeout(8000);
for (const target of targets) {
  let navs = 0;
  const onNav = (f) => f === page.mainFrame() && navs++;
  page.on("framenavigated", onNav);
  await page.goto(`http://localhost:3000${target}`, { waitUntil: "load", timeout: 180_000 }).catch(() => {});
  await page.waitForTimeout(15000);
  page.off("framenavigated", onNav);
  console.log(`${navs - 1} recargas em ${target}`);
}
await browser.close();
