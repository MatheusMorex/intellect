// Tradução do formato próprio dos gráficos (lib/charts/spec.ts) para a
// configuração do ECharts. É o único arquivo (com echarts-chart.tsx) que sabe
// que o ECharts existe: trocar de biblioteca é reescrever só estes dois.
//
// Função pura, sem navegador: os testes rodam com `npm test`.

import type { BarSeriesOption, EChartsOption, LineSeriesOption } from "echarts";

import type { MetricFormat } from "@/lib/charts/catalog";
import { formatChange, formatMetricValue, type Change } from "@/lib/charts/format";
import { msg } from "@/lib/charts/messages";
import type { ChartCategory, ChartSeries, ChartSpec, ReferenceLine } from "@/lib/charts/spec";

import type { ChartTheme } from "./use-chart-theme";

/** Formas dos pontos no modo para daltônicos: a série não depende só da cor. */
const SYMBOLS = ["circle", "rect", "triangle", "diamond"] as const;

/** Mais colunas que isso no gráfico e os rótulos de valor se amontoam: ficam só na dica e na tabela. */
export const MAX_COLUMN_LABELS = 40;

/** Sufixos das séries extras (o trecho parcial e a comparação) no id do ECharts. */
export const PARTIAL_SUFFIX = "__parcial";
export const COMPARE_SUFFIX = "__comparacao";

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Pedaços seguidos de pontos parciais: [[início, fim], ...]. */
export function partialRuns(categories: ChartCategory[]): [number, number][] {
  const runs: [number, number][] = [];
  categories.forEach((c, i) => {
    if (!c.partial) return;
    const last = runs.at(-1);
    if (last && last[1] === i - 1) last[1] = i;
    else runs.push([i, i]);
  });
  return runs;
}

/**
 * Linha com trecho parcial: a série cheia não passa pelos pontos parciais, e a
 * tracejada só liga os parciais aos vizinhos (o trecho em andamento fica
 * tracejado, sem "cair" no fim do gráfico como se fosse queda de verdade).
 */
export function splitPartial(values: (number | null)[], categories: ChartCategory[]) {
  const partial = categories.map((c) => c.partial != null);
  return {
    solid: values.map((v, i) => (partial[i] ? null : v)),
    dashed: values.map((v, i) => (partial[i] || partial[i - 1] || partial[i + 1] ? v : null)),
  };
}

type Options = { reducedMotion: boolean };

