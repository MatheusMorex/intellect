// Tradução do formato próprio dos gráficos (lib/charts/spec.ts) para a
// configuração do ECharts. É o único arquivo (com echarts-chart.tsx) que sabe
// que o ECharts existe: trocar de biblioteca é reescrever só estes dois.
//
// Função pura, sem navegador: os testes rodam com `npm test`.

import type {
  BarSeriesOption,
  CustomSeriesOption,
  CustomSeriesRenderItem,
  EChartsOption,
  FunnelSeriesOption,
  LineSeriesOption,
  PieSeriesOption,
  TreemapSeriesOption,
} from "echarts";

import type { MetricFormat } from "@/lib/charts/catalog";
import { formatChange, formatMetricValue, type Change } from "@/lib/charts/format";
import { msg } from "@/lib/charts/messages";
import type {
  ChartCategory,
  ChartSeries,
  ChartSpec,
  FunnelSpec,
  FunnelStep,
  GanttSpec,
  GanttTask,
  PanelChartSpec,
  PieSlice,
  PieSpec,
  ReferenceLine,
  SpecCompare,
  TreemapNode,
  TreemapSpec,
} from "@/lib/charts/spec";

import { colorScale, scalePosition } from "./color-scale";
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

/** Configuração do ECharts para qualquer gráfico dos Painéis. */
export function toEChartsOption(spec: PanelChartSpec, theme: ChartTheme, options: Options): EChartsOption {
  if (spec.kind === "pie") return pieOption(spec, theme, options);
  if (spec.kind === "treemap") return treemapOption(spec, theme, options);
  if (spec.kind === "funnel") return funnelOption(spec, theme, options);
  if (spec.kind === "gantt") return ganttOption(spec, theme, options);
  return axisOption(spec, theme, options);
}

/** Caixa da dica, igual em todos os gráficos. */
function tooltipBox(theme: ChartTheme) {
  return {
    confine: true,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: theme.text, fontSize: 12 },
    extraCssText: "border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.25); max-width: 360px; white-space: normal;",
  };
}

/** Padrões no modo para daltônicos: a parte não depende só da cor. */
const ariaOf = (theme: ChartTheme) => ({ enabled: theme.colorblind, label: { enabled: false }, decal: { show: theme.colorblind } });

