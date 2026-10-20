// O mesmo número nos dois lugares: o total dos Painéis tem que ser idêntico ao
// do Resumo (getDashboardSummary) no mesmo período e com os mesmos filtros, e a
// soma dos baldes (dias, semanas, meses) e das linhas de cada dimensão tem que
// fechar com o total.
//
// Roda sobre os dados simulados de verdade, num arquivo numa pasta temporária
// (o .data/ do projeto não é tocado).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { COMPONENTS, type Dimension } from "../../lib/charts/catalog.ts";
import type { SessionUser } from "../../server/auth/session.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "intellect-paineis-"));
const originalCwd = process.cwd();

type Modules = {
  tracking: typeof import("../../server/data/tracking.ts");
  panels: typeof import("../../server/data/panels.ts");
  compute: typeof import("../../server/charts/compute.ts");
  db: typeof import("../../server/store/db.ts");
};
let m: Modules;
let ctx: { user: SessionUser };
let dashboardId: string;

before(async () => {
  // O armazenamento simulado fica em <pasta atual>/.data: a pasta temporária vira a atual antes de carregar.
  process.chdir(tmp);
  m = {
    tracking: await import("../../server/data/tracking.ts"),
    panels: await import("../../server/data/panels.ts"),
    compute: await import("../../server/charts/compute.ts"),
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

const PERIODS = ["hoje", "ontem", "7d", "30d", "mes", "mes-passado", "maximo"];

async function both(sp: Record<string, string>) {
  const summary = await m.tracking.getDashboardSummary(ctx, dashboardId, sp);
  const panel = await m.panels.loadPanels(ctx, dashboardId, sp);
  return { summary, panel };
}

function assertSameAsResumo(summary: Awaited<ReturnType<typeof both>>["summary"]["current"], c: ReturnType<Modules["compute"]["zeroComponents"]>, label: string) {
  const v = (id: Parameters<Modules["compute"]["metricValue"]>[0]) => m.compute.metricValue(id, c);
  const pairs: [string, number | null, number | null][] = [
    ["bruto", summary.grossCents, c.grossCents],
    ["líquido", summary.netCents, c.netCents],
    ["base", summary.baseCents, c.baseCents],
    ["gasto", summary.spendCents, c.spendCents],
    ["gasto Meta", summary.spendMetaCents, c.spendMetaCents],
    ["gasto Google", summary.spendGoogleCents, c.spendGoogleCents],
    ["impostos", summary.taxesCents, c.taxesCents],
    ["custo dos produtos", summary.productCostCents, c.productCostCents],
    ["taxas adicionais", summary.feesCents, c.feesCents],
    ["despesas", summary.expensesCents, c.expensesCents],
    ["vendas pagas", summary.paidCount, c.paidCount],
    ["pendentes", summary.pendingCount, c.pendingCount],
    ["reembolsadas", summary.refundedCount, c.refundedCount],
    ["chargebacks", summary.chargebackCount, c.chargebackCount],
    ["lucro", summary.profitCents, v("profit")],
    ["ROAS", summary.roas, v("roas")],
    ["ROI", summary.roi, v("roi")],
    ["margem", summary.margin, v("margin")],
    ["CPA", summary.cpaCents, v("cpa")],
    ["ticket médio", summary.averageTicketCents, v("ticket")],
    ["% reembolso", summary.refundRate, v("refundRate")],
    ["% chargeback", summary.chargebackRate, v("chargebackRate")],
  ];
  for (const [name, resumo, paineis] of pairs) assert.equal(paineis, resumo, `${label}: ${name}`);
}

describe("Painéis × Resumo: mesmo período, mesmo número", () => {
  test("os dados simulados têm vendas e gasto nos últimos 30 dias (senão o teste não prova nada)", async () => {
    const { summary } = await both({ periodo: "30d" });
    assert.ok(summary.current.paidCount > 10);
    assert.ok(summary.current.spendCents > 0);
    assert.ok(summary.current.expensesCents > 0);
    assert.ok(summary.current.taxesCents > 0);
  });

  for (const periodo of PERIODS) {
    test(`total e comparação iguais ao Resumo: ${periodo}`, async () => {
      const { summary, panel } = await both({ periodo });
      assert.deepEqual(panel.query.period.range, summary.period.range);
      assertSameAsResumo(summary.current, panel.computer.totals(), periodo);
      if (summary.previous) {
        assert.deepEqual(panel.query.compareRange, summary.period.previous);
        assertSameAsResumo(summary.previous, panel.computer.compareTotals()!, `${periodo} (anterior)`);
        // A variação do cartão é a mesma conta do Resumo.
        const change = m.compute.compareValues(
          m.compute.metricValue("net", panel.computer.totals()),
          m.compute.metricValue("net", panel.computer.compareTotals()!),
          "up",
        );
        if (summary.changes.net != null) assert.equal(change.kind === "pct" ? change.value : null, summary.changes.net);
      } else {
        assert.equal(panel.query.compareRange, null);
      }
    });
  }

  test("período personalizado igual ao Resumo", async () => {
    const { summary } = await both({ periodo: "30d" });
    const sp = { periodo: "personalizado", de: summary.period.range.from, ate: summary.period.today };
    const res = await both(sp);
    assertSameAsResumo(res.summary.current, res.panel.computer.totals(), "personalizado");
  });

  test("com filtros de conta, fonte e produto (despesas ficam de fora, como no Resumo)", async () => {
    const options = await m.tracking.getFilterOptions(ctx, dashboardId);
    const filters: Record<string, string>[] = [
      { conta: options.accounts[0].value },
      { fonte: "meta" },
      { fonte: "untracked" },
      { produto: options.products[0].value },
      { conta: options.accounts[0].value, produto: options.products[1].value },
    ];
    for (const f of filters) {
      const { summary, panel } = await both({ periodo: "30d", ...f });
      assert.equal(panel.computer.totals().expensesCents, 0, JSON.stringify(f));
      assertSameAsResumo(summary.current, panel.computer.totals(), JSON.stringify(f));
    }
  });

  test("com filtro de campanha: igual ao Resumo e às linhas dessas campanhas no gráfico por campanha", async () => {
    const options = await m.tracking.getFilterOptions(ctx, dashboardId);
    const ids = new Set(options.campaigns.map((c) => c.value));
    assert.ok(ids.size > 2, "deveria ter campanhas para escolher");
    const rows = (await both({ periodo: "30d" })).panel.computer.dimension("campaign");
    // Campanhas com venda e gasto no período (senão o teste não prova nada).
    const busy = rows.filter((r) => ids.has(r.key) && (r.components.paidCount ?? 0) > 0 && (r.components.spendCents ?? 0) > 0);
    assert.ok(busy.length >= 2, "deveria ter 2 campanhas com venda e gasto");
    for (const chosen of [busy.slice(0, 1), busy.slice(0, 2)]) {
      const label = chosen.map((r) => r.label).join(" + ");
      const { summary, panel } = await both({ periodo: "30d", campanha: chosen.map((r) => r.key).join(",") });
      const total = panel.computer.totals();
      assert.equal(total.expensesCents, 0, label);
      assertSameAsResumo(summary.current, total, label);
      const expected = m.compute.sumComponents(chosen.map((r) => r.components));
      for (const c of ["spendCents", "grossCents", "netCents", "paidCount", "ordersCount", "impressions", "clicks"] as const) {
        assert.equal(total[c], expected[c], `${label}: ${c}`);
      }
      // Os rankings também só mostram as escolhidas.
      assert.deepEqual(new Set(panel.computer.dimension("campaign").map((r) => r.key)), new Set(chosen.map((r) => r.key)), label);
    }
  });

  test("filtro de campanha sem nenhuma venda nem gasto: tudo zerado, sem quebrar", async () => {
    const { summary, panel } = await both({ periodo: "30d", campanha: "campanha-que-nao-existe" });
    const total = panel.computer.totals();
    assert.equal(total.paidCount, 0);
    assert.equal(total.spendCents, 0);
    assertSameAsResumo(summary.current, total, "campanha inexistente");
  });
});

describe("a soma das partes fecha com o total", () => {
  for (const agrupar of ["dia", "semana", "quinzena", "mes", "ano"]) {
    test(`baldes por ${agrupar} somam o total do período (todas as peças)`, async () => {
      const { panel } = await both({ periodo: "maximo", agrupar });
      const total = panel.computer.totals();
      const summed = m.compute.totalComponents(panel.computer.series());
      for (const c of COMPONENTS) assert.equal(summed[c], total[c], `${agrupar}: ${c}`);
    });
  }

  test("por hora: os pedidos somam o total do dia; gasto e impostos ficam sem dado", async () => {
    const { panel } = await both({ periodo: "ontem", agrupar: "hora" });
    assert.equal(panel.computer.series().length, 24);
    const total = panel.computer.totals();
    const summed = m.compute.totalComponents(panel.computer.series());
    for (const c of ["grossCents", "netCents", "baseCents", "paidCount", "ordersCount", "pendingCount", "productCostCents", "feesCents"] as const) {
      assert.equal(summed[c], total[c], c);
    }
    for (const c of ["spendCents", "impressions", "clicks", "taxesCents", "expensesCents"] as const) assert.equal(summed[c], null, c);
    assert.equal(m.compute.metricValue("roas", summed), null);
  });

  const DIMENSIONS: [Dimension, readonly ("spendCents" | "netCents" | "grossCents" | "paidCount" | "ordersCount" | "taxesCents" | "impressions")[]][] = [
    ["platform", ["spendCents", "netCents", "paidCount", "ordersCount", "taxesCents", "impressions"]],
    ["adAccount", ["spendCents", "netCents", "paidCount", "ordersCount", "taxesCents"]],
    ["campaign", ["spendCents", "netCents", "paidCount", "ordersCount", "taxesCents"]],
    ["paymentMethod", ["netCents", "paidCount", "ordersCount"]],
    ["utmSource", ["grossCents", "netCents", "paidCount", "ordersCount"]],
    ["utmCampaign", ["netCents", "paidCount"]],
  ];
  for (const [dimension, ids] of DIMENSIONS) {
    test(`linhas por ${dimension} somam o total (pedidos sem a informação ficam numa linha própria)`, async () => {
      const { panel } = await both({ periodo: "30d" });
      const rows = panel.computer.dimension(dimension);
      assert.ok(rows.length > 1, "deveria ter mais de uma linha");
      const summed = m.compute.sumComponents(rows.map((r) => r.components));
      const total = panel.computer.totals();
      for (const c of ids) assert.equal(summed[c], total[c], `${dimension}: ${c}`);
    });
  }

  test("por produto: soma dos itens pagos, como 'Vendas por produto' do Resumo", async () => {
    const { summary, panel } = await both({ periodo: "30d" });
    const rows = panel.computer.dimension("product");
    const resumo = new Map(summary.charts.byProduct.map((p) => [p.key, p.valueCents]));
    assert.equal(rows.filter((r) => (r.components.grossCents ?? 0) > 0).length, resumo.size);
    for (const r of rows) {
      if (resumo.has(r.key)) assert.equal(r.components.grossCents, resumo.get(r.key), r.label);
      // O que não se divide por produto fica sem dado, nunca zero.
      assert.equal(r.components.netCents, null);
      assert.equal(r.components.spendCents, null);
    }
  });

  test("com filtro de produto, o gráfico por produto mostra só os escolhidos", async () => {
    const options = await m.tracking.getFilterOptions(ctx, dashboardId);
    const chosen = options.products[0].value;
    const { panel } = await both({ periodo: "maximo", produto: chosen });
    const rows = panel.computer.dimension("product");
    assert.deepEqual(
      rows.map((r) => r.key),
      [chosen],
    );
  });
});
