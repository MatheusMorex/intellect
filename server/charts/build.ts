// Monta cada widget dos Painéis a partir da configuração (lib/charts/widgets.ts):
// cartões de KPI e gráficos de linhas, colunas, barras, pizza, rosca, treemap,
// funil e Gantt, no formato próprio de lib/charts/spec.ts. Todo número sai do serviço de cálculo (compute.ts) a
// partir das peças somadas (source.ts).
//
// As contas que vários widgets usam (a série do período, a da comparação, os
// totais, as linhas de cada dimensão) são feitas uma vez só por tela.

import { TZDate } from "@date-fns/tz";

import {
  COMPONENT_ORIGIN,
  getMetric,
  metricComponents,
  type Dimension,
  type MetricDef,
  type MetricDirection,
  type MetricFormat,
  type MetricId,
} from "@/lib/charts/catalog";
import type { Change } from "@/lib/charts/format";
import { msg } from "@/lib/charts/messages";
import type {
  ChartCategory,
  ChartSeries,
  ChartSpec,
  FunnelSpec,
  FunnelStep,
  GanttSpec,
  GanttTask,
  PieSpec,
  ReferenceLine,
  SpecCompare,
  SpecMetric,
  TreemapNode,
  TreemapSpec,
} from "@/lib/charts/spec";
import type { BarWidget, ColumnWidget, FunnelWidget, GanttWidget, KpiWidget, LineWidget, PieWidget, TreemapWidget } from "@/lib/charts/widgets";
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
import { boardLists, ganttCards, kanbanFunnelCounts, type GanttCard } from "@/server/charts/kanban";
import type { PanelQuery } from "@/server/charts/params";
import {
  componentsByBucket,
  componentsByDimension,
  componentsByPath,
  componentsInRange,
  DAILY_ONLY,
  PATH_SEPARATOR,
  type PanelSource,
  type PathRow,
} from "@/server/charts/source";
import { listBuckets, type Bucket, type BucketOptions } from "@/server/charts/time-buckets";
import type { DateRange } from "@/server/period";

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
    paths: (levels: Dimension[]): PathRow[] => remember(`paths:${levels.join(">")}`, () => pathRows(source, query.period.range, levels)),
    comparePaths: (levels: Dimension[]): PathRow[] | null =>
      compareRange ? remember(`compare-paths:${levels.join(">")}`, () => pathRows(source, compareRange, levels)) : null,
  };
}

