// Montagem dos widgets dos Painéis sobre os dados simulados (createSeed, sem
// arquivo): cartões de KPI, linhas, colunas (agrupadas, empilhadas e 100%) e
// barras com Top N + "Outros".

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { getMetric } from "../../lib/charts/catalog.ts";
import { msg } from "../../lib/charts/messages.ts";
import { PANEL_WIDGET, type BarWidget, type ColumnWidget, type KpiWidget, type LineWidget, type PanelWidgetInput } from "../../lib/charts/widgets.ts";
import { buildBarChart, buildKpi, buildTimeChart, panelComputer, type PanelComputer } from "../../server/charts/build.ts";
import { compareValues, metricSeries, metricValue, OTHERS_KEY, sumComponents, totalComponents, zeroComponents, type Row } from "../../server/charts/compute.ts";
import { parsePanelQuery } from "../../server/charts/params.ts";
import { allocateMetaTax, NONE_KEY, panelSource } from "../../server/charts/source.ts";
import { earliestDay } from "../../server/data/tracking.ts";
import { createSeed } from "../../server/store/seed.ts";

// Sábado, 17 de outubro de 2026, 12h em Brasília.
const NOW = new Date("2026-10-17T15:00:00Z");
const store = createSeed(NOW);
const dashboard = store.dashboards[0];

function computer(sp: Record<string, string> = {}) {
  const query = parsePanelQuery(sp, dashboard.timezone, earliestDay(store, dashboard), NOW);
  return panelComputer(panelSource(store, dashboard, query.filters), query, NOW);
}
const widget = <T,>(input: PanelWidgetInput) => PANEL_WIDGET.parse(input) as T;

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("cartão de KPI", () => {
  test("valor do período, variação pelo sentido da métrica e minigráfico", () => {
    const pc = computer({ periodo: "30d" });
    const view = buildKpi(pc, widget<KpiWidget>({ id: "k", type: "kpi", metric: "cpa" }));
    const now = metricValue("cpa", pc.totals());
    const before = metricValue("cpa", pc.compareTotals()!);
    assert.equal(view.value, now);
    assert.equal(view.compare?.value, before);
    assert.deepEqual(view.compare?.change, compareValues(now, before, "down"));
    assert.equal(view.compare?.versus, "vs. período anterior");
    // CPA caindo é bom (verde), subindo é ruim.
    if (now != null && before != null && now !== before) assert.equal(view.compare?.change.tone, now < before ? "good" : "bad");
    assert.equal(view.sparkline?.values.length, 30);
    assert.equal(view.sparkline?.partial.at(-1), true, "hoje ainda está em andamento");
    assert.equal(view.periodLabel, "Últimos 30 dias");
  });

  test("meta do dashboard e meta escolhida: progresso = valor ÷ meta", () => {
    const pc = computer({ periodo: "30d" });
    const net = metricValue("net", pc.totals())!;
    const dashboardGoal = buildKpi(pc, widget<KpiWidget>({ id: "k", type: "kpi", metric: "net", goal: { source: "dashboard" } }));
    assert.equal(dashboardGoal.goal?.target, dashboard.revenueGoalCents);
    assert.ok(near(dashboardGoal.goal!.progress!, net / dashboard.revenueGoalCents!));
    const own = buildKpi(pc, widget<KpiWidget>({ id: "k", type: "kpi", metric: "paid", goal: { source: "value", value: 50 } }));
    assert.ok(near(own.goal!.progress!, metricValue("paid", pc.totals())! / 50));
  });

  test("alerta só quando passa do limite", () => {
    const pc = computer({ periodo: "30d" });
    const roas = metricValue("roas", pc.totals())!;
    assert.ok(roas > 0);
    const below = buildKpi(pc, widget<KpiWidget>({ id: "k", type: "kpi", metric: "roas", alert: { when: "below", value: roas + 1 } }));
    assert.deepEqual(below.alert, { when: "below", value: roas + 1 });
    const fine = buildKpi(pc, widget<KpiWidget>({ id: "k", type: "kpi", metric: "roas", alert: { when: "below", value: roas - 0.01 } }));
    assert.equal(fine.alert, null);
    const above = buildKpi(pc, widget<KpiWidget>({ id: "k", type: "kpi", metric: "roas", alert: { when: "above", value: roas - 0.01 } }));
    assert.ok(above.alert);
  });

  test("sem comparação, sem variação; sem dado, sem alerta", () => {
    const off = buildKpi(computer({ comparar: "nao" }), widget<KpiWidget>({ id: "k", type: "kpi", metric: "net" }));
    assert.equal(off.compare, null);
    const empty = computer({ periodo: "personalizado", de: "2001-01-01", ate: "2001-01-31" });
    const roas = buildKpi(empty, widget<KpiWidget>({ id: "k", type: "kpi", metric: "roas", alert: { when: "below", value: 2 } }));
    assert.equal(roas.value, null);
    assert.equal(roas.alert, null);
  });
});

