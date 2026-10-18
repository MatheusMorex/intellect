// Monta cada widget dos Painéis a partir da configuração (lib/charts/widgets.ts):
// cartões de KPI e gráficos de linhas, colunas e barras, no formato próprio de
// lib/charts/spec.ts. Todo número sai do serviço de cálculo (compute.ts) a
// partir das peças somadas (source.ts).
//
// As contas que vários widgets usam (a série do período, a da comparação, os
// totais, as linhas de cada dimensão) são feitas uma vez só por tela.

import { getMetric, metricComponents, type Dimension, type MetricDef, type MetricDirection, type MetricFormat, type MetricId } from "@/lib/charts/catalog";
import type { Change } from "@/lib/charts/format";
import { msg } from "@/lib/charts/messages";
import type { ChartCategory, ChartSeries, ChartSpec, ReferenceLine } from "@/lib/charts/spec";
import type { BarWidget, ColumnWidget, KpiWidget, LineWidget } from "@/lib/charts/widgets";
import type { MetricInfo } from "@/lib/metrics-glossary";
import {
  compareValues,
  metricSeries,
  metricValue,
  OTHERS_KEY,
  sumComponents,
  topN,
  totalComponents,
  zeroComponents,
  type BucketComponents,
  type Components,
  type Row,
} from "@/server/charts/compute";
import type { PanelQuery } from "@/server/charts/params";
import { componentsByBucket, componentsByDimension, componentsInRange, DAILY_ONLY, type PanelSource } from "@/server/charts/source";
import { listBuckets, type Bucket, type BucketOptions } from "@/server/charts/time-buckets";

// ---- contas compartilhadas da tela -------------------------------------------------------------

export function panelComputer(source: PanelSource, query: PanelQuery, now: Date) {
  const options: BucketOptions = { timezone: source.dashboard.timezone, weekStart: source.dashboard.weekStart, now };
  const memo = new Map<string, unknown>();
  const remember = <T>(key: string, fn: () => T): T => {
    if (!memo.has(key)) memo.set(key, fn());
    return memo.get(key) as T;
  };
  const compareRange = query.compareRange;

  const buckets = () => remember("buckets", () => listBuckets(query.period.range, query.granularity, options));
  const compareBuckets = () => (compareRange ? remember("compare-buckets", () => listBuckets(compareRange, query.granularity, options)) : null);

  return {
    source,
    query,
    options,
    buckets,
    compareBuckets,
    series: (): BucketComponents[] => remember("series", () => componentsByBucket(source, buckets(), query.granularity, options)),
    compareSeries: (): BucketComponents[] | null => {
      const list = compareBuckets();
      return list ? remember("compare-series", () => componentsByBucket(source, list, query.granularity, options)) : null;
    },
    totals: (): Components => remember("totals", () => componentsInRange(source, query.period.range)),
    compareTotals: (): Components | null => (compareRange ? remember("compare-totals", () => componentsInRange(source, compareRange)) : null),
    dimension: (d: Dimension): Row[] => remember(`dimension:${d}`, () => componentsByDimension(source, query.period.range, d)),
    compareDimension: (d: Dimension): Row[] | null =>
      compareRange ? remember(`compare-dimension:${d}`, () => componentsByDimension(source, compareRange, d)) : null,
  };
}

export type PanelComputer = ReturnType<typeof panelComputer>;

/** Nome curto da comparação, ou null sem comparação. */
function compareName(query: PanelQuery) {
  return query.compareMode !== "off" && query.compareRange ? msg.panel.compareSeries[query.compareMode] : null;
}

// ---- cartão de KPI -----------------------------------------------------------------------------

export type KpiView = {
  id: string;
  title: string;
  info: MetricInfo;
  format: MetricFormat;
  direction: MetricDirection;
  currency: string;
  value: number | null;
  /** Período escolhido ("Últimos 30 dias"). */
  periodLabel: string;
  compare: { value: number | null; change: Change; versus: string } | null;
  sparkline: { values: (number | null)[]; partial: boolean[]; label: string } | null;
  goal: { target: number; progress: number | null } | null;
  /** O limite de alerta passou (o cartão fica em alerta). */
  alert: { when: "below" | "above"; value: number } | null;
};

