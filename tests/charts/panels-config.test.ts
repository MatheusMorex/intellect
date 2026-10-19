// Fase 5: painéis salvos. Modelos prontos e a grade de 12 colunas, quem vê cada
// painel, os filtros que valem (endereço ou padrões do painel), o período e os
// filtros próprios de um gráfico, a troca de tipo no editor sem perder a
// configuração, as unidades dos campos, o CSV e a aparência no desenho.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { BarSeriesOption, LineSeriesOption } from "echarts";

import { seriesColor, toEChartsOption } from "../../components/charts/echarts-option.ts";
import type { ChartTheme } from "../../components/charts/use-chart-theme.ts";
import { csvField, csvNumber, exportFileName, specToCsv } from "../../lib/charts/csv.ts";
import { defaultWidget, fromInputValue, newWidgetId, scopeNote, switchWidgetType, toInputValue } from "../../lib/charts/editor.ts";
import type { ChartSpec, FunnelSpec, PieSpec, SpecDisplay } from "../../lib/charts/spec.ts";
import { GRID_COLS, normalizeLayout, PANEL_LAYOUT, PANEL_TEMPLATES, placeWidgets, templatePanel, WIDGET_SIZE } from "../../lib/charts/templates.ts";
import { DEFAULT_PANEL, PANEL_WIDGET, WIDGET_TYPES, type PanelWidget } from "../../lib/charts/widgets.ts";
import { canSeePanel, effectiveParams, parseWidgets, pickFilters, widgetParams } from "../../server/data/panel-config.ts";
import { createSeed, defaultPanel, STORE_VERSION, upgradeStore } from "../../server/store/seed.ts";
import type { PanelRow, Store } from "../../server/store/types.ts";

const THEME: ChartTheme = {
  palette: ["#4b3bd0", "#c25a12", "#1e8a56", "#1d7489", "#b03f86", "#856700", "#2a64c9", "#6e6b80"],
  text: "#000000",
  muted: "#777777",
  border: "#cccccc",
  surface: "#ffffff",
  good: "#00aa00",
  bad: "#aa0000",
  font: "Inter",
  colorblind: false,
};

/** Nenhum par de retângulos da grade se cobre. */
function overlaps(layout: { x: number; y: number; w: number; h: number }[]) {
  for (let a = 0; a < layout.length; a++) {
    for (let b = a + 1; b < layout.length; b++) {
      const p = layout[a];
      const q = layout[b];
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) return true;
    }
  }
  return false;
}