describe("linhas e colunas no tempo", () => {
  const line = widget<LineWidget>({
    id: "l",
    type: "line",
    series: [
      { metric: "net", axis: "left" },
      { metric: "roas", axis: "right" },
    ],
    average: true,
    goal: { value: 300_000, axis: "left" },
  });

  test("eixo duplo, valores do serviço de cálculo e comparação alinhada ponto a ponto", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildTimeChart(pc, line);
    assert.deepEqual(spec.axes, { left: "money", right: "multiplier" });
    assert.equal(spec.categories.length, 30);
    assert.deepEqual(spec.series[0].values, metricSeries(pc.series(), "net"));
    assert.deepEqual(spec.series[1].values, metricSeries(pc.series(), "roas"));
    const compareRows = pc.compareSeries()!;
    assert.deepEqual(spec.series[1].compare?.values, metricSeries(compareRows, "roas"));
    spec.series[0].compare!.changes.forEach((c, i) => assert.deepEqual(c, compareValues(spec.series[0].values[i], spec.series[0].compare!.values[i], "up")));
    assert.match(spec.categories[0].compareLabel ?? "", /de agosto de 2026/);
    assert.equal(spec.compareName, "período anterior");
    assert.equal(spec.drawCompare, true);
  });

  test("média de taxa = a taxa do período (nunca a média das médias); média de soma = total ÷ pontos", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildTimeChart(pc, line);
    const total = totalComponents(pc.series());
    const roasAverage = spec.references.find((r) => r.kind === "average" && r.axis === "right")!;
    assert.equal(roasAverage.value, metricValue("roas", total));
    assert.equal(roasAverage.label, "Média do período");
    const netAverage = spec.references.find((r) => r.kind === "average" && r.axis === "left")!;
    assert.equal(netAverage.value, Math.round(metricValue("net", total)! / 30));
    assert.equal(netAverage.label, "Média por dia");
    assert.deepEqual(
      spec.references.find((r) => r.kind === "goal"),
      { kind: "goal", axis: "left", value: 300_000, format: "money", label: "Meta", color: null },
    );
  });

  test("período em andamento: o último ponto é parcial; semana cortada pelo período também", () => {
    const daily = buildTimeChart(computer({ periodo: "mes", agrupar: "dia" }), line);
    assert.equal(daily.categories.at(-1)?.partial, "ongoing");
    assert.ok(daily.categories.slice(0, -1).every((c) => c.partial == null));
    // 1º de outubro de 2026 é quinta: a primeira semana (seg 28/09) fica cortada.
    const weekly = buildTimeChart(computer({ periodo: "mes", agrupar: "semana" }), line);
    assert.equal(weekly.categories[0].partial, "clipped");
    assert.equal(weekly.categories.at(-1)?.partial, "ongoing");
  });

  test("por hora: gasto e ROAS sem dado, com o aviso embaixo do gráfico", () => {
    const spec = buildTimeChart(computer({ periodo: "ontem", agrupar: "hora" }), line);
    assert.equal(spec.categories.length, 24);
    assert.ok(spec.series[1].values.every((v) => v == null));
    assert.ok(spec.series[0].values.some((v) => v != null && v > 0));
    assert.ok(spec.notes.includes(msg.panel.notes.hourUnavailable));
    assert.equal(spec.empty, false);
  });

  test("por hora, um gráfico só de gasto não diz 'sem dados': diz que o gasto chega por dia", () => {
    const spend = widget<ColumnWidget>({ id: "c", type: "column", series: [{ metric: "spendMeta" }, { metric: "spendGoogle" }], mode: "stacked", line: { metric: "roas" } });
    const byHour = buildTimeChart(computer({ periodo: "ontem", agrupar: "hora" }), spend);
    assert.equal(byHour.empty, true);
    assert.equal(byHour.emptyReason, "daily-only");
    assert.deepEqual(byHour.notes, []);
    const byDay = buildTimeChart(computer({ periodo: "ontem", agrupar: "dia" }), spend);
    assert.equal(byDay.empty, false);
    assert.equal(byDay.emptyReason, null);
  });

  test("colunas 100%: cada ponto soma 100% e o valor de verdade continua guardado", () => {
    const pc = computer({ periodo: "30d" });
    const w = widget<ColumnWidget>({
      id: "c",
      type: "column",
      series: [{ metric: "paid" }, { metric: "pending" }, { metric: "refunded" }],
      mode: "percent",
    });
    const spec = buildTimeChart(pc, w);
    assert.equal(spec.stack, "percent");
    assert.equal(spec.axes.left, "percent");
    assert.equal(spec.drawCompare, false);
    assert.ok(spec.notes.includes(msg.panel.notes.percent));
    assert.ok(spec.notes.includes(msg.panel.notes.stackedCompare));
    spec.categories.forEach((_, i) => {
      const shares = spec.series.map((s) => s.values[i]);
      if (shares.every((v) => v == null)) return;
      assert.ok(near(shares.reduce<number>((a, b) => a + (b ?? 0), 0), 1), `ponto ${i}`);
    });
    assert.deepEqual(spec.series[0].absolute, metricSeries(pc.series(), "paid"));
  });

  test("colunas empilhadas + linha no eixo direito", () => {
    const w = widget<ColumnWidget>({
      id: "c",
      type: "column",
      series: [{ metric: "spendMeta" }, { metric: "spendGoogle" }],
      mode: "stacked",
      line: { metric: "roas" },
    });
    const spec = buildTimeChart(computer(), w);
    assert.deepEqual(
      spec.series.map((s) => [s.id, s.kind, s.axis]),
      [
        ["spendMeta", "column", "left"],
        ["spendGoogle", "column", "left"],
        ["roas", "line", "right"],
      ],
    );
    assert.deepEqual(spec.axes, { left: "money", right: "multiplier" });
  });

  test("sem dado nenhum no período: estado vazio", () => {
    const spec = buildTimeChart(computer({ periodo: "personalizado", de: "2001-01-01", ate: "2001-01-31" }), line);
    assert.equal(spec.empty, true);
    assert.equal(spec.emptyReason, "no-data");
  });
});