export function toEChartsOption(spec: ChartSpec, theme: ChartTheme, { reducedMotion }: Options): EChartsOption {
  const horizontal = spec.axis === "category";
  const color = (index: number) => theme.palette[index % theme.palette.length] || theme.text;
  const fmt = (value: number | null | undefined, format: MetricFormat, decimals?: number) =>
    formatMetricValue(value, format, { currency: spec.currency, decimals });
  const compactFmt = (value: number, format: MetricFormat, decimals: number) =>
    formatMetricValue(value, format, { currency: spec.currency, style: "compact", decimals });

  // Percentual pequeno (CTR de 1,2%) precisa de uma casa no eixo, senão os rótulos se repetem.
  const axisMax = (axis: "left" | "right") =>
    Math.max(0, ...spec.series.filter((s) => s.axis === axis).flatMap((s) => s.values.map((v) => Math.abs(v ?? 0))));
  const axisDecimals = (format: MetricFormat, axis: "left" | "right") =>
    format === "percent" ? (axisMax(axis) < 0.1 && spec.stack !== "percent" ? 1 : 0) : format === "multiplier" ? 1 : 0;
  const axisFormatter = (format: MetricFormat, axis: "left" | "right") => (value: number) =>
    compactFmt(value, format, axisDecimals(format, axis));

  // ---- eixos ----
  const categoryAxis = {
    type: "category" as const,
    data: spec.categories.map((c) => c.label),
    // Cada ponto no meio da sua faixa (como as colunas): a faixa "Parcial" cobre o ponto inteiro.
    boundaryGap: true,
    axisLabel: horizontal
      ? { color: theme.muted, width: 150, overflow: "truncate" as const }
      : { color: theme.muted, hideOverlap: true },
    axisLine: { lineStyle: { color: theme.border } },
    axisTick: { show: false },
    inverse: horizontal, // o primeiro do ranking em cima
  };
  const valueAxis = (format: MetricFormat, axis: "left" | "right") => ({
    type: "value" as const,
    position: horizontal ? ("bottom" as const) : axis,
    max: spec.stack === "percent" && axis === "left" ? 1 : undefined,
    // Nas barras o eixo de valores fica embaixo e tem pouca largura: rótulo que encostaria no vizinho some.
    axisLabel: { color: theme.muted, formatter: axisFormatter(format, axis), hideOverlap: true },
    splitLine: { show: axis === "left", lineStyle: { color: theme.border, type: "dashed" as const } },
  });
  const valueAxes = [valueAxis(spec.axes.left, "left"), ...(spec.axes.right ? [valueAxis(spec.axes.right, "right")] : [])];

  // ---- linhas de referência (meta e média) ----
  const referenceMarks = (series: ChartSeries) => {
    const lines = spec.references.filter((r) => r.axis === series.axis && firstOnAxis(series));
    if (!lines.length) return undefined;
    return {
      silent: true,
      symbol: "none",
      data: lines.map((r: ReferenceLine) => ({
        ...(horizontal ? { xAxis: r.value } : { yAxis: r.value }),
        name: r.label,
        lineStyle: { color: r.color == null ? theme.text : color(r.color), type: "dashed" as const, width: 1, opacity: 0.8 },
        label: {
          formatter: `${r.label}: ${fmt(r.value, r.format, r.decimals)}`,
          // Eixo esquerdo no começo da linha, direito no fim: os rótulos de duas médias não se cobrem.
          position: r.axis === "left" ? ("insideStartTop" as const) : ("insideEndTop" as const),
          color: r.color == null ? theme.text : color(r.color),
          fontSize: 11,
          backgroundColor: theme.surface,
          padding: [1, 4],
          borderRadius: 3,
        },
      })),
    };
  };
  const firstOnAxis = (series: ChartSeries) => spec.series.find((s) => s.axis === series.axis) === series;

  // ---- faixa "Parcial" no eixo do tempo ----
  const runs = horizontal ? [] : partialRuns(spec.categories);
  type AreaItem = NonNullable<NonNullable<LineSeriesOption["markArea"]>["data"]>[number];
  const partialArea = runs.length
    ? {
        silent: true,
        itemStyle: { color: theme.muted, opacity: 0.1 },
        data: runs.map(([from, to]): AreaItem => [
          {
            xAxis: from,
            // O texto fica logo acima da área do gráfico (as colunas não o cobrem) e cresce para
            // dentro dele: no começo, para a direita; no fim, para a esquerda.
            label: {
              show: true,
              position: "top" as const,
              align: from === 0 ? ("left" as const) : ("right" as const),
              distance: 2,
              color: theme.muted,
              fontSize: 11,
              formatter: msg.partial.label,
              backgroundColor: theme.surface,
              padding: [1, 4],
              borderRadius: 3,
            },
          },
          { xAxis: to },
        ]),
      }
    : undefined;

  const stacked = spec.stack !== "none";
  const drawnColumns = spec.series.filter((s) => s.kind === "column").length * (spec.drawCompare ? 2 : 1);
  const showLabels = spec.labels && (horizontal || spec.categories.length * drawnColumns <= MAX_COLUMN_LABELS);
  const series: (LineSeriesOption | BarSeriesOption)[] = [];
  spec.series.forEach((s, index) => {
    const c = color(s.color);
    const yAxisIndex = s.axis === "right" ? 1 : 0;
    const extras = index === 0 ? { markArea: partialArea } : {};

    if (s.kind === "line") {
      const base: LineSeriesOption = {
        type: "line",
        name: s.name,
        yAxisIndex,
        smooth: spec.smooth,
        connectNulls: false,
        symbol: theme.colorblind ? SYMBOLS[index % SYMBOLS.length] : "circle",
        symbolSize: 7,
        showSymbol: spec.markers || theme.colorblind,
        itemStyle: { color: c },
        lineStyle: { color: c, width: 2 },
        emphasis: { focus: "series" },
        z: 3,
      };
      const parts = runs.length ? splitPartial(s.values, spec.categories) : null;
      series.push({
        ...base,
        id: s.id,
        data: parts ? parts.solid : s.values,
        areaStyle: spec.area ? { color: c, opacity: 0.12 } : undefined,
        markLine: referenceMarks(s),
        ...extras,
      });
      if (parts) {
        series.push({
          ...base,
          id: `${s.id}${PARTIAL_SUFFIX}`,
          data: parts.dashed,
          lineStyle: { color: c, width: 2, type: "dashed" },
          areaStyle: spec.area ? { color: c, opacity: 0.06 } : undefined,
        });
      }
      if (spec.drawCompare && s.compare) {
        series.push({
          ...base,
          id: `${s.id}${COMPARE_SUFFIX}`,
          name: `${s.name} (${spec.compareName})`,
          data: s.compare.values,
          showSymbol: false,
          lineStyle: { color: c, width: 1.5, type: "dotted", opacity: 0.75 },
          itemStyle: { color: c, opacity: 0.75 },
          z: 2,
        });
      }
      return;
    }

    // Coluna (vertical) ou barra (horizontal).
    const labelPosition = stacked ? "inside" : horizontal ? "right" : "top";
    const bar: BarSeriesOption = {
      type: "bar",
      id: s.id,
      name: s.name,
      ...(horizontal ? {} : { yAxisIndex }),
      stack: stacked ? "total" : undefined,
      barMaxWidth: horizontal ? 22 : 40,
      itemStyle: { color: c, borderRadius: stacked ? 0 : horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
      data: s.values.map((value, i) => ({ value, itemStyle: spec.categories[i].partial ? { opacity: 0.55 } : undefined })),
      label: showLabels
        ? {
            show: true,
            position: labelPosition,
            color: theme.text,
            fontSize: 11,
            textBorderColor: stacked ? theme.surface : undefined,
            textBorderWidth: stacked ? 2 : 0,
            formatter: (p: { value?: unknown }) => {
              const v = typeof p.value === "number" ? p.value : null;
              if (v == null || v === 0) return "";
              return spec.stack === "percent" ? compactFmt(v, "percent", 0) : compactFmt(v, s.format, s.format === "multiplier" ? 2 : 0);
            },
          }
        : undefined,
      labelLayout: { hideOverlap: true },
      emphasis: { focus: "series" },
      markLine: referenceMarks(s),
      ...extras,
    };
    series.push(bar);
    if (spec.drawCompare && s.compare && !horizontal) {
      series.push({
        type: "bar",
        id: `${s.id}${COMPARE_SUFFIX}`,
        name: `${s.name} (${spec.compareName})`,
        yAxisIndex,
        barMaxWidth: 40,
        itemStyle: {
          color: c,
          opacity: 0.4,
          borderRadius: [3, 3, 0, 0],
          decal: { symbol: "rect", dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: Math.PI / 4, color: theme.surface },
        },
        data: s.compare.values,
        emphasis: { focus: "series" },
      });
    }
  });

  const legendNames = [...new Set(series.map((s) => String(s.name)))];
  const legend = legendNames.length > 1;
  const zoom = spec.zoom && spec.categories.length > 7;

  return {
    backgroundColor: "transparent",
    animation: !reducedMotion,
    animationDuration: 300,
    textStyle: { fontFamily: theme.font },
    aria: { enabled: theme.colorblind, label: { enabled: false }, decal: { show: theme.colorblind } },
    // Nas barras, espaço à direita para o valor na ponta da maior barra.
    grid: { left: 8, right: horizontal && showLabels ? 76 : 12, top: legend ? 40 : 16, bottom: zoom ? 48 : 8 },
    legend: legend
      ? {
          type: "scroll",
          top: 0,
          left: 0,
          data: legendNames,
          icon: "roundRect",
          itemWidth: 12,
          itemHeight: 8,
          textStyle: { color: theme.muted },
          pageTextStyle: { color: theme.muted },
        }
      : undefined,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: horizontal || spec.series.some((s) => s.kind === "column") ? "shadow" : "line" },
      confine: true,
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: theme.text, fontSize: 12 },
      extraCssText: "border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.25); max-width: 360px; white-space: normal;",
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params];
        const index = list[0]?.dataIndex;
        if (index == null) return "";
        const visible = new Set(list.map((p) => p.seriesName));
        return tooltipHtml(spec, theme, index, visible);
      },
    },
    dataZoom: zoom
      ? [
          { type: "inside", xAxisIndex: 0, zoomOnMouseWheel: "shift", moveOnMouseWheel: false, moveOnMouseMove: true },
          {
            type: "slider",
            xAxisIndex: 0,
            height: 20,
            bottom: 8,
            borderColor: theme.border,
            textStyle: { color: theme.muted },
            fillerColor: "rgba(127,127,127,0.15)",
            dataBackground: { lineStyle: { color: theme.muted }, areaStyle: { color: theme.muted, opacity: 0.1 } },
          },
        ]
      : undefined,
    xAxis: horizontal ? valueAxes[0] : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxes,
    series,
  };
}

