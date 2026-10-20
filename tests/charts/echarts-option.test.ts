// A tradução do formato próprio para o ECharts: eixos, trecho parcial,
// comparação, 100%, dica (com o texto escapado) e modo para daltônicos.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { BarSeriesOption, LineSeriesOption } from "echarts";

import { COMPARE_SUFFIX, MAX_COLUMN_LABELS, PARTIAL_SUFFIX, partialRuns, splitPartial, toEChartsOption, tooltipHtml } from "../../components/charts/echarts-option.ts";
import type { ChartTheme } from "../../components/charts/use-chart-theme.ts";
import { DEFAULT_SPEC_DISPLAY, type ChartCategory, type ChartSpec } from "../../lib/charts/spec.ts";

const THEME: ChartTheme = {
  palette: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888"],
  text: "#000000",
  muted: "#555555",
  border: "#cccccc",
  surface: "#ffffff",
  good: "#00aa00",
  bad: "#aa0000",
  font: "Inter",
  colorblind: false,
};

const cat = (key: string, partial: ChartCategory["partial"] = null): ChartCategory => ({
  key,
  label: key,
  longLabel: `dia ${key}`,
  partial,
  compareLabel: `antes de ${key}`,
});

function spec(over: Partial<ChartSpec> = {}): ChartSpec {
  return {
    kind: "axis",
    axis: "time",
    categories: [cat("01"), cat("02"), cat("03"), cat("04", "ongoing")],
    series: [
      {
        id: "net",
        name: "Faturamento líquido",
        kind: "line",
        axis: "left",
        format: "money",
        direction: "up",
        values: [10_000, 12_000, null, 3_000],
        color: 0,
        compare: {
          values: [8_000, 12_000, 1_000, 2_000],
          changes: [{ kind: "pct", value: 0.25, tone: "good" }, { kind: "none", tone: "neutral" }, { kind: "none", tone: "neutral" }, { kind: "pct", value: 0.5, tone: "good" }],
        },
      },
      {
        id: "roas",
        name: "ROAS",
        kind: "line",
        axis: "right",
        format: "multiplier",
        direction: "up",
        values: [2, 2.5, null, 1],
        color: 1,
        compare: {
          values: [4, 2.5, null, 1],
          changes: [{ kind: "pct", value: -0.5, tone: "bad" }, { kind: "none", tone: "neutral" }, { kind: "none", tone: "neutral" }, { kind: "none", tone: "neutral" }],
        },
      },
    ],
    axes: { left: "money", right: "multiplier" },
    stack: "none",
    smooth: false,
    markers: true,
    area: false,
    labels: false,
    zoom: false,
    drawCompare: true,
    references: [{ kind: "average", axis: "right", value: 2, format: "multiplier", label: "Média do período", color: 1 }],
    currency: "BRL",
    compareName: "período anterior",
    notes: [],
    empty: false,
    emptyReason: null,
    ...over,
  };
}

const opts = { reducedMotion: false };
/** O formatador põe espaço inseparável entre "R$" e o número; nos testes, espaço comum. */
const plain = (text: string) => text.replace(/\u00a0/g, " ");
const seriesOf = (o: ReturnType<typeof toEChartsOption>) => o.series as (LineSeriesOption | BarSeriesOption)[];