describe("modelos prontos e grade", () => {
  test("todo modelo é válido: gráficos aprovados pela validação e grade sem sobreposição, dentro das 12 colunas", () => {
    for (const id of PANEL_TEMPLATES) {
      const { widgets, layout } = templatePanel(id);
      for (const w of widgets) assert.ok(PANEL_WIDGET.safeParse(w).success, `${id}: ${w.id}`);
      assert.equal(new Set(widgets.map((w) => w.id)).size, widgets.length, `${id}: ids únicos`);
      assert.deepEqual(new Set(layout.map((l) => l.i)), new Set(widgets.map((w) => w.id)), `${id}: um lugar para cada gráfico`);
      assert.ok(PANEL_LAYOUT.safeParse(layout).success, id);
      assert.ok(layout.every((l) => l.x + l.w <= GRID_COLS));
      assert.ok(!overlaps(layout), `${id}: sem sobreposição`);
    }
    assert.equal(templatePanel("em-branco").widgets.length, 0);
    assert.deepEqual(
      templatePanel("visao-geral").widgets.map((w) => w.id),
      DEFAULT_PANEL.map((w) => w.id),
    );
  });

  test("posições: 4 cartões por linha, 2 gráficos por linha, treemap e Gantt na linha inteira", () => {
    const layout = placeWidgets([
      { id: "a", type: "kpi" },
      { id: "b", type: "kpi" },
      { id: "c", type: "kpi" },
      { id: "d", type: "kpi" },
      { id: "e", type: "kpi" },
      { id: "f", type: "line" },
      { id: "g", type: "gantt" },
    ]);
    const at = (i: string) => layout.find((l) => l.i === i)!;
    assert.deepEqual([at("a").x, at("d").x, at("d").y], [0, 9, 0]);
    assert.deepEqual([at("e").x, at("e").y], [0, WIDGET_SIZE.kpi.h], "o quinto cartão vai para a linha de baixo");
    assert.deepEqual([at("f").x, at("f").y], [3, WIDGET_SIZE.kpi.h]);
    assert.deepEqual([at("g").x, at("g").y, at("g").w], [0, WIDGET_SIZE.kpi.h + WIDGET_SIZE.line.h, 12]);
  });

  test("a grade salva é corrigida: sem gráfico removido, tamanho mínimo e os novos no fim", () => {
    const widgets = [
      { id: "a", type: "line" as const },
      { id: "b", type: "kpi" as const },
    ];
    const fixed = normalizeLayout(widgets, [
      { i: "a", x: 10, y: 0, w: 1, h: 1 },
      { i: "sumiu", x: 0, y: 0, w: 6, h: 9 },
    ]);
    assert.deepEqual(fixed[0], { i: "a", x: 12 - WIDGET_SIZE.line.minW, y: 0, w: WIDGET_SIZE.line.minW, h: WIDGET_SIZE.line.minH });
    assert.equal(fixed.length, 2);
    assert.equal(fixed[1].i, "b");
    assert.ok(fixed[1].y >= WIDGET_SIZE.line.minH, "o novo vai abaixo dos que já estão");
    assert.ok(!PANEL_LAYOUT.safeParse([{ i: "a", x: 8, y: 0, w: 6, h: 4 }]).success, "não passa da 12ª coluna");
  });
});

describe("quem vê e quais filtros valem", () => {
  const panel = (over: Partial<PanelRow> = {}): PanelRow => ({ ...defaultPanel("d", null, "2026-10-18T00:00:00Z"), ...over });

  test("admin vê tudo; membro vê os do workspace e os que o liberaram; quem não é do workspace, nada", () => {
    const restricted = panel({ visibility: "restricted", viewerIds: ["bruno"] });
    assert.ok(canSeePanel(restricted, "ana", "admin"));
    assert.ok(canSeePanel(restricted, "bruno", "normal"));
    assert.ok(!canSeePanel(restricted, "carla", "normal"));
    assert.ok(canSeePanel(panel(), "carla", "normal"));
    assert.ok(!canSeePanel(panel(), "estranho", null));
  });

  test("filtros: os do endereço quando a pessoa pode filtrar e mexeu; senão, os padrões do painel", () => {
    const defaults = { periodo: "7d", fonte: "meta" };
    assert.deepEqual(effectiveParams({ periodo: "30d", painel: "x" }, defaults, true), { periodo: "30d" });
    assert.deepEqual(effectiveParams({ painel: "x", editar: "1" }, defaults, true), defaults, "endereço sem filtros: abre com os padrões");
    assert.deepEqual(effectiveParams({ periodo: "30d", conta: "c1" }, defaults, false), defaults, "membro sem permissão: só os padrões");
    assert.deepEqual(pickFilters({ periodo: "30d", painel: "x", conta: ["a", "b"], vazio: "" }), { periodo: "30d", conta: "a,b" });
  });

  test("gráfico com período, agrupamento e comparação próprios, e sem os filtros do painel", () => {
    const params = { periodo: "personalizado", de: "2026-10-01", ate: "2026-10-10", conta: "c1", fonte: "meta", agrupar: "dia", comparar: "datas", cde: "2026-09-01", cate: "2026-09-10" };
    const widget = PANEL_WIDGET.parse({ id: "k", type: "kpi", metric: "net", ignoreFilters: true, overrides: { periodo: "7d", agrupar: "week", comparar: "year" } });
    assert.deepEqual(widgetParams(params, widget), { periodo: "7d", agrupar: "semana", comparar: "ano" });
    const plain = PANEL_WIDGET.parse({ id: "k", type: "kpi", metric: "net" });
    assert.deepEqual(widgetParams(params, plain), params, "sem nada próprio, segue o painel");
    assert.equal(scopeNote(widget), "Período próprio: Últimos 7 dias · por semana · comparação: mesmo período do ano anterior · sem os filtros do painel");
    assert.equal(scopeNote(plain), undefined);
  });

  test("gráfico salvo com configuração que não vale mais fica de fora, sem derrubar o painel", () => {
    const good = DEFAULT_PANEL[0];
    const { widgets, invalid } = parseWidgets([good, { id: "x", type: "pie", dimension: "platform", metric: "roas" }, good, { lixo: true }]);
    assert.deepEqual(
      widgets.map((w) => w.id),
      [good.id],
    );
    assert.equal(invalid, 3, "taxa em pizza, id repetido e lixo");
  });
});