function axisOption(spec: ChartSpec, theme: ChartTheme, { reducedMotion }: Options): EChartsOption {
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
    aria: ariaOf(theme),
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
      ...tooltipBox(theme),
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

// ---- pizza e rosca ------------------------------------------------------------------------------

const sliceColor = (slice: PieSlice, theme: ChartTheme) =>
  slice.color == null ? theme.muted : theme.palette[slice.color % theme.palette.length] || theme.text;

function pieOption(spec: PieSpec, theme: ChartTheme, { reducedMotion }: Options): EChartsOption {
  const compact = (value: number) => formatMetricValue(value, spec.metric.format, { currency: spec.currency, style: "compact" });
  const share = (value: number) => formatMetricValue(value, "percent", { currency: spec.currency });
  const labelOf = (slice: PieSlice) =>
    spec.labels === "value" ? compact(slice.value) : spec.labels === "percent" ? share(slice.share) : `${compact(slice.value)} · ${share(slice.share)}`;

  const series: PieSeriesOption = {
    type: "pie",
    id: spec.metric.id,
    name: spec.metric.name,
    // O centro da pizza é o centro do gráfico: o total da rosca (title) fica certinho no meio.
    radius: spec.donut ? ["46%", "68%"] : [0, "68%"],
    center: ["50%", "50%"],
    avoidLabelOverlap: true,
    itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: spec.donut ? 4 : 0 },
    label: {
      show: true,
      color: theme.text,
      fontSize: 11,
      lineHeight: 14,
      width: 120,
      overflow: "truncate",
      // O nome no rótulo: a fatia não depende só da cor.
      formatter: (p) => {
        const slice = spec.slices[p.dataIndex];
        return slice ? `${slice.label}\n${labelOf(slice)}` : "";
      },
    },
    labelLine: { length: 8, length2: 6, lineStyle: { color: theme.border } },
    emphasis: { scaleSize: 4 },
    data: spec.slices.map((slice) => ({ name: slice.label, value: slice.value, itemStyle: { color: sliceColor(slice, theme) } })),
  };

  return {
    backgroundColor: "transparent",
    animation: !reducedMotion,
    animationDuration: 300,
    textStyle: { fontFamily: theme.font },
    aria: ariaOf(theme),
    // No celular: pizza menor, rótulo só com o nome e o percentual (cabe na tela) e sem a
    // legenda embaixo (o nome já está no rótulo). O valor fica na dica e na tabela.
    media: [
      {
        query: { maxWidth: 480 },
        option: {
          legend: { show: false },
          title: spec.donut ? { textStyle: { fontSize: 15 } } : undefined,
          series: [
            {
              radius: spec.donut ? ["36%", "54%"] : [0, "54%"],
              label: {
                width: 88,
                formatter: (p: { dataIndex: number }) => {
                  const slice = spec.slices[p.dataIndex];
                  return slice ? `${slice.label}\n${share(slice.share)}` : "";
                },
              },
              labelLine: { length: 6, length2: 4 },
            },
          ],
        },
      },
    ],
    title: spec.donut
      ? {
          text: compact(spec.total),
          subtext: msg.panel.pie.total,
          left: "center",
          top: "middle",
          itemGap: 2,
          textStyle: { color: theme.text, fontSize: 18, fontWeight: 700, fontFamily: theme.font },
          subtextStyle: { color: theme.muted, fontSize: 11, fontFamily: theme.font },
        }
      : undefined,
    legend: {
      type: "scroll",
      bottom: 0,
      left: "center",
      data: spec.slices.map((s) => s.label),
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: theme.muted },
      pageTextStyle: { color: theme.muted },
    },
    tooltip: {
      trigger: "item",
      ...tooltipBox(theme),
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        return p?.dataIndex == null ? "" : pieTooltipHtml(spec, theme, p.dataIndex);
      },
    },
    series: [series],
  };
}

function compareLineHtml(spec: { compareName: string | null; currency: string }, compare: SpecCompare, format: MetricFormat, theme: ChartTheme) {
  if (!spec.compareName) return "";
  const value = formatMetricValue(compare.value, format, { currency: spec.currency });
  const variation = compare.change.kind === "none" ? "" : ` · ${changeHtml(compare.change, theme)}`;
  return `<div style="color:${theme.muted};font-size:11px;margin-top:2px">${escapeHtml(spec.compareName)}: ${escapeHtml(value)}${variation}</div>`;
}

/** Dica da fatia: o nome, o valor, quanto é do total e, com comparação, o valor de antes e a variação. */
export function pieTooltipHtml(spec: PieSpec, theme: ChartTheme, index: number): string {
  const slice = spec.slices[index];
  if (!slice) return "";
  const value = formatMetricValue(slice.value, spec.metric.format, { currency: spec.currency });
  const share = formatMetricValue(slice.share, "percent", { currency: spec.currency });
  return (
    `<div style="font-weight:600;margin-bottom:4px">` +
    `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${sliceColor(slice, theme)}"></span>${escapeHtml(slice.label)}</div>` +
    `<div style="display:flex;justify-content:space-between;gap:16px"><span>${escapeHtml(spec.metric.name)}</span>` +
    `<span style="font-weight:600;font-variant-numeric:tabular-nums">${escapeHtml(value)}</span></div>` +
    `<div style="color:${theme.muted};font-size:11px">${escapeHtml(msg.panel.pie.share(share))}</div>` +
    (slice.compare ? compareLineHtml(spec, slice.compare, spec.metric.format, theme) : "")
  );
}

// ---- treemap ------------------------------------------------------------------------------------