describe("barras por dimensão", () => {
  test("Top N + 'Outros' com as taxas refeitas, e a soma fecha com o total", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildBarChart(pc, widget<BarWidget>({ id: "b", type: "bar", dimension: "campaign", metrics: ["net"], topN: 3 }));
    assert.equal(spec.categories.length, 4);
    assert.equal(spec.categories[3].key, OTHERS_KEY);
    assert.equal(spec.categories[3].label, "Outros");
    // Ordem decrescente pela métrica.
    const net = spec.series[0].values as number[];
    assert.ok(net[0] >= net[1] && net[1] >= net[2]);
    // "Outros" + os 3 = o faturamento líquido de todas as campanhas (inclusive as vendas sem campanha).
    assert.equal(
      net.reduce((a, b) => a + b, 0),
      metricValue("net", pc.totals()),
    );

    // ROAS de "Outros" = faturamento deles ÷ gasto deles (não a média dos ROAS).
    const roas = buildBarChart(pc, widget<BarWidget>({ id: "b", type: "bar", dimension: "campaign", metrics: ["roas"], topN: 3 }));
    assert.equal(roas.categories[3].key, OTHERS_KEY);
    const shown = new Set(roas.categories.slice(0, 3).map((c) => c.key));
    // "Outros" = as outras campanhas com gasto; as vendas sem campanha não têm ROAS e ficam de fora.
    const others = pc.dimension("campaign").filter((r) => !shown.has(r.key) && metricValue("roas", r.components) != null);
    assert.ok(!roas.categories.some((c) => c.key === NONE_KEY));
    assert.equal(roas.series[0].values[3], metricValue("roas", sumComponents(others.map((r) => r.components))));
  });

  test("quem gastou e não vendeu aparece com ROAS 0; quem não tem gasto nem venda, não aparece", () => {
    const pc = computer({ periodo: "30d" });
    const rows: Row[] = [
      { key: "a", label: "Campanha A", components: { ...zeroComponents(), baseCents: 50_000, spendCents: 10_000 } },
      { key: "b", label: "Campanha B (gastou, não vendeu)", components: { ...zeroComponents(), spendCents: 8_000 } },
      { key: "c", label: "Campanha C (parada)", components: zeroComponents() },
      { key: NONE_KEY, label: "Sem campanha", components: { ...zeroComponents(), baseCents: 9_000 } },
    ];
    const fake = { ...pc, dimension: () => rows, compareDimension: () => null } as PanelComputer;
    const spec = buildBarChart(fake, widget<BarWidget>({ id: "b", type: "bar", dimension: "campaign", metrics: ["roas"], order: "asc" }));
    assert.deepEqual(
      spec.categories.map((c) => c.key),
      ["b", "a"],
    );
    assert.deepEqual(spec.series[0].values, [0, 5]);
  });

  test("comparação por item: o mesmo item no período anterior; 'Outros' contra o resto de antes", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildBarChart(pc, widget<BarWidget>({ id: "b", type: "bar", dimension: "campaign", metrics: ["net"], topN: 3 }));
    const before = pc.compareDimension("campaign")!;
    const first = spec.categories[0].key;
    assert.equal(spec.series[0].compare?.values[0], metricValue("net", before.find((r) => r.key === first)!.components));
    const shown = new Set(spec.categories.slice(0, 3).map((c) => c.key));
    assert.equal(spec.series[0].compare?.values[3], metricValue("net", sumComponents(before.filter((r) => !shown.has(r.key)).map((r) => r.components))));
  });

  test("sem 'Outros' quando desligado; ordem crescente", () => {
    const spec = buildBarChart(
      computer({ periodo: "30d" }),
      widget<BarWidget>({ id: "b", type: "bar", dimension: "campaign", metrics: ["net"], topN: 3, others: false, order: "asc" }),
    );
    assert.equal(spec.categories.length, 3);
    const net = spec.series[0].values as number[];
    assert.ok(net[0] <= net[1] && net[1] <= net[2]);
  });

  test("por produto: aviso de que o faturamento é a soma dos itens", () => {
    const spec = buildBarChart(computer({ periodo: "30d" }), widget<BarWidget>({ id: "b", type: "bar", dimension: "product", metrics: ["gross"] }));
    assert.ok(spec.categories.length > 0);
    assert.ok(spec.notes.includes(msg.panel.notes.productRevenue));
  });

  test("lucro por campanha avisa que as despesas não se dividem", () => {
    const spec = buildBarChart(computer({ periodo: "30d" }), widget<BarWidget>({ id: "b", type: "bar", dimension: "campaign", metrics: ["profit"] }));
    assert.ok(spec.notes.includes(msg.panel.notes.expensesByItem));
  });
});