describe("dados guardados (versão 8)", () => {
  test("o seed nasce com a Visão geral em cada dashboard", () => {
    const store = createSeed(new Date("2026-10-17T15:00:00Z"));
    assert.equal(store.version, STORE_VERSION);
    assert.equal(store.panels.length, store.dashboards.length);
    const panel = store.panels[0];
    assert.deepEqual([panel.name, panel.isDefault, panel.visibility, panel.dashboardId], ["Visão geral", true, "workspace", store.dashboards[0].id]);
    assert.equal(parseWidgets(panel.widgets).invalid, 0);
  });

  test("dados da versão 7 ganham os painéis sem perder nada", () => {
    const store = createSeed(new Date("2026-10-17T15:00:00Z"));
    const orders = store.orders.length;
    const old = store as unknown as { panels?: unknown; version: number };
    delete old.panels;
    old.version = 7;
    const upgraded = upgradeStore(store as Store)!;
    assert.equal(upgraded.version, STORE_VERSION);
    assert.equal(upgraded.panels.length, upgraded.dashboards.length);
    assert.equal(upgraded.orders.length, orders);
  });
});

describe("editor de gráfico", () => {
  test("todo tipo nasce válido e com um id aceito", () => {
    for (const type of WIDGET_TYPES) assert.ok(PANEL_WIDGET.safeParse(defaultWidget(type, newWidgetId())).success, type);
    assert.match(newWidgetId(), /^g-[a-z0-9]{10}$/);
  });

  test("trocar de tipo sempre dá um gráfico válido e guarda título, filtros e aparência", () => {
    const sources: PanelWidget[] = [
      ...DEFAULT_PANEL,
      PANEL_WIDGET.parse({
        id: "x",
        type: "line",
        title: "Meu gráfico",
        ignoreFilters: true,
        overrides: { periodo: "7d" },
        display: { legend: "bottom", colors: ["#ff0000"] },
        series: [
          { metric: "spend", axis: "left" },
          { metric: "roas", axis: "right" },
        ],
      }),
    ];
    for (const source of sources) {
      for (const type of WIDGET_TYPES) {
        const next = switchWidgetType(source, type);
        assert.equal(next.type, type);
        assert.ok(PANEL_WIDGET.safeParse(next).success, `${source.id} → ${type}`);
        assert.equal(next.id, source.id);
        assert.equal(next.title, source.title);
        assert.deepEqual(next.display, source.display);
        assert.deepEqual(next.overrides, source.overrides);
      }
    }
  });

  test("trocas que aproveitam as métricas", () => {
    const line = PANEL_WIDGET.parse({ id: "x", type: "line", series: [{ metric: "spend", axis: "left" }, { metric: "roas", axis: "right" }] });
    const column = switchWidgetType(line, "column");
    assert.ok(column.type === "column" && column.series[0].metric === "spend" && column.line?.metric === "roas", "gasto nas colunas, ROAS como linha");
    const pie = switchWidgetType(line, "pie");
    assert.ok(pie.type === "pie" && pie.metric === "spend", "a pizza fica com a métrica que se soma");
    const treemap = switchWidgetType(line, "treemap");
    assert.ok(treemap.type === "treemap" && treemap.size === "spend" && treemap.color === "roas", "tamanho pelo gasto, cor pelo ROAS");
    const donut = switchWidgetType(PANEL_WIDGET.parse({ id: "p", type: "pie", dimension: "paymentMethod", metric: "paid", slices: 4 }), "donut");
    assert.ok(donut.type === "donut" && donut.dimension === "paymentMethod" && donut.slices === 4, "pizza ↔ rosca guarda tudo");
  });

  test("campos de valor: reais e % na tela, centavos e fração guardados", () => {
    assert.equal(toInputValue(150_000, "money"), "1500");
    assert.equal(toInputValue(0.125, "percent"), "12,5");
    assert.equal(toInputValue(2.5, "multiplier"), "2,5");
    assert.equal(toInputValue(null, "money"), "");
    assert.equal(fromInputValue("1.500", "money"), 150_000, "ponto de milhar");
    assert.equal(fromInputValue("1.234,56", "money"), 123_456);
    assert.equal(fromInputValue("R$ 99,9", "money"), 9_990);
    assert.equal(fromInputValue("12,5%", "percent"), 0.125);
    assert.equal(fromInputValue("2,35x", "multiplier"), 2.35);
    assert.equal(fromInputValue("1234.5", "number"), 1234.5);
    assert.equal(fromInputValue("abc", "money"), null);
    assert.equal(fromInputValue("  ", "money"), null);
  });
});