/** Cor de cada retângulo: pela métrica da cor (escala), ou pela posição entre os irmãos (paleta). */
export function treemapColors(spec: TreemapSpec, theme: ChartTheme): Map<string, string> {
  const colors = new Map<string, string>();
  const scale = spec.color ? colorScale(theme, spec.color.direction) : null;
  const walk = (nodes: TreemapNode[]) =>
    nodes.forEach((node, i) => {
      if (spec.color && scale) {
        colors.set(node.key, node.color == null ? theme.muted : scale(scalePosition(node.color, spec.color.min, spec.color.mid, spec.color.max)));
      }
      else colors.set(node.key, node.others ? theme.muted : theme.palette[i % theme.palette.length] || theme.text);
      walk(node.children);
    });
  walk(spec.nodes);
  return colors;
}

type TreemapData = NonNullable<TreemapSeriesOption["data"]>[number];

function treemapOption(spec: TreemapSpec, theme: ChartTheme, { reducedMotion }: Options): EChartsOption {
  const colors = treemapColors(spec, theme);
  const byKey = new Map<string, TreemapNode>();
  const compact = (value: number) => formatMetricValue(value, spec.size.format, { currency: spec.currency, style: "compact" });
  // O valor da cor escrito no retângulo: a cor nunca é a única informação.
  const colorText = (node: TreemapNode) => (spec.color ? ` · ${formatMetricValue(node.color, spec.color.format, { currency: spec.currency })}` : "");
  const toData = (nodes: TreemapNode[]): TreemapData[] =>
    nodes.map((node) => {
      byKey.set(node.key, node);
      return {
        id: node.key,
        name: node.label,
        value: node.size,
        itemStyle: { color: colors.get(node.key) },
        children: node.children.length ? toData(node.children) : undefined,
      };
    });
  const data = toData(spec.nodes);

  const series: TreemapSeriesOption = {
    type: "treemap",
    id: spec.size.id,
    // Primeiro item do caminho embaixo do gráfico: clicar nele volta para o começo.
    name: msg.panel.treemap.root,
    data,
    // Um nível por vez: clicar num retângulo com ▶ mostra o que tem dentro (os do último nível não fazem nada).
    leafDepth: 1,
    nodeClick: "link",
    drillDownIcon: "▶",
    roam: false,
    top: 0,
    left: 0,
    right: 0,
    bottom: 30,
    // Com a animação desligada, o ECharts 6 não redesenha o treemap depois de abrir um nível
    // (fica em branco). Com "reduzir movimento", a animação dura 1 ms: ninguém vê, e funciona.
    animation: true,
    animationDuration: reducedMotion ? 1 : 300,
    animationDurationUpdate: reducedMotion ? 1 : 400,
    breadcrumb: {
      show: true,
      left: 0,
      bottom: 0,
      height: 22,
      itemStyle: { color: theme.surface, borderColor: theme.border, borderWidth: 1, textStyle: { color: theme.text } },
      emphasis: { itemStyle: { color: theme.border, textStyle: { color: theme.text } } },
    },
    label: {
      show: true,
      fontSize: 12,
      lineHeight: 15,
      color: "#ffffff",
      textBorderColor: "rgba(0,0,0,0.55)",
      textBorderWidth: 2,
      overflow: "truncate",
      formatter: (p) => {
        const node = byKey.get(String((p.data as { id?: string } | undefined)?.id));
        return node ? `${p.name}\n${compact(node.size)}${colorText(node)}` : String(p.name);
      },
    },
    upperLabel: { show: false },
    // O fundo de quem tem filhos é pintado com borderColor (aparece nos vãos): sem destaque ao passar
    // o mouse, senão os vãos ficam claros em volta de tudo. A dica já mostra qual é o retângulo.
    itemStyle: { borderColor: theme.surface, borderWidth: 2, gapWidth: 2 },
    emphasis: { disabled: true },
  };

  return {
    backgroundColor: "transparent",
    animation: true,
    textStyle: { fontFamily: theme.font },
    aria: ariaOf(theme),
    tooltip: {
      trigger: "item",
      ...tooltipBox(theme),
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        const node = byKey.get(String((p?.data as { id?: string } | undefined)?.id));
        return node ? treemapTooltipHtml(spec, theme, node) : "";
      },
    },
    series: [series],
  };
}

