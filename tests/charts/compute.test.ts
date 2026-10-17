import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { formatMetricValue } from "../../lib/charts/format.ts";
import { parseFormula, type ParsedFormula } from "../../lib/charts/formula.ts";
import { listBuckets, makeLocator } from "../../server/charts/time-buckets.ts";
import {
  compareValues,
  customMetricValue,
  markUnavailable,
  metricSeries,
  metricValue,
  OTHERS_KEY,
  sumComponents,
  topN,
  totalComponents,
  zeroComponents,
  type Components,
  type Row,
} from "../../server/charts/compute.ts";
import { summarize, type OrderForMetrics } from "../../server/metrics/formulas.ts";

const comp = (over: Partial<Components>): Components => ({ ...zeroComponents(), ...over });

describe("taxas refeitas a partir dos totais", () => {
  test("ROAS do período = faturamento total ÷ gasto total, nunca a média dos ROAS diários", () => {
    const days = [
      { key: "d1", components: comp({ baseCents: 10_000, spendCents: 1_000 }) }, // ROAS 10
      { key: "d2", components: comp({ baseCents: 10_000, spendCents: 9_000 }) }, // ROAS 1,11
    ];
    const daily = metricSeries(days, "roas");
    assert.equal(daily[0], 10);
    assert.ok(Math.abs((daily[1] ?? 0) - 10_000 / 9_000) < 1e-12);
    // Média dos diários daria 5,56; o certo é 20.000 ÷ 10.000 = 2.
    assert.equal(metricValue("roas", totalComponents(days)), 2);
  });

  test("CPA, ticket médio, CPC e CPM em centavos arredondados; CTR e conversão em fração", () => {
    const c = comp({ spendCents: 10_000, paidCount: 3, grossCents: 25_000, clicks: 7, impressions: 3_000 });
    assert.equal(metricValue("cpa", c), 3_333); // 100,00 ÷ 3 = 33,33
    assert.equal(metricValue("ticket", c), 8_333); // 250,00 ÷ 3 = 83,33
    assert.equal(metricValue("cpc", c), 1_429); // 100,00 ÷ 7 = 14,29
    assert.equal(metricValue("cpm", c), 3_333); // 100,00 ÷ 3.000 × 1.000 = 33,33
    assert.equal(metricValue("ctr", c), 7 / 3_000);
    assert.equal(metricValue("clickConversion", c), 3 / 7);
  });

  test("divisão por zero dá 'sem dado' (null), nunca Infinity, NaN ou zero; a tela mostra zerado", () => {
    const c = comp({ baseCents: 50_000 });
    for (const id of ["roas", "roi", "cpa", "cpc", "cpm", "ctr", "ticket", "clickConversion", "refundRate", "chargebackRate"] as const) {
      assert.equal(metricValue(id, c), null, id);
    }
    assert.equal(metricValue("margin", comp({})), null);
    assert.equal(formatMetricValue(metricValue("roas", c), "multiplier", { currency: "BRL" }), "0,00x");
    assert.equal(formatMetricValue(metricValue("cpa", c), "money", { currency: "BRL" }), "R$ 0,00");
  });

  test("lucro, margem e ROI", () => {
    const c = comp({
      netCents: 100_000,
      baseCents: 100_000,
      spendCents: 30_000,
      taxesCents: 6_000,
      productCostCents: 20_000,
      feesCents: 2_000,
      expensesCents: 2_000,
    });
    assert.equal(metricValue("profit", c), 40_000);
    assert.equal(metricValue("margin", c), 0.4);
    assert.equal(metricValue("roi", c), 40_000 / 30_000);
  });

  test("taxa de reembolso e de chargeback sobre os pedidos concluídos", () => {
    const c = comp({ paidCount: 16, refundedCount: 3, chargebackCount: 1 });
    assert.equal(metricValue("refundRate", c), 3 / 20);
    assert.equal(metricValue("chargebackRate", c), 1 / 20);
  });
});