/** Linhas com o caminho de níveis. Produto (que no treemap só vai sozinho) vem das linhas por produto. */
function pathRows(source: PanelSource, range: DateRange, levels: Dimension[]): PathRow[] {
  if (levels.includes("product")) {
    return componentsByDimension(source, range, "product").map((r) => ({ ...r, path: [{ key: r.key, label: r.label }] }));
  }
  return componentsByPath(source, range, levels as Exclude<Dimension, "product">[]);
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
  /** Número completo ou abreviado e casas decimais (aparência escolhida no editor). */
  display?: { numbers: "auto" | "full" | "compact"; decimals: number | null };
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
    kind: "axis",
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
    kind: "axis",
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

// ---- pizza e rosca -----------------------------------------------------------------------------

const specMetric = (def: MetricDef): SpecMetric => ({ id: def.id, name: def.info.label, format: def.format, direction: def.direction });

const compareOne = (def: MetricDef, now: number | null, before: number | null): SpecCompare => ({
  value: before,
  change: compareValues(now, before, def.direction),
});

/**
 * Pizza e rosca: cada item da dimensão é uma fatia do total. Até `slices`
 * fatias, contando "Outros": com mais itens, os menores se juntam em "Outros".
 * Entram as vendas sem campanha ou sem UTM, para a soma das fatias ser o total.
 */
export function buildPieChart(pc: PanelComputer, w: PieWidget): PieSpec {
  const def = getMetric(w.metric);
  const scored = pc.dimension(w.dimension).map((row) => ({ row, value: metricValue(def, row.components) }));
  // A configuração já recusa métricas que ficam negativas; isto só protege o desenho.
  const negatives = scored.filter((s) => s.value != null && s.value < 0).length;
  const rows = scored.filter((s) => s.value != null && s.value > 0).map((s) => s.row);
  const ranked = rows.length > w.slices ? topN(rows, def, w.slices - 1) : topN(rows, def, Math.max(1, rows.length));
  const values = ranked.map((r) => metricValue(def, r.components) ?? 0);
  const total = values.reduce((a, b) => a + b, 0);

  const compareRows = pc.compareDimension(w.dimension);
  const shownKeys = new Set(ranked.map((r) => r.key));
  const beforeOf = (row: Row, list: Row[]): number | null => {
    if (row.key === OTHERS_KEY) return metricValue(def, sumComponents(list.filter((r) => !shownKeys.has(r.key)).map((r) => r.components)));
    return metricValue(def, list.find((r) => r.key === row.key)?.components ?? zeroComponents());
  };

  let color = 0;
  const notes = notesFor(pc, [def], w.dimension);
  if (negatives > 0) notes.push(msg.panel.notes.proportionNegative(negatives));
  return {
    kind: "pie",
    donut: w.type === "donut",
    metric: specMetric(def),
    slices: ranked.map((r, i) => ({
      key: r.key,
      label: r.label,
      value: values[i],
      share: total > 0 ? values[i] / total : 0,
      color: r.key === OTHERS_KEY ? null : color++,
      compare: compareRows ? compareOne(def, values[i], beforeOf(r, compareRows)) : null,
    })),
    total,
    compareTotal: compareRows ? compareOne(def, total, metricValue(def, sumComponents(compareRows.map((r) => r.components)))) : null,
    labels: w.labels,
    currency: pc.source.dashboard.currency,
    compareName: compareName(pc.query),
    notes,
    empty: total === 0,
    emptyReason: total === 0 ? "no-data" : null,
  };
}

// ---- treemap -----------------------------------------------------------------------------------

type TreemapGroup = Row & { rows: PathRow[]; compareRows: PathRow[] | null };

/** Junta as linhas pelo item do nível `depth` (as campanhas da Meta, os anúncios de uma campanha). */
function groupByLevel(rows: PathRow[], compareRows: PathRow[] | null, depth: number): TreemapGroup[] {
  const groups = new Map<string, TreemapGroup>();
  for (const r of rows) {
    const step = r.path[depth];
    let g = groups.get(step.key);
    if (!g) groups.set(step.key, (g = { key: step.key, label: step.label, rows: [], compareRows: compareRows ? [] : null, components: zeroComponents() }));
    g.rows.push(r);
  }
  for (const r of compareRows ?? []) groups.get(r.path[depth].key)?.compareRows?.push(r);
  for (const g of groups.values()) g.components = sumComponents(g.rows.map((r) => r.components));
  return [...groups.values()];
}

/**
 * Treemap: cada nível agrupa as linhas pelo item daquele nível (Meta → as
 * campanhas da Meta → os anúncios de cada campanha). O tamanho de cada
 * retângulo é a métrica somada das linhas de dentro; a cor, a segunda métrica
 * refeita das peças somadas (o ROAS da campanha é o faturamento dela ÷ o gasto
 * dela, nunca a média dos ROAS dos anúncios). Em cada nível ficam os `topN`
 * maiores; o resto vira "Outros". Item com tamanho zero não ocupa espaço.
 */
export function buildTreemap(pc: PanelComputer, w: TreemapWidget): TreemapSpec {
  const sizeDef = getMetric(w.size);
  const colorDef = w.color ? getMetric(w.color) : null;
  const leaves = pc.paths(w.levels);
  const compareLeaves = pc.comparePaths(w.levels);

  const compareOf = (now: Components, before: Components | null): TreemapNode["compare"] => {
    if (!before) return null;
    return {
      size: compareOne(sizeDef, metricValue(sizeDef, now), metricValue(sizeDef, before)),
      color: colorDef ? compareOne(colorDef, metricValue(colorDef, now), metricValue(colorDef, before)) : null,
    };
  };

  const build = (rows: PathRow[], compareRows: PathRow[] | null, depth: number, keys: string[], labels: string[]): TreemapNode[] => {
    const groups = groupByLevel(rows, compareRows, depth).filter((g) => (metricValue(sizeDef, g.components) ?? 0) > 0);
    const byKey = new Map(groups.map((g) => [g.key, g]));
    const ranked = topN(groups, sizeDef, w.topN);
    const shown = new Set(ranked.map((r) => r.key));
    return ranked.map((r) => {
      const group = byKey.get(r.key);
      const path = [...keys, r.key];
      const names = [...labels, r.label];
      // "Outros" junta o resto deste nível; na comparação, os itens de antes que não estão entre os mostrados.
      const before = compareRows
        ? sumComponents((group ? group.compareRows! : compareRows.filter((c) => !shown.has(c.path[depth].key))).map((c) => c.components))
        : null;
      return {
        key: path.join(PATH_SEPARATOR),
        label: r.label,
        others: r.key === OTHERS_KEY,
        path: names,
        size: metricValue(sizeDef, r.components) ?? 0,
        share: 0,
        color: colorDef ? metricValue(colorDef, r.components) : null,
        compare: compareOf(r.components, before),
        children: group && depth + 1 < w.levels.length ? build(group.rows, group.compareRows, depth + 1, path, names) : [],
      };
    });
  };

  const nodes = build(leaves, compareLeaves, 0, [], []);
  const total = nodes.reduce((sum, n) => sum + n.size, 0);
  const colors: number[] = [];
  const walk = (list: TreemapNode[]) => {
    for (const n of list) {
      n.share = total > 0 ? n.size / total : 0;
      if (n.color != null) colors.push(n.color);
      walk(n.children);
    }
  };
  walk(nodes);

  // O meio da escala de cor: a métrica de tudo o que aparece no gráfico, refeita das peças somadas.
  const topGroups = groupByLevel(leaves, null, 0).filter((g) => (metricValue(sizeDef, g.components) ?? 0) > 0);
  const min = colors.length ? Math.min(...colors) : 0;
  const max = colors.length ? Math.max(...colors) : 0;
  const mid = colorDef ? (metricValue(colorDef, sumComponents(topGroups.map((g) => g.components))) ?? (min + max) / 2) : 0;

  const notes = notesFor(pc, colorDef ? [sizeDef, colorDef] : [sizeDef], w.levels[0]);
  if (w.levels.length > 1 && nodes.length > 0) notes.push(msg.panel.notes.treemapDrill);
  const empty = nodes.length === 0;
  return {
    kind: "treemap",
    levels: w.levels.map((d) => msg.dimension[d]),
    size: specMetric(sizeDef),
    color: colorDef ? { ...specMetric(colorDef), min, mid, max } : null,
    nodes,
    total,
    currency: pc.source.dashboard.currency,
    compareName: compareName(pc.query),
    notes,
    empty,
    emptyReason: empty ? "no-data" : null,
  };
}

// ---- funil -------------------------------------------------------------------------------------

/** Percentuais entre as etapas e a etapa da maior perda (a menor fração da anterior, abaixo de 100%). */
function funnelSteps(raw: Omit<FunnelStep, "fromPrevious" | "fromTop" | "biggestLoss">[]): FunnelStep[] {
  const top = raw[0]?.value ?? 0;
  const steps = raw.map((step, i) => {
    const previous = i > 0 ? raw[i - 1].value : 0;
    return {
      ...step,
      fromPrevious: i > 0 && previous > 0 ? step.value / previous : null,
      fromTop: top > 0 ? step.value / top : null,
      biggestLoss: false,
    };
  });
  let worst = -1;
  steps.forEach((step, i) => {
    if (step.fromPrevious == null || step.fromPrevious >= 1) return;
    if (worst < 0 || step.fromPrevious < steps[worst].fromPrevious!) worst = i;
  });
  if (worst >= 0) steps[worst].biggestLoss = true;
  return steps;
}

/**
 * Funil de vendas (métricas que se somam, no período inteiro, as mesmas dos
 * cartões) ou do kanban (as listas de um quadro, server/charts/kanban.ts).
 */
export function buildFunnel(pc: PanelComputer, w: FunnelWidget): FunnelSpec {
  const { source, query } = pc;
  const base = { kind: "funnel" as const, currency: source.dashboard.currency, compareName: compareName(query) };
  const empty = (reason: FunnelSpec["emptyReason"], notes: string[] = []): FunnelSpec => ({
    ...base,
    source: w.source.kind,
    steps: [],
    board: null,
    notes,
    empty: true,
    emptyReason: reason,
  });

  let raw: Omit<FunnelStep, "fromPrevious" | "fromTop" | "biggestLoss">[];
  let board: FunnelSpec["board"] = null;
  const notes: string[] = [];

  if (w.source.kind === "sales") {
    const defs = w.source.steps.map((id) => getMetric(id));
    const totals = pc.totals();
    const before = pc.compareTotals();
    raw = defs.map((def) => {
      const value = metricValue(def, totals);
      return { key: def.id, label: def.info.label, value: value ?? 0, compare: before ? compareOne(def, value, metricValue(def, before)) : null };
    });
    const origins = new Set(defs.flatMap((d) => metricComponents(d).map((c) => COMPONENT_ORIGIN[c])));
    if (origins.has("ads") && origins.has("orders") && source.filters.sources.length === 0) notes.push(msg.panel.funnel.mixedSources);
  } else {
    const { boardId, listIds } = w.source;
    const chosen = boardId ? source.boards.find((b) => b.id === boardId) : source.boards[0];
    if (!chosen) return empty("no-board");
    const lists = boardLists(source.store, chosen.id);
    const stages = listIds ? listIds.map((id) => lists.find((l) => l.id === id)).filter((l) => l != null) : lists;
    board = { name: chosen.name, href: `/b/${chosen.id}` };
    notes.push(msg.panel.funnel.kanban(chosen.name));
    if (stages.length < 2) return { ...empty("no-data", notes), board };
    const ids = stages.map((l) => l.id);
    const counts = kanbanFunnelCounts(source.store, chosen.id, ids, query.period.range, source.dashboard.timezone);
    const before = query.compareRange ? kanbanFunnelCounts(source.store, chosen.id, ids, query.compareRange, source.dashboard.timezone) : null;
    raw = stages.map((list, i) => ({
      key: list.id,
      label: list.name,
      value: counts[i],
      compare: before ? { value: before[i], change: compareValues(counts[i], before[i], "up") } : null,
    }));
  }

  const steps = funnelSteps(raw);
  if (steps.some((s) => s.fromPrevious != null && s.fromPrevious > 1)) notes.push(msg.panel.funnel.grew);
  const isEmpty = steps.every((s) => s.value === 0);
  return { ...base, source: w.source.kind, steps, board, notes, empty: isEmpty, emptyReason: isEmpty ? "no-data" : null };
}

// ---- Gantt -------------------------------------------------------------------------------------

/** Até quantas tarefas o Gantt mostra (as de entrega mais próxima de agora). */
export const MAX_GANTT_TASKS = 60;
const DAY = 86_400_000;

/** Começo do dia no fuso do dashboard, em milissegundos. */
function dayStart(day: string, timezone: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new TZDate(y, m - 1, d, 0, 0, 0, timezone).getTime();
}

/**
 * Gantt: os cards com data de entrega dos quadros que a pessoa pode ver. Com
 * início, viram barra; só com entrega, viram marco (losango). Entram as
 * tarefas que terminam a partir do começo do período escolhido, inclusive as
 * que vêm pela frente (os atalhos de período olham para trás, e um cronograma
 * sem o futuro não serve). Percentual concluído pelo checklist; entrega
 * marcada como feita conta 100%. Sem dependências entre tarefas.
 */
export function buildGantt(pc: PanelComputer, w: GanttWidget): GanttSpec {
  const { source, query } = pc;
  const timezone = source.dashboard.timezone;
  const now = pc.options.now?.getTime() ?? Date.now();
  const from = dayStart(query.period.range.from, timezone);
  const legendTitle = msg.panel.gantt.colorBy[w.colorBy];
  const base = { kind: "gantt" as const, legendTitle, now, scale: w.scale, timezone };

  const boards = w.boardIds ? source.boards.filter((b) => w.boardIds!.includes(b.id)) : source.boards;
  if (boards.length === 0) {
    const reason = w.boardIds ? "no-board" : "no-tasks";
    return { ...base, groups: [], legend: [], from, to: now + DAY, notes: [], empty: true, emptyReason: reason };
  }

  const all = ganttCards(source.store, boards).filter((g) => {
    const end = new Date(g.card.dueAt!).getTime();
    return end >= from && (w.showDone || !g.card.dueComplete);
  });
  // As mais próximas de agora, se passar do limite.
  const shown = [...all]
    .sort((a, b) => Math.abs(new Date(a.card.dueAt!).getTime() - now) - Math.abs(new Date(b.card.dueAt!).getTime() - now))
    .slice(0, MAX_GANTT_TASKS);

  // Cores: cada responsável, etiqueta ou lista com uma cor, na ordem em que aparecem; sem nada, cinza.
  const boardOrder = new Map(boards.map((b, i) => [b.id, i]));
  const listRank = (g: GanttCard) => `${String(boardOrder.get(g.board.id)).padStart(3, "0")}|${g.list.rank}`;
  const multipleBoards = new Set(shown.map((g) => g.board.id)).size > 1;
  const listLabel = (g: GanttCard) => (multipleBoards ? `${g.board.name} › ${g.list.name}` : g.list.name);
  const colorKey = (g: GanttCard): { key: string; label: string; order: string } | null => {
    if (w.colorBy === "member") return g.members[0] ? { key: g.members[0].id, label: g.members[0].name, order: g.members[0].name } : null;
    if (w.colorBy === "label") {
      const label = g.labels.find((l) => l.name.trim()) ?? g.labels[0];
      return label ? { key: label.id, label: label.name.trim() || msg.panel.gantt.noLabel, order: label.name } : null;
    }
    return { key: g.list.id, label: listLabel(g), order: listRank(g) };
  };
  const keys = new Map<string, { label: string; order: string }>();
  for (const g of shown) {
    const k = colorKey(g);
    if (k) keys.set(k.key, { label: k.label, order: k.order });
  }
  const palette = new Map(
    [...keys.entries()]
      .sort((a, b) => a[1].order.localeCompare(b[1].order, "pt-BR"))
      .map(([key], i) => [key, i % 8]),
  );
  const noneLabel = w.colorBy === "member" ? msg.panel.gantt.noMember : msg.panel.gantt.noLabel;

  const toTask = (g: GanttCard): GanttTask => {
    const end = new Date(g.card.dueAt!).getTime();
    const startMs = g.card.startAt ? new Date(g.card.startAt).getTime() : null;
    const done = g.card.dueComplete;
    const progress = done ? 1 : g.checklist && g.checklist.total > 0 ? g.checklist.done / g.checklist.total : 0;
    const k = colorKey(g);
    const extra = g.members.length > 1 ? ` +${g.members.length - 1}` : "";
    return {
      key: g.card.id,
      label: g.card.name,
      href: `/b/${g.board.id}?card=${g.card.id}`,
      // Início depois da entrega é erro de digitação: vira marco na entrega.
      start: startMs != null && startMs <= end ? startMs : null,
      end,
      progress,
      checklist: g.checklist,
      done,
      overdue: !done && end < now,
      color: k ? (palette.get(k.key) ?? null) : null,
      people: g.members.length ? `${g.members[0].name}${extra}` : msg.panel.gantt.noMember,
      board: g.board.name,
      list: g.list.name,
    };
  };

  // Grupos: por quadro, responsável (o primeiro, em ordem alfabética) ou lista; dentro, pela data de início.
  const groupOf = (g: GanttCard): { key: string; label: string; order: string } => {
    if (w.groupBy === "board") return { key: g.board.id, label: g.board.name, order: String(boardOrder.get(g.board.id)).padStart(3, "0") };
    if (w.groupBy === "member") {
      const m = g.members[0];
      return m ? { key: m.id, label: m.name, order: `0|${m.name}` } : { key: "__sem__", label: msg.panel.gantt.noMember, order: "1" };
    }
    return { key: g.list.id, label: listLabel(g), order: listRank(g) };
  };
  const groups = new Map<string, { key: string; label: string; order: string; tasks: GanttTask[] }>();
  for (const g of shown) {
    const group = groupOf(g);
    let entry = groups.get(group.key);
    if (!entry) groups.set(group.key, (entry = { ...group, tasks: [] }));
    entry.tasks.push(toTask(g));
  }
  const ordered = [...groups.values()]
    .sort((a, b) => a.order.localeCompare(b.order, "pt-BR"))
    .map(({ key, label, tasks }) => ({
      key,
      label,
      tasks: tasks.sort((a, b) => (a.start ?? a.end) - (b.start ?? b.end) || a.end - b.end || a.label.localeCompare(b.label, "pt-BR")),
    }));

  const legend: GanttSpec["legend"] = [...palette.entries()].map(([key, color]) => ({ color, label: keys.get(key)!.label }));
  if (shown.some((g) => colorKey(g) == null)) legend.push({ color: null, label: noneLabel });

  const lastEnd = Math.max(now, ...shown.map((g) => new Date(g.card.dueAt!).getTime()));
  const notes = [msg.panel.gantt.window];
  if (all.length > shown.length) notes.push(msg.panel.gantt.limited(shown.length, all.length));
  const empty = shown.length === 0;
  return {
    ...base,
    groups: ordered,
    legend,
    from,
    to: lastEnd + DAY,
    notes,
    empty,
    emptyReason: empty ? "no-tasks" : null,
  };
}
