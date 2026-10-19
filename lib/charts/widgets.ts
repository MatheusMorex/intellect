// Configuração de cada gráfico (widget) dos Painéis. É o mesmo formato que a
// Fase 5 vai salvar no banco: tudo o que chegar do editor passa por
// PANEL_WIDGET antes de virar gráfico, e o que não fizer sentido (taxa
// empilhada, ROAS por produto, duas unidades no mesmo eixo) é recusado com
// uma mensagem em português. Pizza, rosca e treemap só aceitam métricas que se
// somam e não ficam negativas: são partes de um total.
//
// Valores de meta, alerta e linha de referência ficam na unidade da métrica:
// dinheiro em centavos, percentual em fração (0,3 = 30%), multiplicador como
// número (2 = 2,00x).

import { z } from "zod";

import {
  DIMENSIONS,
  getMetric,
  metricCanBeNegative,
  METRICS,
  metricSupportsDimension,
  type Dimension,
  type MetricFormat,
  type MetricId,
} from "@/lib/charts/catalog";
import { msg } from "@/lib/charts/messages";
import { GRANULARITIES, PANEL_PRESETS } from "@/lib/charts/options";

export const WIDGET_TYPES = ["kpi", "line", "column", "bar", "pie", "donut", "treemap", "funnel", "gantt"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

const METRIC_IDS = METRICS.map((m) => m.id) as [MetricId, ...MetricId[]];
const err = msg.widgetError;

const metric = z.enum(METRIC_IDS, { error: err.metric });
const dimension = z.enum(DIMENSIONS, { error: err.dimension });
const axis = z.enum(["left", "right"]);
const text = (max: number) => z.string().trim().max(max, { error: err.textTooLong(max) });

/**
 * Período, agrupamento e comparação próprios do gráfico (senão, os do painel).
 * "Personalizado" e "datas escolhidas" ficam de fora: dependem de datas que
 * só fazem sentido na tela de quem está olhando.
 */
const overrides = z
  .object({
    periodo: z.enum(PANEL_PRESETS).optional(),
    agrupar: z.enum(GRANULARITIES).optional(),
    comparar: z.enum(["off", "previous", "year"]).optional(),
  })
  .prefault({});

/** Aparência do gráfico. Os valores do eixo ficam na unidade da métrica (dinheiro em centavos, percentual em fração). */
export const WIDGET_DISPLAY = z
  .object({
    /** Legenda no lugar de cada tipo (em cima nas linhas, embaixo na pizza), em cima, embaixo ou escondida. */
    legend: z.enum(["auto", "top", "bottom", "none"]).default("auto"),
    /** Números: o jeito de cada tipo (completo no cartão, abreviado nos rótulos), completos (R$ 1.234,56) ou abreviados (R$ 1,2 mil). */
    numbers: z.enum(["auto", "full", "compact"]).default("auto"),
    /** Casas decimais nos rótulos e na dica; null = o padrão de cada métrica. */
    decimals: z.number().int().min(0, { error: err.decimals }).max(4, { error: err.decimals }).nullable().default(null),
    /** Cor de cada série, na ordem (#rrggbb); o que faltar vem da paleta do tema. */
    colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i, { error: err.color })).max(8).default([]),
    /** Eixo de valores das linhas, colunas e barras: mínimo e máximo fixos (null = automático). */
    axisMin: z.number().nullable().default(null),
    axisMax: z.number().nullable().default(null),
    /** Linhas de grade no fundo. */
    grid: z.boolean().default(true),
  })
  .prefault({});
export type WidgetDisplay = z.output<typeof WIDGET_DISPLAY>;
export const DEFAULT_DISPLAY: WidgetDisplay = WIDGET_DISPLAY.parse({});

const common = {
  /** Identificador do widget dentro do painel (letras minúsculas, números e hífen). */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, { error: err.id }),
  /** Vazio: o título sai dos nomes das métricas. */
  title: text(80).default(""),
  subtitle: text(160).default(""),
  /** O gráfico não usa os filtros de conta, fonte e produto do painel. */
  ignoreFilters: z.boolean().default(false),
  overrides,
  display: WIDGET_DISPLAY,
};