describe("tradução para o ECharts", () => {
  test("eixo duplo: R$ à esquerda, ROAS à direita, com os rótulos formatados", () => {
    const o = toEChartsOption(spec(), THEME, opts);
    const y = o.yAxis as { position: string; axisLabel: { formatter: (v: number) => string } }[];
    assert.equal(y.length, 2);
    assert.deepEqual(
      y.map((a) => a.position),
      ["left", "right"],
    );
    assert.equal(plain(y[0].axisLabel.formatter(150_000)), "R$ 1,5 mil");
    assert.equal(y[1].axisLabel.formatter(2.5), "2,5x");
    const roas = seriesOf(o).find((s) => s.id === "roas") as LineSeriesOption;
    assert.equal(roas.yAxisIndex, 1);
  });

  test("trecho parcial tracejado e faixa 'Parcial' no fim", () => {
    assert.deepEqual(partialRuns(spec().categories), [[3, 3]]);
    const parts = splitPartial([1, 2, 3, 4], spec().categories);
    assert.deepEqual(parts.solid, [1, 2, 3, null]);
    assert.deepEqual(parts.dashed, [null, null, 3, 4]);
    const o = toEChartsOption(spec(), THEME, opts);
    const dashed = seriesOf(o).find((s) => s.id === `net${PARTIAL_SUFFIX}`) as LineSeriesOption;
    assert.equal((dashed.lineStyle as { type: string }).type, "dashed");
    const first = seriesOf(o)[0] as LineSeriesOption & { markArea?: { data: [{ xAxis: number; label: { position: string; align: string } }, { xAxis: number }][] } };
    const [[start, end]] = first.markArea!.data;
    assert.equal(start.xAxis, 3);
    assert.equal(end.xAxis, 3);
    // O texto "Parcial" fica acima da área (as colunas não o cobrem) e, no fim, cresce para a esquerda.
    assert.equal(start.label.position, "top");
    assert.equal(start.label.align, "right");
    // Os pontos ficam no meio da faixa, para a faixa cobrir o ponto parcial inteiro.
    assert.equal((o.xAxis as { boundaryGap: boolean }).boundaryGap, true);
    // Período cortado no começo (semana pela metade): o texto cresce para a direita.
    const clipped = toEChartsOption(spec({ categories: [cat("01", "clipped"), cat("02"), cat("03"), cat("04")] }), THEME, opts);
    const area = (seriesOf(clipped)[0] as { markArea: { data: [{ label: { align: string } }][] } }).markArea;
    assert.equal(area.data[0][0].label.align, "left");
  });

  test("comparação desenhada como linha pontilhada, com nome próprio na legenda", () => {
    const o = toEChartsOption(spec(), THEME, opts);
    const compare = seriesOf(o).find((s) => s.id === `net${COMPARE_SUFFIX}`) as LineSeriesOption;
    assert.equal(compare.name, "Faturamento líquido (período anterior)");
    assert.equal((compare.lineStyle as { type: string }).type, "dotted");
    assert.deepEqual(compare.data, [8_000, 12_000, 1_000, 2_000]);
    const legend = o.legend as { data: string[] };
    assert.deepEqual(legend.data, ["Faturamento líquido", "Faturamento líquido (período anterior)", "ROAS", "ROAS (período anterior)"]);
    // Sem desenhar: só na dica.
    const off = toEChartsOption(spec({ drawCompare: false }), THEME, opts);
    assert.ok(!seriesOf(off).some((s) => String(s.id).endsWith(COMPARE_SUFFIX)));
  });

  test("linha de média no eixo da série, com o valor formatado", () => {
    const o = toEChartsOption(spec(), THEME, opts);
    const roas = seriesOf(o).find((s) => s.id === "roas") as LineSeriesOption & { markLine?: { data: { yAxis: number; label: { formatter: string } }[] } };
    assert.equal(roas.markLine?.data[0].yAxis, 2);
    assert.equal(roas.markLine?.data[0].label.formatter, "Média do período: 2,00x");
    // Eixo direito no fim da linha; esquerdo no começo (os rótulos de duas médias não se cobrem).
    assert.equal((roas.markLine?.data[0].label as unknown as { position: string }).position, "insideEndTop");
    const left = toEChartsOption(
      spec({ references: [{ kind: "average", axis: "left", value: 9_000, format: "money", label: "Média por dia", color: 0 }] }),
      THEME,
      opts,
    );
    const net = seriesOf(left).find((s) => s.id === "net") as LineSeriesOption & { markLine?: { data: { label: { position: string } }[] } };
    assert.equal(net.markLine?.data[0].label.position, "insideStartTop");
  });

  test("rótulos de valor nas colunas: somem quando há colunas demais para caber", () => {
    const columns = (days: number, drawCompare: boolean) =>
      spec({
        categories: Array.from({ length: days }, (_, i) => cat(String(i + 1).padStart(2, "0"))),
        series: [
          { id: "a", name: "Bruto", kind: "column", axis: "left", format: "money", direction: "up", values: Array(days).fill(100), color: 0 },
          { id: "b", name: "Líquido", kind: "column", axis: "left", format: "money", direction: "up", values: Array(days).fill(90), color: 1 },
        ],
        axes: { left: "money", right: null },
        labels: true,
        drawCompare,
        references: [],
      });
    const shown = (s: ChartSpec) => Boolean((seriesOf(toEChartsOption(s, THEME, opts))[0] as BarSeriesOption).label);
    // 4 semanas × 2 colunas = 8: cabem.
    assert.equal(shown(columns(4, false)), true);
    // 30 dias × 2 colunas (+ comparação) = 60 ou 120: viram só dica e tabela.
    assert.ok(30 * 2 > MAX_COLUMN_LABELS);
    assert.equal(shown(columns(30, false)), false);
    assert.equal(shown(columns(20, true)), false);
  });

  test("barras com rótulo ganham espaço à direita para o valor da maior barra", () => {
    const s = spec({
      axis: "category",
      categories: [cat("A"), cat("B")],
      series: [{ id: "net", name: "Faturamento", kind: "bar", axis: "left", format: "money", direction: "up", values: [2_320_000, 100], color: 0 }],
      axes: { left: "money", right: null },
      labels: true,
      drawCompare: false,
      references: [],
    });
    assert.ok((toEChartsOption(s, THEME, opts).grid as { right: number }).right >= 70);
  });

  test("colunas 100%: eixo até 100% e rótulos em percentual", () => {
    const s = spec({
      stack: "percent",
      axes: { left: "percent", right: null },
      labels: true,
      drawCompare: false,
      references: [],
      series: [
        { id: "a", name: "Pagas", kind: "column", axis: "left", format: "number", direction: "up", values: [0.75, 0.5, null, 1], absolute: [3, 1, 0, 2], color: 0 },
        { id: "b", name: "Pendentes", kind: "column", axis: "left", format: "number", direction: "neutral", values: [0.25, 0.5, null, 0], absolute: [1, 1, 0, 0], color: 1 },
      ],
    });
    const o = toEChartsOption(s, THEME, opts);
    const y = o.yAxis as { max?: number }[];
    assert.equal(y[0].max, 1);
    const bar = seriesOf(o)[0] as BarSeriesOption & { label: { formatter: (p: { value: number }) => string } };
    assert.equal(bar.stack, "total");
    assert.equal(bar.label.formatter({ value: 0.75 }), "75%");
    // Parcial mais claro.
    assert.deepEqual((bar.data as { itemStyle?: { opacity: number } }[])[3].itemStyle, { opacity: 0.55 });
    const html = tooltipHtml(s, THEME, 0, new Set(["Pagas", "Pendentes"]));
    assert.match(html, /75,0% · 3/);
  });

  test("escala logarítmica: eixo esquerdo em base 10, zero e negativo fora do desenho, mas na dica", () => {
    const display = { ...DEFAULT_SPEC_DISPLAY, axisScale: "log" as const };
    const s = spec({
      display,
      references: [
        { kind: "average", axis: "left", value: 0, format: "money", label: "Média zerada", color: 0 },
        { kind: "goal", axis: "left", value: 50_000, format: "money", label: "Meta", color: null },
      ],
    });
    s.series[0].values = [10_000, 0, null, -5];
    const o = toEChartsOption(s, THEME, opts);
    const y = o.yAxis as { type: string; logBase?: number }[];
    assert.equal(y[0].type, "log");
    assert.equal(y[0].logBase, 10);
    // O eixo direito (ROAS) continua linear.
    assert.equal(y[1].type, "value");
    const net = seriesOf(o).find((s) => s.id === "net") as unknown as { data: unknown[]; markLine?: { data: { name: string }[] } };
    assert.deepEqual(net.data, [10_000, null, null, null]);
    const dashed = seriesOf(o).find((x) => x.id === `net${PARTIAL_SUFFIX}`) as LineSeriesOption;
    assert.deepEqual(dashed.data, [null, null, null, null]);
    // Linha de referência em zero não existe no log; a meta continua.
    assert.deepEqual(
      net.markLine?.data.map((l) => l.name),
      ["Meta"],
    );
    // A dica lê o spec: o zero continua aparecendo como R$ 0,00.
    assert.match(plain(tooltipHtml(s, THEME, 1, new Set(["Faturamento líquido", "ROAS"]))), /R\$ 0,00/);
  });

  test("escala logarítmica não vale para empilhado (o eixo fica linear)", () => {
    const s = spec({
      display: { ...DEFAULT_SPEC_DISPLAY, axisScale: "log" },
      stack: "stacked",
      series: [{ id: "a", name: "Gasto", kind: "column", axis: "left", format: "money", direction: "down", values: [1, 2, 3, 4], color: 0 }],
      axes: { left: "money", right: null },
      references: [],
      drawCompare: false,
    });
    assert.equal((toEChartsOption(s, THEME, opts).yAxis as { type: string }[])[0].type, "value");
  });

  test("barras horizontais: o primeiro do ranking em cima, nomes longos cortados", () => {
    const s = spec({
      axis: "category",
      categories: [cat("Campanha muito longa de remarketing"), cat("Outra")],
      series: [{ id: "net", name: "Faturamento líquido", kind: "bar", axis: "left", format: "money", direction: "up", values: [500, 100], color: 0 }],
      axes: { left: "money", right: null },
      drawCompare: false,
      references: [],
    });
    const o = toEChartsOption(s, THEME, opts);
    const y = o.yAxis as { type: string; inverse: boolean; axisLabel: { overflow: string } };
    assert.equal(y.type, "category");
    assert.equal(y.inverse, true);
    assert.equal(y.axisLabel.overflow, "truncate");
    assert.equal((o.xAxis as { type: string }).type, "value");
    assert.equal(o.markArea, undefined);
  });

  test("dica: período por extenso, valores formatados, comparação com seta e cor, texto escapado", () => {
    const s = spec({ categories: [{ ...cat("01"), longLabel: "<img src=x onerror=alert(1)>" }, cat("02"), cat("03"), cat("04", "ongoing")] });
    s.series[0].name = "<b>Faturamento</b>";
    const html = plain(tooltipHtml(s, THEME, 0, new Set(["<b>Faturamento</b>", "ROAS"])));
    assert.ok(!html.includes("<img"), "o texto de fora tem que ser escapado");
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.ok(html.includes("&lt;b&gt;Faturamento&lt;/b&gt;"));
    assert.ok(html.includes("R$ 100,00"));
    assert.ok(html.includes("período anterior, antes de 01: R$ 80,00"));
    assert.ok(html.includes(`color:${THEME.good}`) && html.includes("▲ +25,0%"));
    assert.ok(html.includes(`color:${THEME.bad}`) && html.includes("▼ −50,0%"));
    // Sem base de comparação (antes não havia dado): mostra o valor de antes, sem variação inventada.
    const none = plain(tooltipHtml(spec(), THEME, 1, new Set(["Faturamento líquido"])));
    assert.ok(none.includes("período anterior, antes de 02: R$ 120,00</div>"));
    assert.ok(!none.includes("0,0%"));
    // Ponto parcial avisa na dica.
    assert.match(tooltipHtml(spec(), THEME, 3, new Set(["Faturamento líquido"])), /Parcial: Período ainda em andamento/);
    // Série escondida na legenda some da dica.
    assert.ok(!tooltipHtml(spec(), THEME, 0, new Set(["ROAS"])).includes("Faturamento líquido"));
  });

  test("modo para daltônicos: padrões nas colunas e formas diferentes nos pontos", () => {
    const o = toEChartsOption(spec(), { ...THEME, colorblind: true }, opts);
    assert.deepEqual((o.aria as { decal: { show: boolean } }).decal, { show: true });
    const lines = seriesOf(o).filter((s) => s.id === "net" || s.id === "roas") as LineSeriesOption[];
    assert.notEqual(lines[0].symbol, lines[1].symbol);
    assert.equal(lines[0].showSymbol, true);
  });

  test("animação desligada quando a pessoa pede menos movimento", () => {
    assert.equal(toEChartsOption(spec(), THEME, { reducedMotion: true }).animation, false);
    assert.equal(toEChartsOption(spec(), THEME, opts).animation, true);
  });
});