export function buildKpi(pc: PanelComputer, w: KpiWidget): KpiView {
  const def = getMetric(w.metric);
  const { query, source } = pc;
  const value = metricValue(def, pc.totals());
  const previous = pc.compareTotals();
  const compare =
    previous && query.compareMode !== "off"
      ? (() => {
          const before = metricValue(def, previous);
          return { value: before, change: compareValues(value, before, def.direction), versus: msg.panel.versus[query.compareMode] };
        })()
      : null;

  let sparkline: KpiView["sparkline"] = null;
  if (w.sparkline) {
    const values = metricSeries(pc.series(), def);
    if (values.length > 1 && values.some((v) => v != null)) {
      sparkline = {
        values,
        partial: pc.buckets().map((b) => b.partial === "ongoing"),
        label: msg.panel.kpi.trend(msg.granularity[query.granularity]),
      };
    }
  }

  const target = w.goal ? (w.goal.source === "dashboard" ? source.dashboard.revenueGoalCents : w.goal.value) : null;
  const goal = target && target > 0 ? { target, progress: value == null ? null : value / target } : null;

  const tripped = w.alert && value != null && (w.alert.when === "below" ? value < w.alert.value : value > w.alert.value);

  return {
    id: w.id,
    title: w.title || def.info.label,
    info: def.info,
    format: def.format,
    direction: def.direction,
    currency: source.dashboard.currency,
    value,
    periodLabel: query.period.label,
    compare,
    sparkline,
    goal,
    alert: tripped ? w.alert : null,
  };
}

// ---- avisos ------------------------------------------------------------------------------------

function notesFor(pc: PanelComputer, defs: MetricDef[], byDimension: Dimension | null): string[] {
  const notes: string[] = [];
  const uses = (ids: readonly string[]) => defs.some((d) => metricComponents(d).some((c) => ids.includes(c)));
  if (!byDimension && pc.query.granularity === "hour" && uses(DAILY_ONLY)) notes.push(msg.panel.notes.hourUnavailable);
  if (uses(["expensesCents"])) {
    if (byDimension) notes.push(msg.panel.notes.expensesByItem);
    else if (pc.source.filtered) notes.push(msg.panel.notes.expensesFiltered);
  }
  if (byDimension === "product") notes.push(msg.panel.notes.productRevenue);
  return notes;
}

const isEmpty = (series: ChartSeries[]) => series.every((s) => (s.absolute ?? s.values).every((v) => v == null || v === 0));

/** Por hora, um gráfico só de gasto, impostos ou despesas não tem o que mostrar: eles chegam por dia. */
function emptyReason(pc: PanelComputer, defs: MetricDef[], series: ChartSeries[]): ChartSpec["emptyReason"] {
  if (!isEmpty(series)) return null;
  const dailyOnly = defs.every((d) => metricComponents(d).some((c) => DAILY_ONLY.includes(c)));
  return pc.query.granularity === "hour" && dailyOnly ? "daily-only" : "no-data";
}

function compareOf(def: MetricDef, values: (number | null)[], before: (number | null)[]): ChartSeries["compare"] {
  return { values: before, changes: values.map((v, i) => compareValues(v, before[i] ?? null, def.direction)) };
}

// ---- linhas e colunas (eixo de tempo) ----------------------------------------------------------

type Entry = { metric: MetricId; axis: "left" | "right"; kind: "line" | "column" };

function categoriesOf(buckets: Bucket[], compare: Bucket[] | null): ChartCategory[] {
  return buckets.map((b, i) => ({
    key: b.key,
    label: b.label,
    longLabel: b.longLabel,
    partial: b.partial,
    compareLabel: compare?.[i]?.longLabel ?? null,
  }));
}

/** Linha de média: das somáveis, o total ÷ os períodos do gráfico; das taxas, a taxa do período inteiro (nunca a média das médias). */
function averageLine(def: MetricDef, rows: BucketComponents[], series: ChartSeries, granularityLabel: string): ReferenceLine | null {
  const total = metricValue(def, totalComponents(rows));
  if (total == null || rows.length === 0) return null;
  const value = def.kind === "sum" ? total / rows.length : total;
  return {
    kind: "average",
    axis: series.axis,
    value: def.format === "money" ? Math.round(value) : value,
    format: def.format,
    decimals: def.kind === "sum" && def.format === "number" ? 1 : undefined,
    label: def.kind === "sum" ? msg.panel.average.sum(granularityLabel) : msg.panel.average.rate,
    color: series.color,
  };
}