/** Dica do retângulo: o caminho, o tamanho (e quanto é do total), a métrica da cor e a comparação. */
export function treemapTooltipHtml(spec: TreemapSpec, theme: ChartTheme, node: TreemapNode): string {
  const fmt = (value: number | null, format: MetricFormat) => formatMetricValue(value, format, { currency: spec.currency });
  const row = (name: string, value: string) =>
    `<div style="display:flex;justify-content:space-between;gap:16px"><span>${escapeHtml(name)}</span>` +
    `<span style="font-weight:600;font-variant-numeric:tabular-nums">${escapeHtml(value)}</span></div>`;
  const parts = [`<div style="font-weight:600;margin-bottom:4px">${escapeHtml(node.path.join(" › "))}</div>`, row(spec.size.name, fmt(node.size, spec.size.format))];
  parts.push(`<div style="color:${theme.muted};font-size:11px">${escapeHtml(msg.panel.pie.share(fmt(node.share, "percent")))}</div>`);
  if (node.compare) parts.push(compareLineHtml(spec, node.compare.size, spec.size.format, theme));
  if (spec.color) {
    parts.push(`<div style="margin-top:6px"></div>`, row(spec.color.name, fmt(node.color, spec.color.format)));
    if (node.compare?.color) parts.push(compareLineHtml(spec, node.compare.color, spec.color.format, theme));
  }
  const next = spec.levels[node.path.length];
  if (node.children.length && next) parts.push(`<div style="color:${theme.muted};font-size:11px;margin-top:6px">${escapeHtml(msg.panel.treemap.open(next))}</div>`);
  return parts.join("");
}

// ---- funil --------------------------------------------------------------------------------------

const stepColor = (index: number, theme: ChartTheme) => theme.palette[index % theme.palette.length] || theme.text;

/** O texto ao lado de cada etapa: a quantidade e quanto ela é da anterior (a primeira é o topo). */
export function funnelStepText(spec: FunnelSpec, step: FunnelStep, index: number): string {
  const count = formatMetricValue(step.value, "number", { currency: spec.currency });
  if (index === 0) return `${count} · ${msg.panel.funnel.top}`;
  if (step.fromPrevious == null) return count;
  return `${count} · ${msg.panel.funnel.fromPrevious(formatMetricValue(step.fromPrevious, "percent", { currency: spec.currency }))}`;
}

function funnelOption(spec: FunnelSpec, theme: ChartTheme, { reducedMotion }: Options): EChartsOption {
  const series: FunnelSeriesOption = {
    type: "funnel",
    id: "funil",
    // Na ordem das etapas, não pelo tamanho.
    sort: "none",
    // A largura de cada etapa vai de 0 até o topo (o padrão do ECharts é de 0 a 100).
    min: 0,
    max: Math.max(1, ...spec.steps.map((s) => s.value)),
    // Etapa pequena (vendas perto de impressões) ainda aparece; o número está no rótulo.
    minSize: "14%",
    maxSize: "100%",
    left: 0,
    top: 8,
    bottom: 8,
    width: "50%",
    gap: 3,
    label: {
      show: true,
      position: "right",
      color: theme.text,
      fontSize: 11,
      lineHeight: 15,
      formatter: (p) => {
        const step = spec.steps[p.dataIndex];
        if (!step) return "";
        // A maior perda também vai escrita: a informação não depende só da cor.
        const loss = step.biggestLoss ? `\n{loss|▼ ${msg.panel.funnel.biggestLoss}}` : "";
        return `{name|${step.label}}\n${funnelStepText(spec, step, p.dataIndex)}${loss}`;
      },
      rich: {
        name: { fontWeight: 600, color: theme.text, fontSize: 12, lineHeight: 16 },
        loss: { fontWeight: 600, color: theme.bad, fontSize: 11, lineHeight: 15 },
      },
    },
    labelLine: { show: true, length: 10, lineStyle: { color: theme.border } },
    // Todos os rótulos numa coluna logo à direita do funil (que ocupa a metade esquerda): o da
    // etapa larga não fica por cima dela. A linha liga cada etapa ao seu rótulo.
    labelLayout: { x: "53%", align: "left" },
    emphasis: { label: { fontSize: 12 } },
    data: spec.steps.map((step, i) => ({
      name: step.label,
      value: step.value,
      itemStyle: {
        color: stepColor(i, theme),
        borderColor: step.biggestLoss ? theme.bad : theme.surface,
        borderWidth: step.biggestLoss ? 3 : 1,
      },
    })),
  };
  return {
    backgroundColor: "transparent",
    animation: !reducedMotion,
    animationDuration: 300,
    textStyle: { fontFamily: theme.font },
    aria: ariaOf(theme),
    // No celular: funil mais estreito e rótulo menor, para caber ao lado.
    media: [{ query: { maxWidth: 480 }, option: { series: [{ width: "40%", labelLayout: { x: "43%", align: "left" }, label: { fontSize: 10 } }] } }],
    tooltip: {
      trigger: "item",
      ...tooltipBox(theme),
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        return p?.dataIndex == null ? "" : funnelTooltipHtml(spec, theme, p.dataIndex);
      },
    },
    series: [series],
  };
}

