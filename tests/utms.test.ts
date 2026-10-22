// S27 Relatório por UTM: os totais batem com o Resumo no mesmo período e filtros,
// a soma das linhas fecha com o total, e as vendas sem o parâmetro ficam numa
// linha própria. Roda sobre os dados de exemplo em memória, sem banco.

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import type { SessionUser } from "../server/auth/session.ts";
import { createSeed } from "../server/store/seed.ts";
import type { Store } from "../server/store/types.ts";

// Os dados ficam em memória (server/live/scope.ts, readOnStore); nada é lido do disco nem do banco.
process.env.AUTH_MODE = "live";

describe("relatório por UTM", () => {
  let data: Store;
  let ctx: { user: SessionUser };
  let dashboardId = "";
  let m: {
    scope: typeof import("../server/live/scope.ts");
    tracking: typeof import("../server/data/tracking.ts");
    utms: typeof import("../server/data/utms.ts");
  };

  before(async () => {
    data = createSeed(new Date());
    const ana = data.users.find((u) => u.email.startsWith("ana"))!;
    ctx = { user: { id: ana.id, name: ana.name, email: ana.email, username: ana.username, avatarColor: ana.avatarColor, timezone: ana.timezone } };
    dashboardId = data.dashboards[0].id;
    m = {
      scope: await import("../server/live/scope.ts"),
      tracking: await import("../server/data/tracking.ts"),
      utms: await import("../server/data/utms.ts"),
    };
  });

  const read = <T>(fn: () => Promise<T>) => m.scope.readOnStore(structuredClone(data), fn);

  test("faturamento e vendas do total batem com o Resumo, em cada parâmetro e com filtro", async () => {
    for (const sp of [{ periodo: "30d" }, { periodo: "maximo" }, { periodo: "30d", fonte: "meta" }, { periodo: "30d", produto: data.products[0].id }]) {
      const summary = await read(() => m.tracking.getDashboardSummary(ctx, dashboardId, sp));
      for (const por of m.utms.UTM_PARAMS) {
        const report = await read(() => m.utms.getUtmReport(ctx, dashboardId, { ...sp, por }));
        assert.equal(report.totals.revenueCents, summary.current.baseCents, `${por} ${JSON.stringify(sp)}: faturamento`);
        assert.equal(report.totals.sales, summary.current.paidCount, `${por} ${JSON.stringify(sp)}: vendas`);
        const sum = (k: "orders" | "sales" | "revenueCents" | "costsCents") => report.rows.reduce((s, r) => s + r[k], 0);
        assert.equal(sum("orders"), report.totals.orders);
        assert.equal(sum("revenueCents"), report.totals.revenueCents);
        assert.equal(sum("costsCents"), report.totals.costsCents);
        // A participação das linhas soma 100% (quando há faturamento).
        if (report.totals.revenueCents > 0) assert.ok(Math.abs(report.rows.reduce((s, r) => s + (r.share ?? 0), 0) - 1) < 1e-9);
      }
    }
  });

  test("vendas sem o parâmetro ficam em “(sem …)”; o resto, pelo valor que veio no link", async () => {
    const report = await read(() => m.utms.getUtmReport(ctx, dashboardId, { periodo: "maximo", por: "source" }));
    const values = report.rows.map((r) => r.value);
    assert.ok(values.includes(null), "as vendas sem utm_source deveriam ter uma linha");
    assert.ok(values.includes("meta") && values.includes("google"), `fontes: ${values.join(", ")}`);
    const untracked = data.orders.filter((o) => !o.isTest && !o.utmSource?.trim()).length;
    assert.ok(untracked > 0);
    assert.ok(report.rows.find((r) => r.value === null)!.orders <= untracked);
    // Da maior para a menor em faturamento.
    for (let i = 1; i < report.rows.length; i++) assert.ok(report.rows[i - 1].revenueCents >= report.rows[i].revenueCents);
  });

  test("busca pelo valor, sem acento e sem diferenciar maiúscula; o total é o das linhas que aparecem", async () => {
    const all = await read(() => m.utms.getUtmReport(ctx, dashboardId, { periodo: "maximo", por: "source" }));
    const report = await read(() => m.utms.getUtmReport(ctx, dashboardId, { periodo: "maximo", por: "source", q: "GOO" }));
    assert.deepEqual(
      report.rows.map((r) => r.value),
      ["google"],
    );
    assert.equal(report.totals.revenueCents, all.rows.find((r) => r.value === "google")!.revenueCents);
    // A participação continua sobre o faturamento de tudo.
    assert.equal(report.rows[0].share, all.rows.find((r) => r.value === "google")!.share);
  });

  test("parâmetro desconhecido no endereço cai em utm_campaign", () => {
    assert.equal(m.utms.parseUtmParam("qualquer"), "campaign");
    assert.equal(m.utms.parseUtmParam(["medium"]), "medium");
    assert.equal(m.utms.parseUtmParam(undefined), "campaign");
  });
});