export function buildTimeChart(pc: PanelComputer, w: LineWidget | ColumnWidget): ChartSpec {
  const buckets = pc.buckets();
  const rows = pc.series();
  const compareBuckets = pc.compareBuckets();
  const compareRows = pc.compareSeries();
  const stack = w.type === "column" ? (w.mode === "grouped" ? "none" : w.mode) : "none";

  const entries: Entry[] =
    w.type === "line"
      ? w.series.map((s) => ({ metric: s.metric, axis: s.axis, kind: "line" }))
      : [
          ...w.series.map((s): Entry => ({ metric: s.metric, axis: "left", kind: "column" })),
          ...(w.line ? [{ metric: w.line.metric, axis: "right", kind: "line" } satisfies Entry] : []),
        ];
  const defs = entries.map((e) => getMetric(e.metric));

  const series: ChartSeries[] = entries.map((e, index) => {
    const def = defs[index];
    const values = metricSeries(rows, def);
    const before = compareRows ? buckets.map((_, i) => (compareRows[i] ? metricValue(def, compareRows[i].components) : null)) : null;
    return {
      id: e.metric,
      name: def.info.label,
      kind: e.kind,
      axis: e.axis,
      format: def.format,
      direction: def.direction,
      values,
      color: index,
      compare: before ? compareOf(def, values, before) : undefined,
    };
  });

  // Empilhado 100%: cada coluna vira a fatia do total daquele período; o valor de verdade fica em absolute.
  if (stack === "percent") {
    const columns = series.filter((s) => s.kind === "column");
    buckets.forEach((_, i) => {
      const total = columns.reduce((sum, s) => sum + (s.values[i] ?? 0), 0);
      for (const s of columns) {
        s.absolute ??= [...s.values];
        s.values[i] = total > 0 ? (s.absolute[i] ?? 0) / total : null;
      }
    });
  }

  const leftFormat = stack === "percent" ? "percent" : series.find((s) => s.axis === "left")!.format;
  const rightFormat = series.find((s) => s.axis === "right")?.format ?? null;

  const references: ReferenceLine[] = [];
  if (w.type === "line") {
    if (w.goal) {
      references.push({
        kind: "goal",
        axis: w.goal.axis,
        value: w.goal.value,
        format: w.goal.axis === "left" ? leftFormat : (rightFormat ?? leftFormat),
        label: msg.panel.goal,
        color: null,
      });
    }
    if (w.average) {
      series.forEach((s, i) => {
        const line = averageLine(defs[i], rows, s, msg.granularity[pc.query.granularity]);
        if (line) references.push(line);
      });
    }
  }

  const hasCompare = series.some((s) => s.compare);
  const reason = emptyReason(pc, defs, series);
  const notes = notesFor(pc, defs, null);
  if (stack === "percent") notes.push(msg.panel.notes.percent);
  if (stack !== "none" && hasCompare) notes.push(msg.panel.notes.stackedCompare);
  // Gráfico vazio por ser por hora: a mensagem no lugar do gráfico já explica tudo.
  if (reason === "daily-only") notes.length = 0;

  return {
    axis: "time",
    categories: categoriesOf(buckets, compareBuckets),
    series,
    axes: { left: leftFormat, right: rightFormat },
    stack,
    smooth: w.type === "line" && w.smooth,
    markers: w.type === "line" ? w.markers : true,
    area: w.type === "line" && w.area,
    labels: w.type === "column" && w.labels,
    zoom: w.type === "line" && w.zoom,
    drawCompare: hasCompare && w.compare && stack === "none",
    references,
    currency: pc.source.dashboard.currency,
    compareName: compareName(pc.query),
    notes,
    empty: reason != null,
    emptyReason: reason,
  };
}

// ---- barras (por dimensão) ---------------------------------------------------------------------

export function buildBarChart(pc: PanelComputer, w: BarWidget): ChartSpec {
  const defs = w.metrics.map((id) => getMetric(id));
  // Só os itens com dado no período: campanha parada não ocupa lugar no ranking, e a linha
  // "Sem campanha" não entra num ranking de ROAS (venda sem gasto não tem ROAS). Campanha
  // que gastou e não vendeu fica, com ROAS 0,00: é um dado, não a falta dele.
  const hasData = (def: MetricDef, c: Components) => metricValue(def, c) != null && metricComponents(def).some((k) => (c[k] ?? 0) !== 0);
  const rows = pc.dimension(w.dimension).filter((r) => defs.some((d) => hasData(d, r.components)));
  const ranked = topN(rows, defs[0], w.topN, w.order).filter((r) => w.others || r.key !== OTHERS_KEY);

  const compareRows = pc.compareDimension(w.dimension);
  const shownKeys = new Set(ranked.map((r) => r.key));
  const beforeOf = (row: Row): Components => {
    if (!compareRows) return zeroComponents();
    if (row.key === OTHERS_KEY) return sumComponents(compareRows.filter((r) => !shownKeys.has(r.key)).map((r) => r.components));
    return compareRows.find((r) => r.key === row.key)?.components ?? zeroComponents();
  };
  const before = ranked.map(beforeOf);

  const series: ChartSeries[] = defs.map((def, index) => {
    const values = ranked.map((r) => metricValue(def, r.components));
    return {
      id: def.id,
      name: def.info.label,
      kind: "bar",
      axis: "left",
      format: def.format,
      direction: def.direction,
      values,
      color: index,
      compare: compareRows ? compareOf(def, values, before.map((c) => metricValue(def, c))) : undefined,
    };
  });

  return {
    axis: "category",
    categories: ranked.map((r) => ({ key: r.key, label: r.label, longLabel: r.label, partial: null, compareLabel: null })),
    series,
    axes: { left: defs[0].format, right: null },
    stack: w.mode === "stacked" ? "stacked" : "none",
    smooth: false,
    markers: false,
    area: false,
    labels: w.labels,
    zoom: false,
    drawCompare: false,
    references: [],
    currency: pc.source.dashboard.currency,
    compareName: compareName(pc.query),
    notes: notesFor(pc, defs, w.dimension),
    empty: isEmpty(series),
    emptyReason: isEmpty(series) ? "no-data" : null,
  };
}