/** Dica da etapa: a quantidade, quanto é da anterior e do topo e, com comparação, o valor de antes. */
export function funnelTooltipHtml(spec: FunnelSpec, theme: ChartTheme, index: number): string {
  const step = spec.steps[index];
  if (!step) return "";
  const pct = (value: number) => formatMetricValue(value, "percent", { currency: spec.currency });
  const parts = [
    `<div style="font-weight:600;margin-bottom:4px">` +
      `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${stepColor(index, theme)}"></span>${escapeHtml(step.label)}</div>`,
    `<div style="font-weight:600;font-variant-numeric:tabular-nums">${escapeHtml(formatMetricValue(step.value, "number", { currency: spec.currency }))}</div>`,
  ];
  const ratios = [
    step.fromPrevious != null ? msg.panel.funnel.fromPrevious(pct(step.fromPrevious)) : null,
    index > 0 && step.fromTop != null ? msg.panel.funnel.fromTop(pct(step.fromTop)) : null,
  ].filter(Boolean);
  if (ratios.length) parts.push(`<div style="color:${theme.muted};font-size:11px">${escapeHtml(ratios.join(" · "))}</div>`);
  if (step.biggestLoss) parts.push(`<div style="color:${theme.bad};font-size:11px;font-weight:600">▼ ${escapeHtml(msg.panel.funnel.biggestLoss)}</div>`);
  if (step.compare) parts.push(compareLineHtml(spec, step.compare, "number", theme));
  return parts.join("");
}

// ---- Gantt --------------------------------------------------------------------------------------

const DAY = 86_400_000;
/** Quanto do tempo aparece de uma vez em cada escala (o resto, arrastando ou pelo controle embaixo). */
export const GANTT_SPAN: Record<GanttSpec["scale"], number> = { day: 21 * DAY, week: 12 * 7 * DAY, month: 365 * DAY };
/** Altura de cada linha do Gantt, em pixels. */
export const GANTT_ROW = 28;

export type GanttRow = { kind: "group"; label: string } | { kind: "task"; task: GanttTask };

/** As linhas de cima para baixo: o nome do grupo e as tarefas dele. */
export function ganttRows(spec: GanttSpec): GanttRow[] {
  return spec.groups.flatMap((g): GanttRow[] => [{ kind: "group", label: g.label }, ...g.tasks.map((task): GanttRow => ({ kind: "task", task }))]);
}

export const ganttColor = (task: GanttTask, theme: ChartTheme) =>
  task.color == null ? theme.muted : theme.palette[task.color % theme.palette.length] || theme.text;

/** Marca na frente do nome: atrasada e concluída não dependem só da cor. */
export const ganttMark = (task: GanttTask) => (task.overdue ? "⚠ " : task.done ? "✓ " : "");

