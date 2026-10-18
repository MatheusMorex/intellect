// Monta cada widget dos Painéis a partir da configuração (lib/charts/widgets.ts):
// cartões de KPI e gráficos de linhas, colunas, barras, pizza, rosca e treemap,
// no formato próprio de lib/charts/spec.ts. Todo número sai do serviço de cálculo (compute.ts) a
// partir das peças somadas (source.ts).
//
// As contas que vários widgets usam (a série do período, a da comparação, os
// totais, as linhas de cada dimensão) são feitas uma vez só por tela.

import { getMetric, metricComponents, type Dimension, type MetricDef, type MetricDirection, type MetricFormat, type MetricId } from "@/lib/charts/catalog";
import type { Change } from "@/lib/charts/format";
import { msg } from "@/lib/charts/messages";
import type {
  ChartCategory,
  ChartSeries,
  ChartSpec,
  PieSpec,
  ReferenceLine,
  SpecCompare,
  SpecMetric,
  TreemapNode,
  TreemapSpec,
} from "@/lib/charts/spec";
import type { BarWidget, ColumnWidget, KpiWidget, LineWidget, PieWidget, TreemapWidget } from "@/lib/charts/widgets";
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