const kpiWidget = z.object({
  ...common,
  type: z.literal("kpi"),
  metric,
  /** Minigráfico com a tendência no período. */
  sparkline: z.boolean().default(true),
  /** Meta com barra de progresso: a meta de faturamento do dashboard ou um valor. */
  goal: z
    .discriminatedUnion("source", [
      z.object({ source: z.literal("dashboard") }),
      z.object({ source: z.literal("value"), value: z.number().positive({ error: err.goalPositive }) }),
    ])
    .nullable()
    .default(null),
  /** O cartão fica em alerta quando o valor passa do limite (ROAS abaixo de 2,0x, por exemplo). */
  alert: z.object({ when: z.enum(["below", "above"]), value: z.number() }).nullable().default(null),
});

const lineWidget = z.object({
  ...common,
  type: z.literal("line"),
  /** Até 4 métricas; cada unidade (R$, x, %) fica num eixo: esquerdo ou direito. */
  series: z.array(z.object({ metric, axis: axis.default("left") })).min(1, { error: err.seriesMin }).max(4, { error: err.seriesMax(4) }),
  smooth: z.boolean().default(false),
  markers: z.boolean().default(true),
  area: z.boolean().default(false),
  /** Linha da média (das métricas somáveis, o total ÷ os períodos; das taxas, a taxa do período inteiro). */
  average: z.boolean().default(false),
  /** Linha de meta, num valor fixo do eixo escolhido. */
  goal: z.object({ value: z.number(), axis: axis.default("left") }).nullable().default(null),
  /** Zoom e arraste no eixo do tempo. */
  zoom: z.boolean().default(true),
  /** Desenha a comparação como linha pontilhada (quando a comparação está ligada). */
  compare: z.boolean().default(true),
});

const columnWidget = z.object({
  ...common,
  type: z.literal("column"),
  series: z.array(z.object({ metric })).min(1, { error: err.seriesMin }).max(4, { error: err.seriesMax(4) }),
  /** Agrupadas (lado a lado), empilhadas ou empilhadas 100%. */
  mode: z.enum(["grouped", "stacked", "percent"]).default("grouped"),
  /** Valor em cima de cada coluna. */
  labels: z.boolean().default(false),
  /** Colunas + linha: uma métrica como linha, no eixo direito (ex.: colunas de gasto e linha de ROAS). */
  line: z.object({ metric }).nullable().default(null),
  /** Nas agrupadas, desenha as colunas do período de comparação ao lado. */
  compare: z.boolean().default(false),
});

const barWidget = z.object({
  ...common,
  type: z.literal("bar"),
  dimension,
  metrics: z.array(metric).min(1, { error: err.seriesMin }).max(3, { error: err.seriesMax(3) }),
  mode: z.enum(["grouped", "stacked"]).default("grouped"),
  /** Ordem pela primeira métrica. */
  order: z.enum(["desc", "asc"]).default("desc"),
  /** Quantos itens aparecem; o resto vira "Outros" (se others estiver ligado). */
  topN: z.number().int({ error: err.topN }).min(1, { error: err.topN }).max(50, { error: err.topN }).default(10),
  others: z.boolean().default(true),
  labels: z.boolean().default(true),
});

/** Pizza e rosca: as mesmas opções; a rosca mostra o total no centro. */
const proportion = {
  ...common,
  dimension,
  metric,
  /** Quantas fatias aparecem, contando "Outros" (padrão 6): com mais itens, os menores viram "Outros". */
  slices: z.number().int({ error: err.slices }).min(2, { error: err.slices }).max(8, { error: err.slices }).default(6),
  /** Rótulo de cada fatia: o valor, o percentual do total ou os dois. */
  labels: z.enum(["value", "percent", "both"]).default("both"),
};
const pieWidget = z.object({ ...proportion, type: z.literal("pie") });
const donutWidget = z.object({ ...proportion, type: z.literal("donut") });

const treemapWidget = z.object({
  ...common,
  type: z.literal("treemap"),
  /** Níveis, do mais amplo ao mais detalhado (até 3): Plataforma → Campanha → Anúncio. */
  levels: z.array(dimension).min(1, { error: err.levelsMin }).max(3, { error: err.levelsMax }),
  /** Tamanho de cada retângulo: uma métrica que se soma (gasto, faturamento, vendas...). */
  size: metric,
  /** Cor: uma segunda métrica, opcional (ROAS, por exemplo), com escala e legenda. */
  color: metric.nullable().default(null),
  /** Quantos itens em cada nível; o resto vira "Outros". */
  topN: z.number().int({ error: err.treemapTopN }).min(1, { error: err.treemapTopN }).max(30, { error: err.treemapTopN }).default(12),
});

