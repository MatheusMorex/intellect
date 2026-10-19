// Modelos prontos de painel e a posição de cada gráfico na grade. O painel novo
// nasce de um modelo; depois o administrador muda o que quiser. A grade tem 12
// colunas (react-grid-layout); cada linha da grade tem ROW_HEIGHT pixels.

import { z } from "zod";

import { DEFAULT_PANEL, PANEL_WIDGET, type PanelWidget, type PanelWidgetInput, type WidgetType } from "@/lib/charts/widgets";

/** Até quantos painéis por dashboard e gráficos por painel (a tela continua leve). */
export const MAX_PANELS = 20;
export const MAX_WIDGETS = 40;

export const GRID_COLS = 12;
export const ROW_HEIGHT = 40;
export const GRID_MARGIN = 12;

/** Tamanho com que cada tipo nasce na grade, e o menor tamanho a que pode ser reduzido. */
export const WIDGET_SIZE: Record<WidgetType, { w: number; h: number; minW: number; minH: number }> = {
  // 4 linhas (184 px): cabe o valor, a variação, o minigráfico e a barra de meta.
  kpi: { w: 3, h: 4, minW: 2, minH: 3 },
  line: { w: 6, h: 9, minW: 3, minH: 6 },
  column: { w: 6, h: 9, minW: 3, minH: 6 },
  bar: { w: 6, h: 9, minW: 3, minH: 6 },
  pie: { w: 6, h: 9, minW: 3, minH: 7 },
  donut: { w: 6, h: 9, minW: 3, minH: 7 },
  treemap: { w: 12, h: 10, minW: 4, minH: 7 },
  funnel: { w: 6, h: 9, minW: 4, minH: 7 },
  gantt: { w: 12, h: 9, minW: 6, minH: 6 },
};

export type PanelLayoutItem = { i: string; x: number; y: number; w: number; h: number };

/** Posição de um gráfico na grade (o "i" é o id do widget). */
export const LAYOUT_ITEM = z
  .object({
    i: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    x: z.number().int().min(0).max(GRID_COLS - 1),
    y: z.number().int().min(0).max(2000),
    w: z.number().int().min(1).max(GRID_COLS),
    h: z.number().int().min(1).max(40),
  })
  .refine((item) => item.x + item.w <= GRID_COLS);

export const PANEL_LAYOUT = z.array(LAYOUT_ITEM).max(60);

/** Onde a próxima linha livre da grade começa. */
const bottomOf = (layout: PanelLayoutItem[]) => layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);

/**
 * Posições para os gráficos que ainda não têm lugar, em ordem, da esquerda para
 * a direita e de cima para baixo, abaixo dos que já estão na grade.
 */
export function placeWidgets(widgets: Pick<PanelWidget, "id" | "type">[], existing: PanelLayoutItem[] = []): PanelLayoutItem[] {
  const placed = new Set(existing.map((item) => item.i));
  const layout = [...existing];
  let x = 0;
  let y = bottomOf(existing);
  let rowHeight = 0;
  for (const widget of widgets) {
    if (placed.has(widget.id)) continue;
    const { w, h } = WIDGET_SIZE[widget.type];
    if (x + w > GRID_COLS) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    layout.push({ i: widget.id, x, y, w, h });
    placed.add(widget.id);
    x += w;
    rowHeight = Math.max(rowHeight, h);
  }
  return layout;
}

/**
 * A grade que vale para os gráficos do painel: tira posições de gráficos que
 * não existem mais, corrige tamanhos fora do limite e dá lugar aos novos.
 */
export function normalizeLayout(widgets: Pick<PanelWidget, "id" | "type">[], layout: PanelLayoutItem[]): PanelLayoutItem[] {
  const types = new Map(widgets.map((w) => [w.id, w.type]));
  const kept = layout
    .filter((item) => types.has(item.i))
    .map((item) => {
      const size = WIDGET_SIZE[types.get(item.i)!];
      const w = Math.min(GRID_COLS, Math.max(size.minW, item.w));
      return { i: item.i, x: Math.min(item.x, GRID_COLS - w), y: item.y, w, h: Math.max(size.minH, item.h) };
    });
  return placeWidgets(widgets, kept);
}

// ---- modelos -----------------------------------------------------------------------------------

export const PANEL_TEMPLATES = ["visao-geral", "trafego", "loja", "equipe", "em-branco"] as const;
export type PanelTemplateId = (typeof PANEL_TEMPLATES)[number];