describe("exportar CSV", () => {
  test("números no jeito do Excel em português, campos com ; entre aspas", () => {
    assert.equal(csvNumber(123_456, "money"), "1234,56");
    assert.equal(csvNumber(0.125, "percent"), "12,50");
    assert.equal(csvNumber(2.35, "multiplier"), "2,3500");
    assert.equal(csvNumber(42, "number"), "42");
    assert.equal(csvNumber(null, "money"), "");
    assert.equal(csvField('Campanha; "teste"'), '"Campanha; ""teste"""');
    assert.equal(exportFileName('Gasto/ROAS: "maio"', "csv"), "Gasto ROAS maio .csv".replace(" .", "."));
  });

  test("gráfico no tempo, pizza e funil", () => {
    const axis: ChartSpec = {
      kind: "axis",
      axis: "time",
      categories: [{ key: "1", label: "01/10", longLabel: "1 de outubro", partial: null, compareLabel: null }],
      series: [{ id: "net", name: "Faturamento líquido", kind: "line", axis: "left", format: "money", direction: "up", values: [123_456], color: 0 }],
      axes: { left: "money", right: null },
      stack: "none",
      smooth: false,
      markers: true,
      area: false,
      labels: false,
      zoom: false,
      drawCompare: false,
      references: [],
      currency: "BRL",
      compareName: null,
      notes: [],
      empty: false,
      emptyReason: null,
    };
    assert.equal(specToCsv(axis), "﻿Período;Faturamento líquido (R$)\r\n1 de outubro;1234,56\r\n");
    const pie: PieSpec = {
      kind: "pie",
      donut: false,
      metric: { id: "paid", name: "Vendas pagas", format: "number", direction: "up" },
      slices: [{ key: "pix", label: "Pix", value: 3, share: 0.75, color: 0, compare: null }, { key: "b", label: "Boleto", value: 1, share: 0.25, color: 1, compare: null }],
      total: 4,
      compareTotal: null,
      labels: "both",
      currency: "BRL",
      compareName: null,
      notes: [],
      empty: false,
      emptyReason: null,
    };
    assert.equal(specToCsv(pie).split("\r\n")[3], "Total;4;100,00");
    const funnel: FunnelSpec = {
      kind: "funnel",
      source: "sales",
      steps: [{ key: "a", label: "Cliques", value: 100, fromPrevious: null, fromTop: 1, compare: null, biggestLoss: false }],
      board: null,
      currency: "BRL",
      compareName: null,
      notes: [],
      empty: false,
      emptyReason: null,
    };
    assert.equal(specToCsv(funnel).split("\r\n")[1], "Cliques;100;;100,00");
  });
});