/** Etapas padrão do funil de vendas (não existe dado de visita nem de checkout iniciado). */
export const DEFAULT_SALES_STEPS: readonly MetricId[] = ["impressions", "clicks", "addToCarts", "orders", "paid"];

const rowId = (error: string) => z.string({ error }).trim().min(1, { error }).max(64, { error });

const funnelWidget = z.object({
  ...common,
  type: z.literal("funnel"),
  source: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("sales"),
      /** Etapas, de cima para baixo: contagens que se somam (impressões, cliques, pedidos...). */
      steps: z
        .array(metric)
        .min(2, { error: err.funnelSteps })
        .max(6, { error: err.funnelSteps })
        .default(() => [...DEFAULT_SALES_STEPS]),
    }),
    z.object({
      kind: z.literal("kanban"),
      /** Quadro do workspace; null = o primeiro quadro aberto que a pessoa pode ver. */
      boardId: rowId(err.boardId).nullable().default(null),
      /** Listas (etapas) na ordem do funil; null = as listas abertas, na ordem do quadro. */
      listIds: z.array(rowId(err.funnelLists)).min(2, { error: err.funnelLists }).max(12, { error: err.funnelLists }).nullable().default(null),
    }),
  ]),
});

const ganttWidget = z.object({
  ...common,
  type: z.literal("gantt"),
  /** Quadros; null = todos os quadros abertos que a pessoa pode ver no workspace. */
  boardIds: z.array(rowId(err.boards)).min(1, { error: err.boards }).max(20, { error: err.boards }).nullable().default(null),
  /** Linhas agrupadas por quadro, responsável ou lista (etapa). */
  groupBy: z.enum(["board", "member", "list"]).default("list"),
  /** Cor de cada barra: pelo responsável, pela etiqueta ou pela lista. */
  colorBy: z.enum(["member", "label", "list"]).default("member"),
  /** Escala do eixo do tempo: dias, semanas ou meses. */
  scale: z.enum(["day", "week", "month"]).default("week"),
  /** Mostra também as tarefas com a entrega marcada como feita. */
  showDone: z.boolean().default(true),
});

const unique = (ids: MetricId[]) => new Set(ids).size === ids.length;
const formats = (ids: MetricId[]) => new Set<MetricFormat>(ids.map((id) => getMetric(id).format));
const allSummable = (ids: MetricId[]) => ids.every((id) => getMetric(id).kind === "sum");

const WIDGET_SHAPES = z.discriminatedUnion("type", [
  kpiWidget,
  lineWidget,
  columnWidget,
  barWidget,
  pieWidget,
  donutWidget,
  treemapWidget,
  funnelWidget,
  ganttWidget,
]);