describe("mesmo número do Resumo", () => {
  const order = (over: Partial<OrderForMetrics> = {}): OrderForMetrics => ({
    status: "paid",
    totalCents: 10_000,
    refundedCents: 0,
    interestCents: 0,
    gatewayFeeCents: 300,
    ...over,
  });
  const orders = [
    order(),
    order({ totalCents: 25_990, refundedCents: 4_000, interestCents: 700 }),
    order({ totalCents: 7_450, gatewayFeeCents: null }),
    order({ status: "refunded" }),
    order({ status: "chargedback" }),
    order({ status: "waiting_payment" }),
  ];

  for (const revenueBasis of ["net", "gross"] as const) {
    test(`peças → métricas dá o mesmo que summarize() (base ${revenueBasis === "net" ? "líquida" : "bruta"})`, () => {
      const costs = { salesTaxBp: 0, metaAdsTaxBp: 0, extraTaxesBp: 0, taxesCents: 3_210, productCostCents: 9_000, additionalFeesCents: 450, expensesCents: 1_500 };
      const s = summarize({ orders, spendCents: 12_345, metaSpendCents: 10_000, revenueBasis, includeInterest: false, costs });
      const c = comp({
        grossCents: s.grossCents,
        netCents: s.netCents,
        baseCents: s.baseCents,
        spendCents: s.spendCents,
        taxesCents: s.taxesCents,
        productCostCents: costs.productCostCents,
        feesCents: costs.additionalFeesCents,
        expensesCents: costs.expensesCents,
        paidCount: s.paidCount,
        refundedCount: s.refundedCount,
        chargebackCount: s.chargebackCount,
      });
      assert.equal(metricValue("profit", c), s.profitCents);
      assert.equal(metricValue("roas", c), s.roas);
      assert.equal(metricValue("roi", c), s.roi);
      assert.equal(metricValue("margin", c), s.margin);
      assert.equal(metricValue("cpa", c), s.cpaCents);
      assert.equal(metricValue("ticket", c), s.averageTicketCents);
      assert.equal(metricValue("refundRate", c), s.refundRate);
      assert.equal(metricValue("chargebackRate", c), s.chargebackRate);
    });
  }
});

describe("lacunas e dados indisponíveis", () => {
  test("dias sem venda aparecem com zero nas somas e 'sem dado' nas taxas", () => {
    const opts = { timezone: "America/Sao_Paulo", weekStart: "monday" as const, now: new Date("2026-10-17T15:30:00Z") };
    const buckets = listBuckets({ from: "2026-10-10", to: "2026-10-14" }, "day", opts);
    const locate = makeLocator(buckets, "day", opts);
    const rows = new Map(buckets.map((b) => [b.key, zeroComponents()]));
    // Duas vendas no dia 11 e uma no dia 13 (horário de São Paulo); gasto só no dia 11.
    for (const sale of ["2026-10-11T15:00:00Z", "2026-10-11T23:00:00Z", "2026-10-14T02:00:00Z"]) {
      const key = locate.byInstant(sale)!;
      const c = rows.get(key)!;
      c.grossCents! += 10_000;
      c.baseCents! += 10_000;
      c.paidCount! += 1;
    }
    rows.get(locate.byDay("2026-10-11")!)!.spendCents = 5_000;

    const list = buckets.map((b) => ({ key: b.key, components: rows.get(b.key)! }));
    assert.deepEqual(
      list.map((r) => r.key),
      ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"],
    );
    assert.deepEqual(metricSeries(list, "gross"), [0, 20_000, 0, 10_000, 0]);
    assert.deepEqual(metricSeries(list, "paid"), [0, 2, 0, 1, 0]);
    assert.deepEqual(metricSeries(list, "roas"), [null, 4, null, null, null]);
    assert.equal(metricValue("roas", totalComponents(list)), 6);
  });

  test("gasto sem dado (por hora): ROAS e lucro ficam sem dado; faturamento continua", () => {
    const c = markUnavailable(comp({ grossCents: 9_000, baseCents: 9_000, netCents: 8_700, paidCount: 1 }), ["spendCents", "taxesCents", "expensesCents"]);
    assert.equal(metricValue("gross", c), 9_000);
    assert.equal(metricValue("ticket", c), 9_000);
    assert.equal(metricValue("roas", c), null);
    assert.equal(metricValue("spend", c), null);
    assert.equal(metricValue("profit", c), null);
    // Somar um balde sem dado com outro mantém "sem dado".
    assert.equal(sumComponents([c, comp({ spendCents: 100 })]).spendCents, null);
  });

  test("peça que não veio não soma nada (nunca vira NaN)", () => {
    const total = sumComponents([{ grossCents: 100 }, { grossCents: undefined, paidCount: 2 }, {}]);
    assert.equal(total.grossCents, 100);
    assert.equal(total.paidCount, 2);
    assert.equal(total.spendCents, 0);
  });
});

