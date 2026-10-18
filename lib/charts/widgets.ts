// Configuração de cada gráfico (widget) dos Painéis. É o mesmo formato que a
// Fase 5 vai salvar no banco: tudo o que chegar do editor passa por
// PANEL_WIDGET antes de virar gráfico, e o que não fizer sentido (taxa
// empilhada, ROAS por produto, duas unidades no mesmo eixo) é recusado com
// uma mensagem em português.
//
// Valores de meta, alerta e linha de referência ficam na unidade da métrica:
// dinheiro em centavos, percentual em fração (0,3 = 30%), multiplicador como
// número (2 = 2,00x).

import { z } from "zod";

import { DIMENSIONS, getMetric, METRICS, metricSupportsDimension, type MetricFormat, type MetricId } from "@/lib/charts/catalog";
import { msg } from "@/lib/charts/messages";

export const WIDGET_TYPES = ["kpi", "line", "column", "bar"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

const METRIC_IDS = METRICS.map((m) => m.id) as [MetricId, ...MetricId[]];
const err = msg.widgetError;

const metric = z.enum(METRIC_IDS, { error: err.metric });
const axis = z.enum(["left", "right"]);
const text = (max: number) => z.string().trim().max(max, { error: err.textTooLong(max) });

const common = {
  /** Identificador do widget dentro do painel (letras minúsculas, números e hífen). */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, { error: err.id }),
  /** Vazio: o título sai dos nomes das métricas. */
  title: text(80).default(""),
  subtitle: text(160).default(""),
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
  dimension: z.enum(DIMENSIONS, { error: err.dimension }),
  metrics: z.array(metric).min(1, { error: err.seriesMin }).max(3, { error: err.seriesMax(3) }),
  mode: z.enum(["grouped", "stacked"]).default("grouped"),
  /** Ordem pela primeira métrica. */
  order: z.enum(["desc", "asc"]).default("desc"),
  /** Quantos itens aparecem; o resto vira "Outros" (se others estiver ligado). */
  topN: z.number().int({ error: err.topN }).min(1, { error: err.topN }).max(50, { error: err.topN }).default(10),
  others: z.boolean().default(true),
  labels: z.boolean().default(true),
});

const unique = (ids: MetricId[]) => new Set(ids).size === ids.length;
const formats = (ids: MetricId[]) => new Set<MetricFormat>(ids.map((id) => getMetric(id).format));
const allSummable = (ids: MetricId[]) => ids.every((id) => getMetric(id).kind === "sum");

export const PANEL_WIDGET = z.discriminatedUnion("type", [kpiWidget, lineWidget, columnWidget, barWidget]).superRefine((w, ctx) => {
  const issue = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: "custom", message, path });
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
      w.metrics.forEach((id, i) => {
        if (!metricSupportsDimension(getMetric(id), w.dimension)) {
          issue(err.dimensionMetric(getMetric(id).info.label, msg.dimension[w.dimension]), ["metrics", i]);
        }
      });
      return;
    }
  }
});

export type PanelWidget = z.output<typeof PANEL_WIDGET>;
export type PanelWidgetInput = z.input<typeof PANEL_WIDGET>;
export type KpiWidget = Extract<PanelWidget, { type: "kpi" }>;
export type LineWidget = Extract<PanelWidget, { type: "line" }>;
export type ColumnWidget = Extract<PanelWidget, { type: "column" }>;
export type BarWidget = Extract<PanelWidget, { type: "bar" }>;

/** Título do widget: o escolhido ou os nomes das métricas ("Faturamento líquido e ROAS"). */
export function widgetTitle(w: PanelWidget): string {
  if (w.title) return w.title;
  const ids: MetricId[] =
    w.type === "kpi"
      ? [w.metric]
      : w.type === "line"
        ? w.series.map((s) => s.metric)
        : w.type === "column"
          ? [...w.series.map((s) => s.metric), ...(w.line ? [w.line.metric] : [])]
          : w.metrics;
  const names = ids.map((id) => getMetric(id).info.label);
  const joined = names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : names[0];
  return w.type === "bar" ? `${joined} por ${msg.dimension[w.dimension].toLowerCase()}` : joined;
}

/** Métricas que o widget usa, na ordem em que aparecem. */
export function widgetMetrics(w: PanelWidget): MetricId[] {
  if (w.type === "kpi") return [w.metric];
  if (w.type === "line") return w.series.map((s) => s.metric);
  if (w.type === "column") return [...w.series.map((s) => s.metric), ...(w.line ? [w.line.metric] : [])];
  return [...w.metrics];
}

// ---- painel padrão da Fase 2 ------------------------------------------------------------------
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
];

export const DEFAULT_PANEL: readonly PanelWidget[] = z.array(PANEL_WIDGET).parse(DEFAULT_PANEL_INPUT);