export const PANEL_WIDGET = WIDGET_SHAPES.superRefine((w, ctx) => {
  const issue = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: "custom", message, path });
  /** Parte de um total: somável e nunca negativa. */
  const asPart = (id: MetricId, path: string) => {
    const def = getMetric(id);
    if (def.kind !== "sum") issue(err.proportionRate, [path]);
    else if (metricCanBeNegative(def)) issue(err.proportionNegative(def.info.label), [path]);
  };
  const byDimension = (id: MetricId, d: Dimension, path: (string | number)[]) => {
    if (!metricSupportsDimension(getMetric(id), d)) issue(err.dimensionMetric(getMetric(id).info.label, msg.dimension[d]), path);
  };
  if (w.display.axisMin != null && w.display.axisMax != null && w.display.axisMin >= w.display.axisMax) issue(err.axisRange, ["display", "axisMax"]);
  switch (w.type) {
    case "kpi":
      if (w.goal?.source === "dashboard" && getMetric(w.metric).format !== "money") issue(err.goalDashboardMoney, ["goal"]);
      return;
    case "line": {
      const ids = w.series.map((s) => s.metric);
      if (!unique(ids)) issue(err.repeated, ["series"]);
      const left = w.series.filter((s) => s.axis === "left").map((s) => s.metric);
      const right = w.series.filter((s) => s.axis === "right").map((s) => s.metric);
      if (left.length === 0) issue(err.leftAxisEmpty, ["series"]);
      if (formats(left).size > 1 || formats(right).size > 1) issue(err.mixedUnits, ["series"]);
      if (w.goal && (w.goal.axis === "left" ? left : right).length === 0) issue(err.goalAxis, ["goal"]);
      return;
    }
    case "column": {
      const ids = w.series.map((s) => s.metric);
      if (!unique(ids) || (w.line && ids.includes(w.line.metric))) issue(err.repeated, ["series"]);
      if (formats(ids).size > 1) issue(err.mixedUnits, ["series"]);
      if (w.mode !== "grouped" && !allSummable(ids)) issue(err.stackRates, ["mode"]);
      return;
    }
    case "bar": {
      if (!unique(w.metrics)) issue(err.repeated, ["metrics"]);
      if (formats(w.metrics).size > 1) issue(err.mixedUnits, ["metrics"]);
      if (w.mode === "stacked" && !allSummable(w.metrics)) issue(err.stackRates, ["mode"]);
      w.metrics.forEach((id, i) => byDimension(id, w.dimension, ["metrics", i]));
      return;
    }
    case "pie":
    case "donut":
      asPart(w.metric, "metric");
      byDimension(w.metric, w.dimension, ["metric"]);
      return;
    case "treemap": {
      asPart(w.size, "size");
      if (w.color === w.size) issue(err.repeated, ["color"]);
      if (new Set(w.levels).size !== w.levels.length) issue(err.levelsRepeated, ["levels"]);
      if (w.levels.includes("product") && w.levels.length > 1) issue(err.treemapProduct, ["levels"]);
      for (const d of new Set(w.levels)) {
        byDimension(w.size, d, ["size"]);
        if (w.color) byDimension(w.color, d, ["color"]);
      }
      return;
    }
    case "funnel":
      if (w.source.kind === "sales") {
        if (!unique(w.source.steps)) issue(err.repeated, ["source", "steps"]);
        w.source.steps.forEach((step, i) => {
          const def = getMetric(step);
          if (def.kind !== "sum" || def.format !== "number") issue(err.funnelStepCount, ["source", "steps", i]);
        });
      } else if (w.source.listIds && new Set(w.source.listIds).size !== w.source.listIds.length) {
        issue(err.levelsRepeated, ["source", "listIds"]);
      }
      return;
    case "gantt":
      return;
  }
});

export type PanelWidget = z.output<typeof PANEL_WIDGET>;
export type PanelWidgetInput = z.input<typeof PANEL_WIDGET>;
export type KpiWidget = Extract<PanelWidget, { type: "kpi" }>;
export type LineWidget = Extract<PanelWidget, { type: "line" }>;
export type ColumnWidget = Extract<PanelWidget, { type: "column" }>;
export type BarWidget = Extract<PanelWidget, { type: "bar" }>;
export type PieWidget = Extract<PanelWidget, { type: "pie" | "donut" }>;
export type TreemapWidget = Extract<PanelWidget, { type: "treemap" }>;
export type FunnelWidget = Extract<PanelWidget, { type: "funnel" }>;
export type GanttWidget = Extract<PanelWidget, { type: "gantt" }>;

const joinNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : names[0]);

/** Título do widget: o escolhido ou os nomes das métricas ("Faturamento líquido e ROAS", "Gasto com anúncios por plataforma"). */
export function widgetTitle(w: PanelWidget): string {
  if (w.title) return w.title;
  // No treemap, o título fala do tamanho; a cor tem a legenda dela.
  const joined = joinNames((w.type === "treemap" ? [w.size] : widgetMetrics(w)).map((id) => getMetric(id).info.label));
  const by = (dims: Dimension[]) => `${joined} por ${joinNames(dims.map((d) => msg.dimension[d].toLowerCase()))}`;
  if (w.type === "bar" || w.type === "pie" || w.type === "donut") return by([w.dimension]);
  if (w.type === "treemap") return by(w.levels);
  if (w.type === "funnel") return w.source.kind === "sales" ? msg.panel.titles.salesFunnel : msg.panel.titles.kanbanFunnel;
  if (w.type === "gantt") return msg.panel.titles.gantt;
  return joined;
}

/** Métricas que o widget usa, na ordem em que aparecem. */
export function widgetMetrics(w: PanelWidget): MetricId[] {
  switch (w.type) {
    case "kpi":
    case "pie":
    case "donut":
      return [w.metric];
    case "line":
      return w.series.map((s) => s.metric);
    case "column":
      return [...w.series.map((s) => s.metric), ...(w.line ? [w.line.metric] : [])];
    case "bar":
      return [...w.metrics];
    case "treemap":
      return [w.size, ...(w.color ? [w.color] : [])];
    case "funnel":
      return w.source.kind === "sales" ? [...w.source.steps] : [];
    case "gantt":
      return [];
  }
}