describe("Top N e 'Outros'", () => {
  const row = (key: string, base: number, spend: number): Row => ({ key, label: key, components: comp({ baseCents: base, spendCents: spend }) });
  const rows = [row("A", 50_000, 10_000), row("B", 40_000, 5_000), row("C", 9_000, 3_000), row("D", 1_000, 2_000)];

  test("as maiores pela métrica e o resto somado em 'Outros', com o ROAS refeito", () => {
    // ROAS: A 5, B 8, C 3, D 0,5.
    const byRoas = topN(rows, "roas", 2);
    assert.deepEqual(
      byRoas.map((r) => r.key),
      ["B", "A", OTHERS_KEY],
    );
    const others = byRoas[2];
    assert.equal(others.label, "Outros");
    assert.equal(others.components.baseCents, 10_000);
    assert.equal(others.components.spendCents, 5_000);
    assert.equal(metricValue("roas", others.components), 2); // 10.000 ÷ 5.000, não a média de 3 e 0,5
  });

  test("empate na métrica: ordena pelo nome", () => {
    assert.deepEqual(
      topN(rows, "gross", 2).map((r) => r.key),
      ["A", "B", OTHERS_KEY],
    );
  });

  test("ordem crescente e linha sem dado no fim", () => {
    const withEmpty = [...rows, row("E", 5_000, 0)];
    assert.deepEqual(
      topN(withEmpty, "roas", 10, "asc").map((r) => r.key),
      ["D", "C", "A", "B", "E"],
    );
    assert.deepEqual(
      topN(withEmpty, "roas", 10).map((r) => r.key),
      ["B", "A", "C", "D", "E"],
    );
  });

  test("sem sobra, não cria 'Outros'", () => {
    assert.equal(
      topN(rows, "spend", 4).some((r) => r.key === OTHERS_KEY),
      false,
    );
  });
});

describe("variação contra a comparação", () => {
  test("percentual com a cor pelo sentido da métrica", () => {
    assert.deepEqual(compareValues(120, 100, "up"), { kind: "pct", value: 0.2, tone: "good" });
    assert.deepEqual(compareValues(80, 100, "up"), { kind: "pct", value: -0.2, tone: "bad" });
    // CPA caindo é bom.
    assert.deepEqual(compareValues(80, 100, "down"), { kind: "pct", value: -0.2, tone: "good" });
    assert.deepEqual(compareValues(120, 100, "down"), { kind: "pct", value: 0.2, tone: "bad" });
    // Gasto não é bom nem ruim.
    assert.equal(compareValues(120, 100, "neutral").tone, "neutral");
    assert.deepEqual(compareValues(100, 100, "up"), { kind: "pct", value: 0, tone: "neutral" });
  });

  test("anterior zero: 'Novo'; sem dado de um lado ou tudo zerado: sem variação", () => {
    assert.deepEqual(compareValues(500, 0, "up"), { kind: "new", tone: "neutral" });
    assert.deepEqual(compareValues(0, 0, "up"), { kind: "none", tone: "neutral" });
    assert.deepEqual(compareValues(null, 100, "up"), { kind: "none", tone: "neutral" });
    assert.deepEqual(compareValues(100, null, "up"), { kind: "none", tone: "neutral" });
  });

  test("anterior negativo (prejuízo que diminuiu) conta como melhora", () => {
    // Lucro de −100 para −50: melhorou 50%.
    assert.deepEqual(compareValues(-50, -100, "up"), { kind: "pct", value: 0.5, tone: "good" });
  });
});

describe("métricas personalizadas", () => {
  const parse = (text: string) => {
    const r = parseFormula(text);
    assert.equal(r.ok, true, text);
    return r as ParsedFormula;
  };
  const c = comp({ netCents: 100_000, baseCents: 100_000, spendCents: 30_000, paidCount: 4, clicks: 200 });

  test("lucro ÷ vendas pagas em dinheiro: entra em reais, volta em centavos", () => {
    assert.equal(customMetricValue(parse("lucro ÷ vendas_pagas"), "money", c), 17_500); // (1.000 − 300) ÷ 4 = 175,00
  });

  test("dinheiro na fórmula vale em reais", () => {
    assert.equal(customMetricValue(parse("faturamento_liquido − 100"), "money", c), 90_000);
  });

  test("taxas entram refeitas do período", () => {
    assert.equal(customMetricValue(parse("roas * 2"), "multiplier", c), (100_000 / 30_000) * 2);
  });

  test("divisão por zero no meio da conta dá 'sem dado'", () => {
    assert.equal(customMetricValue(parse("lucro / vendas_pagas"), "money", comp({ netCents: 100 })), null);
    assert.equal(customMetricValue(parse("faturamento_liquido / (gasto_anuncios - gasto_anuncios)"), "money", c), null);
  });
});