/** Data no fuso do dashboard, no formato da escala ("19/10", "19 de out.", "out. de 2026"). */
export function ganttDate(ms: number, timezone: string, style: "axis-day" | "axis-week" | "axis-month" | "long"): string {
  const options: Intl.DateTimeFormatOptions =
    style === "axis-day"
      ? { day: "2-digit", month: "2-digit" }
      : style === "axis-week"
        ? { day: "numeric", month: "short" }
        : style === "axis-month"
          ? { month: "short", year: "numeric" }
          : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat(msg.locale, { ...options, timeZone: timezone }).format(new Date(ms));
}

function ganttOption(spec: GanttSpec, theme: ChartTheme, { reducedMotion }: Options): EChartsOption {
  const rows = ganttRows(spec);
  const tasks = rows.flatMap((row, index) => (row.kind === "task" ? [{ index, task: row.task }] : []));
  const span = GANTT_SPAN[spec.scale];
  const zoom = spec.to - spec.from > span;
  // Começa mostrando um pouco antes de hoje e o que vem depois.
  const startValue = Math.max(spec.from, Math.min(spec.now - span * 0.3, spec.to - span));
  const axisStyle = spec.scale === "day" ? "axis-day" : spec.scale === "week" ? "axis-week" : "axis-month";

  const renderItem: CustomSeriesRenderItem = (params, api) => {
    const task = tasks[params.dataIndex]?.task;
    if (!task) return null;
    const row = Number(api.value(0));
    const end = api.coord([Number(api.value(2)), row]);
    const height = (api.size?.([0, 1]) as number[])[1] * 0.56;
    const color = ganttColor(task, theme);
    const outline = task.overdue ? theme.bad : color;
    if (task.start == null) {
      // Marco: só a data de entrega, um losango.
      const r = height * 0.6;
      return {
        type: "polygon",
        shape: { points: [[end[0], end[1] - r], [end[0] + r, end[1]], [end[0], end[1] + r], [end[0] - r, end[1]]] },
        style: { fill: color, stroke: task.overdue ? theme.bad : theme.surface, lineWidth: task.overdue ? 2 : 1, opacity: task.done ? 0.55 : 1 },
      };
    }
    const start = api.coord([task.start, row]);
    const width = Math.max(end[0] - start[0], 3);
    const y = end[1] - height / 2;
    return {
      type: "group",
      children: [
        // O trilho (o prazo inteiro), mais claro; por cima, a parte concluída.
        { type: "rect", shape: { x: start[0], y, width, height, r: 3 }, style: { fill: color, opacity: task.done ? 0.3 : 0.28 } },
        { type: "rect", shape: { x: start[0], y, width: width * task.progress, height, r: 3 }, style: { fill: color, opacity: task.done ? 0.55 : 1 } },
        { type: "rect", shape: { x: start[0], y, width, height, r: 3 }, style: { fill: "none", stroke: outline, lineWidth: task.overdue ? 2 : 1 } },
      ],
    };
  };

  const series: CustomSeriesOption = {
    type: "custom",
    id: "gantt",
    renderItem,
    clip: true,
    cursor: "pointer",
    encode: { x: [1, 2], y: 0 },
    data: tasks.map(({ index, task }) => ({ value: [index, task.start ?? task.end, task.end], href: task.href })),
    markLine: {
      silent: true,
      symbol: "none",
      lineStyle: { color: theme.text, type: "dashed", width: 1, opacity: 0.7 },
      label: {
        formatter: msg.panel.gantt.today,
        // Embaixo da linha: em cima ela cobriria as datas do eixo.
        position: "end",
        color: theme.text,
        fontSize: 11,
        backgroundColor: theme.surface,
        padding: [1, 4],
        borderRadius: 3,
      },
      data: [{ xAxis: spec.now }],
    },
  };

  return {
    backgroundColor: "transparent",
    animation: !reducedMotion,
    animationDuration: 300,
    textStyle: { fontFamily: theme.font },
    grid: { left: 8, right: 16, top: 28, bottom: zoom ? 44 : 8 },
    // No celular: nomes das tarefas mais curtos, para sobrar espaço para as barras.
    media: [{ query: { maxWidth: 480 }, option: { yAxis: { axisLabel: { width: 96 } } } }],
    xAxis: {
      type: "time",
      position: "top",
      min: spec.from,
      max: spec.to,
      minInterval: spec.scale === "day" ? DAY : spec.scale === "week" ? 7 * DAY : 28 * DAY,
      axisLabel: { color: theme.muted, hideOverlap: true, formatter: (value: number) => ganttDate(value, spec.timezone, axisStyle) },
      axisLine: { lineStyle: { color: theme.border } },
      splitLine: { show: true, lineStyle: { color: theme.border, type: "dashed" } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: rows.map((row) =>
        row.kind === "group"
          ? { value: row.label, textStyle: { color: theme.text, fontWeight: "bold" } }
          : { value: `${ganttMark(row.task)}${row.task.label}`, textStyle: { color: row.task.overdue ? theme.bad : theme.muted } },
      ),
      axisLabel: { width: 230, overflow: "truncate", fontSize: 11 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: theme.border } },
      splitLine: { show: false },
    },
    dataZoom: zoom
      ? [
          // filterMode "none": a barra que começa fora da janela continua aparecendo (cortada na borda).
          {
            type: "inside",
            xAxisIndex: 0,
            filterMode: "none",
            startValue,
            endValue: startValue + span,
            zoomOnMouseWheel: "shift",
            moveOnMouseWheel: false,
            moveOnMouseMove: true,
          },
          {
            type: "slider",
            xAxisIndex: 0,
            filterMode: "none",
            startValue,
            endValue: startValue + span,
            height: 18,
            bottom: 8,
            borderColor: theme.border,
            textStyle: { color: theme.muted },
            labelFormatter: (value: number) => ganttDate(value, spec.timezone, "axis-week"),
            fillerColor: "rgba(127,127,127,0.15)",
            showDataShadow: false,
          },
        ]
      : undefined,
    tooltip: {
      trigger: "item",
      ...tooltipBox(theme),
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        const task = p?.dataIndex == null ? undefined : tasks[p.dataIndex]?.task;
        return task ? ganttTooltipHtml(spec, theme, task) : "";
      },
    },
    series: [series],
  };
}

