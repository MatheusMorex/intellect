import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { msg } from "../../lib/charts/messages.ts";
import { DEFAULT_PANEL, PANEL_WIDGET, widgetMetrics, widgetTitle, type PanelWidgetInput } from "../../lib/charts/widgets.ts";

const errors = (input: unknown) => {
  const result = PANEL_WIDGET.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe("configuração dos widgets (o que a Fase 5 vai salvar)", () => {
  test("o painel padrão é válido e cada widget tem identificador único", () => {
    assert.ok(DEFAULT_PANEL.length >= 10);
    assert.equal(new Set(DEFAULT_PANEL.map((w) => w.id)).size, DEFAULT_PANEL.length);
    for (const w of DEFAULT_PANEL) assert.deepEqual(errors(w), [], w.id);
    assert.deepEqual(
      [...new Set(DEFAULT_PANEL.map((w) => w.type))].sort(),
      ["bar", "column", "donut", "funnel", "gantt", "kpi", "line", "pie", "treemap"],
    );
  });

  test("valores padrão entram quando não vêm", () => {
    const kpi = PANEL_WIDGET.parse({ id: "a", type: "kpi", metric: "net" });
    assert.deepEqual(kpi, {
      id: "a",
      type: "kpi",
      metric: "net",
      title: "",
      subtitle: "",
      ignoreFilters: false,
      overrides: {},
      display: { legend: "auto", numbers: "auto", decimals: null, colors: [], axisMin: null, axisMax: null, grid: true },
      sparkline: true,
      goal: null,
      alert: null,
    });
    const bar = PANEL_WIDGET.parse({ id: "b", type: "bar", dimension: "campaign", metrics: ["net"] });
    assert.equal(bar.type === "bar" && bar.topN, 10);
    assert.equal(bar.type === "bar" && bar.order, "desc");
  });

  test("título automático pelos nomes das métricas", () => {
    assert.equal(widgetTitle(PANEL_WIDGET.parse({ id: "a", type: "kpi", metric: "roas" })), "ROAS");
    assert.equal(
      widgetTitle(
        PANEL_WIDGET.parse({
          id: "l",
          type: "line",
          series: [
            { metric: "net", axis: "left" },
            { metric: "spend", axis: "left" },
            { metric: "roas", axis: "right" },
          ],
        }),
      ),
      "Faturamento líquido, Gasto com anúncios e ROAS",
    );
    assert.equal(widgetTitle(PANEL_WIDGET.parse({ id: "b", type: "bar", dimension: "product", metrics: ["gross"] })), "Faturamento bruto por produto");
    assert.deepEqual(
      widgetMetrics(PANEL_WIDGET.parse({ id: "c", type: "column", series: [{ metric: "spend" }], line: { metric: "roas" } })),
      ["spend", "roas"],
    );
  });

  const bad: [string, PanelWidgetInput | Record<string, unknown>, string][] = [
    ["métrica que não existe", { id: "a", type: "kpi", metric: "faturamento" }, msg.widgetError.metric],
    ["identificador com espaço", { id: "meu widget", type: "kpi", metric: "net" }, msg.widgetError.id],
    ["título grande demais", { id: "a", type: "kpi", metric: "net", title: "x".repeat(81) }, msg.widgetError.textTooLong(80)],
    ["meta do dashboard numa taxa", { id: "a", type: "kpi", metric: "roas", goal: { source: "dashboard" } }, msg.widgetError.goalDashboardMoney],
    ["meta zero", { id: "a", type: "kpi", metric: "net", goal: { source: "value", value: 0 } }, msg.widgetError.goalPositive],
    [
      "R$ e ROAS no mesmo eixo",
      {
        id: "l",
        type: "line",
        series: [
          { metric: "net", axis: "left" },
          { metric: "roas", axis: "left" },
        ],
      },
      msg.widgetError.mixedUnits,
    ],
    ["só eixo direito", { id: "l", type: "line", series: [{ metric: "net", axis: "right" }] }, msg.widgetError.leftAxisEmpty],
    [
      "meta num eixo vazio",
      { id: "l", type: "line", series: [{ metric: "net", axis: "left" }], goal: { value: 10, axis: "right" } },
      msg.widgetError.goalAxis,
    ],
    ["métrica repetida", { id: "l", type: "line", series: [{ metric: "net" }, { metric: "net" }] }, msg.widgetError.repeated],
    ["cinco séries", { id: "l", type: "line", series: ["net", "gross", "spend", "profit", "fees"].map((metric) => ({ metric })) }, msg.widgetError.seriesMax(4)],
    ["nenhuma série", { id: "l", type: "line", series: [] }, msg.widgetError.seriesMin],
    [
      "taxa empilhada",
      { id: "c", type: "column", series: [{ metric: "cpa" }, { metric: "cpc" }], mode: "stacked" },
      msg.widgetError.stackRates,
    ],
    [
      "taxa no 100%",
      { id: "c", type: "column", series: [{ metric: "roas" }], mode: "percent" },
      msg.widgetError.stackRates,
    ],
    [
      "linha repetindo a coluna",
      { id: "c", type: "column", series: [{ metric: "spend" }], line: { metric: "spend" } },
      msg.widgetError.repeated,
    ],
    ["ROAS por produto", { id: "b", type: "bar", dimension: "product", metrics: ["roas"] }, msg.widgetError.dimensionMetric("ROAS", "Produto")],
    ["gasto por UTM", { id: "b", type: "bar", dimension: "utmSource", metrics: ["spend"] }, msg.widgetError.dimensionMetric("Gasto com anúncios", "Origem (utm_source)")],
    ["dimensão que não existe", { id: "b", type: "bar", dimension: "pais", metrics: ["net"] }, msg.widgetError.dimension],
    ["top 0", { id: "b", type: "bar", dimension: "campaign", metrics: ["net"], topN: 0 }, msg.widgetError.topN],
    ["top 51", { id: "b", type: "bar", dimension: "campaign", metrics: ["net"], topN: 51 }, msg.widgetError.topN],
    ["top quebrado", { id: "b", type: "bar", dimension: "campaign", metrics: ["net"], topN: 2.5 }, msg.widgetError.topN],
  ];
  for (const [name, input, expected] of bad) {
    test(`recusa: ${name}`, () => {
      assert.ok(errors(input).includes(expected), `${JSON.stringify(errors(input))} deveria ter "${expected}"`);
    });
  }

  test("valor infinito ou que não é número é recusado", () => {
    assert.ok(errors({ id: "a", type: "kpi", metric: "roas", alert: { when: "below", value: Infinity } }).length > 0);
    assert.ok(errors({ id: "a", type: "kpi", metric: "roas", alert: { when: "below", value: "2" } }).length > 0);
    assert.ok(errors({ id: "a", type: "torta", metric: "net" }).length > 0);
  });
});