describe("imposto do Meta repartido sem perder centavo", () => {
  test("a soma das partes é o imposto do dia inteiro", () => {
    const settings = [{ id: "s", dashboardId: "d", validFrom: "2026-01-01", salesTaxBp: 0, metaAdsTaxBp: 1_383, extraTaxes: [], createdBy: null, createdAt: "" }];
    const parts = [new Map([["2026-10-10", 333]]), new Map([["2026-10-10", 333]]), new Map([["2026-10-10", 334]])];
    const shares = allocateMetaTax(parts, settings);
    // 1.000 × 13,83% = 138,3 → 138 no dia; arredondar cada parte daria 46 + 46 + 46 = 138, mas com outros valores erra.
    assert.equal(
      shares.reduce((a, b) => a + b, 0),
      138,
    );
    const odd = [new Map([["2026-10-10", 101]]), new Map([["2026-10-10", 101]]), new Map([["2026-10-10", 101]])];
    const oddShares = allocateMetaTax(odd, settings);
    // 303 × 13,83% = 41,9 → 42; arredondando cada um: 14 + 14 + 14 = 42; com 3 partes de 13,97 cada a soma bate.
    assert.equal(
      oddShares.reduce((a, b) => a + b, 0),
      42,
    );
    const uneven = [new Map([["2026-10-10", 5]]), new Map([["2026-10-10", 5]]), new Map([["2026-10-10", 5]]), new Map([["2026-10-10", 5]])];
    // 20 × 13,83% = 2,77 → 3; cada parte daria 0,69 → 1 + 1 + 1 + 1 = 4 (errado). Repartido: 3.
    assert.equal(
      allocateMetaTax(uneven, settings).reduce((a, b) => a + b, 0),
      3,
    );
  });
});

describe("as métricas do catálogo usadas nos widgets padrão existem", () => {
  test("ok", () => {
    for (const id of ["net", "roas", "spendMeta", "spendGoogle", "paid", "pending", "refunded", "chargebacks", "gross"] as const) assert.ok(getMetric(id));
  });
});
