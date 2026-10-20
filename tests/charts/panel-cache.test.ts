// Cache dos Painéis entre acessos (Fase 6): a mesma tela não refaz as contas,
// mas um dado novo, a virada da hora ou outra pessoa com outros quadros nunca
// recebem a tela velha.
//
// A parte com dados roda sobre os dados simulados, numa pasta temporária (o
// .data/ do projeto não é tocado).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { versionedCache } from "../../server/charts/cache.ts";
import type { SessionUser } from "../../server/auth/session.ts";

describe("cache com versão", () => {
  const value = (v: string) => () => Promise.resolve(v);

  test("a mesma chave na mesma versão não refaz a conta", async () => {
    const cache = versionedCache<string>({ max: 10, ttlMs: 60_000 });
    let loads = 0;
    const load = () => {
      loads++;
      return Promise.resolve("tela");
    };
    assert.equal(await cache.get("a", 1, load, 0), "tela");
    assert.equal(await cache.get("a", 1, load, 1000), "tela");
    assert.equal(loads, 1);
  });

  test("dado novo (versão maior) esvazia tudo", async () => {
    const cache = versionedCache<string>({ max: 10, ttlMs: 60_000 });
    await cache.get("a", 1, value("velha"), 0);
    await cache.get("b", 1, value("velha"), 0);
    assert.equal(await cache.get("a", 2, value("nova"), 0), "nova");
    assert.equal(cache.size, 1);
  });

  test("uma conta que começou antes do dado novo não volta para o cache", async () => {
    const cache = versionedCache<string>({ max: 10, ttlMs: 60_000 });
    await cache.get("a", 5, value("nova"), 0);
    // Pedido atrasado, com a versão de antes: faz a conta, mas não guarda nem apaga a nova.
    assert.equal(await cache.get("a", 4, value("atrasada"), 0), "atrasada");
    assert.equal(await cache.get("a", 5, value("outra"), 0), "nova");
  });

  test("passado o tempo máximo, refaz", async () => {
    const cache = versionedCache<string>({ max: 10, ttlMs: 1000 });
    await cache.get("a", 1, value("primeira"), 0);
    assert.equal(await cache.get("a", 1, value("segunda"), 1000), "primeira");
    assert.equal(await cache.get("a", 1, value("terceira"), 2001), "terceira");
  });

  test("passou do limite, sai a usada há mais tempo", async () => {
    const cache = versionedCache<string>({ max: 2, ttlMs: 60_000 });
    await cache.get("a", 1, value("a"), 0);
    await cache.get("b", 1, value("b"), 0);
    await cache.get("a", 1, value("a2"), 0); // "a" volta a ser a mais recente
    await cache.get("c", 1, value("c"), 0); // sai "b"
    assert.equal(cache.size, 2);
    assert.equal(await cache.get("a", 1, value("a3"), 0), "a");
    assert.equal(await cache.get("b", 1, value("b2"), 0), "b2");
  });

  test("dois pedidos iguais ao mesmo tempo fazem a conta uma vez", async () => {
    const cache = versionedCache<string>({ max: 10, ttlMs: 60_000 });
    let loads = 0;
    const slow = () => {
      loads++;
      return new Promise<string>((resolve) => setTimeout(() => resolve("tela"), 20));
    };
    const [x, y] = await Promise.all([cache.get("a", 1, slow, 0), cache.get("a", 1, slow, 0)]);
    assert.equal(x, "tela");
    assert.equal(y, "tela");
    assert.equal(loads, 1);
  });

  test("conta que falhou não fica guardada", async () => {
    const cache = versionedCache<string>({ max: 10, ttlMs: 60_000 });
    await assert.rejects(cache.get("a", 1, () => Promise.reject(new Error("caiu")), 0));
    assert.equal(cache.size, 0);
    assert.equal(await cache.get("a", 1, value("de novo"), 0), "de novo");
  });
});

// ---- com os dados simulados ---------------------------------------------------------------------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "intellect-cache-"));
const originalCwd = process.cwd();