const TRAFFIC: PanelWidgetInput[] = [
  { id: "kpi-gasto", type: "kpi", metric: "spend" },
  { id: "kpi-roas", type: "kpi", metric: "roas", alert: { when: "below", value: 1 } },
  { id: "kpi-cpa", type: "kpi", metric: "cpa" },
  { id: "kpi-cpc", type: "kpi", metric: "cpc" },
  { id: "kpi-ctr", type: "kpi", metric: "ctr" },
  { id: "kpi-cpm", type: "kpi", metric: "cpm" },
  { id: "kpi-impressoes", type: "kpi", metric: "impressions" },
  { id: "kpi-cliques", type: "kpi", metric: "clicks" },
  {
    id: "linha-gasto-roas",
    type: "line",
    title: "Gasto e ROAS",
    series: [
      { metric: "spend", axis: "left" },
      { metric: "roas", axis: "right" },
    ],
    average: true,
  },
  {
    id: "linha-cpc-ctr",
    type: "line",
    title: "CPC e CTR",
    series: [
      { metric: "cpc", axis: "left" },
      { metric: "ctr", axis: "right" },
    ],
  },
  {
    id: "barras-roas-campanha",
    type: "bar",
    title: "ROAS por campanha",
    dimension: "campaign",
    metrics: ["roas"],
    topN: 10,
  },
  {
    id: "colunas-gasto-plataforma",
    type: "column",
    title: "Gasto por plataforma e ROAS",
    series: [{ metric: "spendMeta" }, { metric: "spendGoogle" }],
    mode: "stacked",
    line: { metric: "roas" },
  },
  { id: "funil-vendas", type: "funnel", title: "Funil de vendas", source: { kind: "sales" } },
  {
    id: "barras-cpa-conjunto",
    type: "bar",
    title: "CPA por conjunto de anúncios",
    dimension: "adSet",
    metrics: ["cpa"],
    order: "asc",
    topN: 10,
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
];

const STORE: PanelWidgetInput[] = [
  { id: "kpi-bruto", type: "kpi", metric: "gross" },
  { id: "kpi-liquido", type: "kpi", metric: "net", goal: { source: "dashboard" } },
  { id: "kpi-lucro", type: "kpi", metric: "profit" },
  { id: "kpi-margem", type: "kpi", metric: "margin" },
  { id: "kpi-ticket", type: "kpi", metric: "ticket" },
  { id: "kpi-vendas", type: "kpi", metric: "paid" },
  { id: "kpi-reembolso", type: "kpi", metric: "refundRate" },
  { id: "kpi-chargeback", type: "kpi", metric: "chargebackRate" },
  {
    id: "linha-liquido-lucro",
    type: "line",
    title: "Faturamento líquido e lucro",
    series: [
      { metric: "net", axis: "left" },
      { metric: "profit", axis: "left" },
    ],
    average: true,
  },
  {
    id: "colunas-custos",
    type: "column",
    title: "Custos por período",
    subtitle: "Custo dos produtos, impostos e taxas, empilhados.",
    series: [{ metric: "productCost" }, { metric: "taxes" }, { metric: "fees" }],
    mode: "stacked",
  },
  { id: "barras-produtos", type: "bar", title: "Faturamento por produto", dimension: "product", metrics: ["gross"], topN: 10 },
  { id: "pizza-pagamento", type: "pie", title: "Vendas por forma de pagamento", dimension: "paymentMethod", metric: "paid" },
  {
    id: "colunas-situacao",
    type: "column",
    title: "Situação dos pedidos",
    series: [{ metric: "paid" }, { metric: "pending" }, { metric: "refunded" }, { metric: "chargebacks" }],
    mode: "percent",
  },
  { id: "rosca-plataforma", type: "donut", title: "Faturamento líquido por plataforma", dimension: "platform", metric: "net" },
];

const TEAM: PanelWidgetInput[] = [
  { id: "funil-quadro", type: "funnel", title: "Funil do quadro", source: { kind: "kanban" } },
  {
    id: "gantt-responsavel",
    type: "gantt",
    title: "Tarefas por responsável",
    subtitle: "Os cards com data, agrupados por quem faz.",
    groupBy: "member",
    colorBy: "list",
  },
  {
    id: "gantt-etapa",
    type: "gantt",
    title: "Tarefas em aberto por etapa",
    groupBy: "list",
    colorBy: "member",
    showDone: false,
  },
];

const parse = (inputs: PanelWidgetInput[]) => z.array(PANEL_WIDGET).parse(inputs);

const TEMPLATES: Record<PanelTemplateId, () => PanelWidget[]> = {
  "visao-geral": () => DEFAULT_PANEL.map((w) => structuredClone(w)),
  trafego: () => parse(TRAFFIC),
  loja: () => parse(STORE),
  equipe: () => parse(TEAM),
  "em-branco": () => [],
};

/** Os gráficos e a grade de um modelo pronto. */
export function templatePanel(id: PanelTemplateId): { widgets: PanelWidget[]; layout: PanelLayoutItem[] } {
  const widgets = TEMPLATES[id]();
  return { widgets, layout: placeWidgets(widgets) };
}