// ---- dica ---------------------------------------------------------------------------------------

function changeHtml(change: Change, theme: ChartTheme) {
  const toneColor = change.tone === "good" ? theme.good : change.tone === "bad" ? theme.bad : theme.muted;
  // A seta também diz para onde foi: a informação não depende só da cor.
  const arrow = change.kind === "pct" && change.value !== 0 ? (change.value > 0 ? "▲ " : "▼ ") : "";
  return `<span style="color:${toneColor};font-weight:600">${arrow}${escapeHtml(formatChange(change))}</span>`;
}

/** Dica rica: o ponto por extenso, o valor de cada série e, com comparação, o valor de antes e a variação. */
export function tooltipHtml(spec: ChartSpec, theme: ChartTheme, index: number, visible: Set<string | undefined>): string {
  const category = spec.categories[index];
  if (!category) return "";
  const color = (i: number) => theme.palette[i % theme.palette.length] || theme.text;
  const fmt = (value: number | null | undefined, format: MetricFormat) => formatMetricValue(value, format, { currency: spec.currency });
  const parts: string[] = [`<div style="font-weight:600;margin-bottom:4px">${escapeHtml(category.longLabel)}</div>`];
  if (category.partial) {
    parts.push(
      `<div style="color:${theme.muted};font-size:11px;margin-bottom:4px">${escapeHtml(msg.partial.label)}: ${escapeHtml(msg.partial[category.partial])}</div>`,
    );
  }
  for (const s of spec.series) {
    if (!visible.has(s.name)) continue;
    const share = spec.stack === "percent" && s.absolute;
    const value = share ? `${fmt(s.values[index], "percent")} · ${fmt(s.absolute![index], s.format)}` : fmt(s.values[index], s.format);
    parts.push(
      `<div style="display:flex;justify-content:space-between;gap:16px;align-items:center">` +
        `<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${color(s.color)}"></span>${escapeHtml(s.name)}</span>` +
        `<span style="font-weight:600;font-variant-numeric:tabular-nums">${escapeHtml(value)}</span></div>`,
    );
    if (s.compare && spec.compareName) {
      const when = category.compareLabel ? `${spec.compareName}, ${category.compareLabel}` : spec.compareName;
      // Sem base de comparação (sem dado de um lado, ou os dois zerados), sem variação, como no Resumo.
      const change = s.compare.changes[index];
      const variation = change.kind === "none" ? "" : ` · ${changeHtml(change, theme)}`;
      parts.push(
        `<div style="color:${theme.muted};font-size:11px;padding-left:14px;margin-bottom:2px">` +
          `${escapeHtml(when)}: ${escapeHtml(fmt(s.compare.values[index], s.format))}${variation}</div>`,
      );
    }
  }
  return parts.join("");
}