// ---- painel padrão (Fases 2 e 3) ------------------------------------------------------------------
// Fixo por enquanto: na Fase 5 cada dashboard terá os próprios painéis, editáveis.

const DEFAULT_PANEL_INPUT: PanelWidgetInput[] = [
  { id: "kpi-liquido", type: "kpi", metric: "net", goal: { source: "dashboard" } },
  { id: "kpi-gasto", type: "kpi", metric: "spend" },
  { id: "kpi-roas", type: "kpi", metric: "roas", alert: { when: "below", value: 1 } },
  { id: "kpi-lucro", type: "kpi", metric: "profit" },
  { id: "kpi-cpa", type: "kpi", metric: "cpa" },
  { id: "kpi-vendas", type: "kpi", metric: "paid" },
  { id: "kpi-ticket", type: "kpi", metric: "ticket" },
  { id: "kpi-margem", type: "kpi", metric: "margin" },
  {
    id: "linha-faturamento-roas",
    type: "line",
    title: "Faturamento líquido e ROAS",
    subtitle: "Cada unidade no próprio eixo: reais à esquerda, ROAS à direita.",
    series: [
      { metric: "net", axis: "left" },
      { metric: "roas", axis: "right" },
    ],
    average: true,
  },
  {
    id: "colunas-gasto-roas",
    type: "column",
    title: "Gasto por plataforma e ROAS",
    subtitle: "Colunas empilhadas de gasto, com o ROAS como linha.",
    series: [{ metric: "spendMeta" }, { metric: "spendGoogle" }],
    mode: "stacked",
    line: { metric: "roas" },
  },
  {
    id: "colunas-bruto-liquido",
    type: "column",
    title: "Faturamento bruto e líquido",
    series: [{ metric: "gross" }, { metric: "net" }],
    mode: "grouped",
    labels: true,
    compare: true,
  },
  {
    id: "colunas-situacao",
    type: "column",
    title: "Situação dos pedidos",
    subtitle: "Quanto de cada situação há em cada período (100%).",
    series: [{ metric: "paid" }, { metric: "pending" }, { metric: "refunded" }, { metric: "chargebacks" }],
    mode: "percent",
  },
  {
    id: "barras-campanhas",
    type: "bar",
    title: "Top 10 campanhas por faturamento líquido",
    dimension: "campaign",
    metrics: ["net"],
    topN: 10,
  },
  {
    id: "barras-contas",
    type: "bar",
    title: "Gasto e faturamento líquido por conta",
    dimension: "adAccount",
    metrics: ["spend", "net"],
    topN: 8,
  },
  {
    id: "barras-produtos",
    type: "bar",
    title: "Vendas por produto",
    dimension: "product",
    metrics: ["gross"],
    topN: 8,
  },
  {
    id: "barras-origem",
    type: "bar",
    title: "Faturamento bruto por origem (utm_source)",
    dimension: "utmSource",
    metrics: ["gross"],
    topN: 6,
  },
  {
    id: "rosca-plataforma",
    type: "donut",
    title: "Faturamento líquido por plataforma",
    subtitle: "De onde veio o faturamento: cada fonte de tráfego e as vendas sem rastreio.",
    dimension: "platform",
    metric: "net",
  },
  {
    id: "pizza-pagamento",
    type: "pie",
    title: "Vendas por forma de pagamento",
    dimension: "paymentMethod",
    metric: "paid",
  },
  {
    id: "treemap-gasto",
    type: "treemap",
    title: "Gasto por plataforma, campanha e anúncio",
    subtitle: "O tamanho é o gasto; a cor é o ROAS de cada parte.",
    levels: ["platform", "campaign", "ad"],
    size: "spend",
    color: "roas",
  },
  {
    id: "funil-vendas",
    type: "funnel",
    title: "Funil de vendas",
    subtitle: "Dos anúncios até a venda paga.",
    source: { kind: "sales" },
  },
  {
    id: "funil-quadro",
    type: "funnel",
    title: "Funil do quadro",
    subtitle: "Até que lista os cards criados no período chegaram.",
    source: { kind: "kanban" },
  },
  {
    id: "gantt-tarefas",
    type: "gantt",
    title: "Cronograma das tarefas",
    subtitle: "Os cards com data, de todos os quadros que você pode ver.",
  },
];

export const DEFAULT_PANEL: readonly PanelWidget[] = z.array(PANEL_WIDGET).parse(DEFAULT_PANEL_INPUT);