/** Situação da tarefa, por extenso. */
export const ganttStatus = (task: GanttTask) => (task.done ? msg.panel.gantt.done : task.overdue ? msg.panel.gantt.overdue : msg.panel.gantt.onTime);

/** Dica da tarefa: o nome, onde está, quem faz, quando, quanto já foi feito e a situação. */
export function ganttTooltipHtml(spec: GanttSpec, theme: ChartTheme, task: GanttTask): string {
  const when =
    task.start == null
      ? `${msg.panel.gantt.milestone}: ${ganttDate(task.end, spec.timezone, "long")}`
      : `${ganttDate(task.start, spec.timezone, "long")} → ${ganttDate(task.end, spec.timezone, "long")}`;
  const statusColor = task.overdue ? theme.bad : task.done ? theme.good : theme.muted;
  const parts = [
    `<div style="font-weight:600;margin-bottom:2px">${escapeHtml(task.label)}</div>`,
    `<div style="color:${theme.muted};font-size:11px;margin-bottom:4px">${escapeHtml(`${task.board} › ${task.list}`)}</div>`,
    `<div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${ganttColor(task, theme)}"></span>${escapeHtml(task.people)}</div>`,
    `<div style="font-variant-numeric:tabular-nums">${escapeHtml(when)}</div>`,
    `<div>${escapeHtml(msg.panel.gantt.progress(formatMetricValue(task.progress, "percent", { currency: "BRL", decimals: 0 })))}` +
      (task.checklist ? ` <span style="color:${theme.muted}">(${escapeHtml(msg.panel.gantt.checklist(task.checklist.done, task.checklist.total))})</span>` : "") +
      `</div>`,
    `<div style="color:${statusColor};font-weight:600">${escapeHtml(`${ganttMark(task)}${ganttStatus(task)}`)}</div>`,
    `<div style="color:${theme.muted};font-size:11px;margin-top:4px">${escapeHtml(msg.panel.gantt.open)}</div>`,
  ];
  return parts.join("");
}