type Modules = {
  panels: typeof import("../../server/data/panels.ts");
  render: typeof import("../../server/charts/render.ts");
  widgets: typeof import("../../lib/charts/widgets.ts");
  db: typeof import("../../server/store/db.ts");
};
let m: Modules;
let ctx: { user: SessionUser };
let dashboardId: string;
const NOW = new Date("2026-10-17T15:10:00Z");
const MAX = { periodo: "maximo" };

before(async () => {
  process.chdir(tmp);
  m = {
    panels: await import("../../server/data/panels.ts"),
    render: await import("../../server/charts/render.ts"),
    widgets: await import("../../lib/charts/widgets.ts"),
    db: await import("../../server/store/db.ts"),
  };
  const store = m.db.readStore();
  const dashboard = store.dashboards[0];
  dashboardId = dashboard.id;
  const member = store.workspaceMembers.find((w) => w.workspaceId === dashboard.workspaceId)!;
  ctx = { user: { id: member.userId } as SessionUser };
});

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("cache dos Painéis com os dados", () => {
  test("a mesma tela, aberta de novo, vem do cache (inclusive os gráficos já montados)", async () => {
    const first = await m.panels.loadPanels(ctx, dashboardId, MAX, NOW);
    const again = await m.panels.loadPanels(ctx, dashboardId, { ...MAX }, new Date(NOW.getTime() + 60_000));
    assert.equal(again.computer, first.computer);
    const widget = m.widgets.DEFAULT_PANEL[0];
    assert.equal(m.render.renderWidget(again.computer, widget), m.render.renderWidget(first.computer, widget));
  });

  test("outro período é outra tela", async () => {
    const a = await m.panels.loadPanels(ctx, dashboardId, MAX, NOW);
    const b = await m.panels.loadPanels(ctx, dashboardId, { periodo: "30d" }, NOW);
    assert.notEqual(a.computer, b.computer);
  });

  test("virou a hora: a tela é refeita", async () => {
    const a = await m.panels.loadPanels(ctx, dashboardId, MAX, NOW);
    const b = await m.panels.loadPanels(ctx, dashboardId, MAX, new Date("2026-10-17T16:00:00Z"));
    assert.notEqual(a.computer, b.computer);
  });

  test("venda nova: a tela é refeita e o número muda", async () => {
    const before = await m.panels.loadPanels(ctx, dashboardId, MAX, NOW);
    const paid = before.computer.totals().paidCount ?? 0;
    m.db.mutate((s) => {
      const model = s.orders.find((o) => o.status === "paid" && !o.isTest)!;
      s.orders.push({ ...model, id: m.db.newId(), externalId: "cache-test-1", name: "#CACHE1" });
    });
    const after = await m.panels.loadPanels(ctx, dashboardId, MAX, NOW);
    assert.notEqual(after.computer, before.computer);
    assert.equal(after.computer.totals().paidCount, paid + 1);
  });

  test("arquivo mudado por outro processo (simulate:order): a tela é refeita", async () => {
    const before = await m.panels.loadPanels(ctx, dashboardId, MAX, NOW);
    const paid = before.computer.totals().paidCount ?? 0;
    const file = path.join(tmp, ".data", "store.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const model = raw.orders.find((o: { status: string; isTest: boolean }) => o.status === "paid" && !o.isTest);
    raw.orders.push({ ...model, id: "pedido-de-fora", externalId: "cache-test-2", name: "#CACHE2" });
    fs.writeFileSync(file, JSON.stringify(raw));
    // Garante um carimbo de data diferente, mesmo num disco de resolução baixa.
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(file, later, later);
    const after = await m.panels.loadPanels(ctx, dashboardId, MAX, NOW);
    assert.notEqual(after.computer, before.computer);
    assert.equal(after.computer.totals().paidCount, paid + 1);
  });

  test("o acesso é conferido sempre, mesmo com a tela no cache", async () => {
    await m.panels.loadPanels(ctx, dashboardId, MAX, NOW);
    const stranger = { user: { id: "ninguem" } as SessionUser };
    await assert.rejects(m.panels.loadPanels(stranger, dashboardId, MAX, NOW));
  });
});