describe("aparência escolhida no editor", () => {
  const spec = (display?: ChartSpec["display"]): ChartSpec => ({
    kind: "axis",
    axis: "time",
    categories: [1, 2, 3].map((i) => ({ key: String(i), label: String(i), longLabel: String(i), partial: null, compareLabel: null })),
    series: [
      { id: "a", name: "A", kind: "column", axis: "left", format: "money", direction: "up", values: [100_000, 200_000, 300_000], color: 0 },
      { id: "b", name: "B", kind: "column", axis: "left", format: "money", direction: "up", values: [1, 2, 3], color: 1 },
    ],
    axes: { left: "money", right: null },
    stack: "none",
    smooth: false,
    markers: true,
    area: false,
    labels: true,
    zoom: false,
    drawCompare: false,
    references: [],
    currency: "BRL",
    compareName: null,
    notes: [],
    empty: false,
    emptyReason: null,
    display,
  });
  const base: SpecDisplay = { legend: "auto", numbers: "auto", decimals: null, colors: [], axisMin: null, axisMax: null, grid: true };

  test("cores escolhidas, legenda escondida ou embaixo, eixo fixo e sem grade", () => {
    const option = toEChartsOption(spec({ ...base, colors: ["#ff0000"], legend: "none", axisMin: 0, axisMax: 500_000, grid: false }), THEME, { reducedMotion: true });
    const series = option.series as BarSeriesOption[];
    assert.equal((series[0].itemStyle as { color: string }).color, "#ff0000");
    assert.equal((series[1].itemStyle as { color: string }).color, THEME.palette[1], "a que não foi escolhida vem da paleta");
    assert.equal(option.legend, undefined);
    const yAxis = (option.yAxis as { min?: number; max?: number; splitLine: { show: boolean } }[])[0];
    assert.deepEqual([yAxis.min, yAxis.max, yAxis.splitLine.show], [0, 500_000, false]);
    const bottom = toEChartsOption(spec({ ...base, legend: "bottom" }), THEME, { reducedMotion: true });
    assert.equal((bottom.legend as { bottom?: number }).bottom, 0);
    assert.equal(seriesColor(2, THEME, { ...base, colors: ["#ff0000"] }), THEME.palette[2]);
  });

  test("números completos nos rótulos", () => {
    const compact = toEChartsOption(spec(), THEME, { reducedMotion: true });
    const full = toEChartsOption(spec({ ...base, numbers: "full" }), THEME, { reducedMotion: true });
    const label = (o: typeof compact) => ((o.series as BarSeriesOption[])[0].label as { formatter: (p: { value: number }) => string }).formatter({ value: 300_000 });
    assert.match(label(compact), /^R\$\s3\smil$/);
    assert.match(label(full), /^R\$\s3\.000$/);
  });

  test("linhas sem a aparência guardada continuam como antes", () => {
    const line: ChartSpec = { ...spec(), series: spec().series.map((s) => ({ ...s, kind: "line" as const })), display: undefined };
    const option = toEChartsOption(line, THEME, { reducedMotion: true });
    assert.equal(((option.series as LineSeriesOption[])[0].lineStyle as { color: string }).color, THEME.palette[0]);
    assert.ok(option.legend, "duas séries: legenda em cima");
  });
});
