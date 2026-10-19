// Formato próprio dos gráficos dos Painéis: o servidor monta, o navegador
// desenha. Não tem nada do ECharts aqui; trocar de biblioteca é trocar só
// components/charts/echarts-option.ts e o renderizador.
//
// Os valores vêm na unidade da métrica (centavos, fração, multiplicador) e são
// formatados no navegador por lib/charts/format.ts, a mesma função dos
// cartões: o número sai igual no cartão, no gráfico, na dica e na tabela.

import type { MetricDirection, MetricFormat } from "@/lib/charts/catalog";
import type { Change } from "@/lib/charts/format";

/** Aparência escolhida no editor (lib/charts/widgets.ts, WIDGET_DISPLAY). Sem ela, valem os padrões. */
export type SpecDisplay = {
  legend: "auto" | "top" | "bottom" | "none";
  numbers: "auto" | "full" | "compact";
  decimals: number | null;
  colors: string[];
  axisMin: number | null;
  axisMax: number | null;
  grid: boolean;
};

export const DEFAULT_SPEC_DISPLAY: SpecDisplay = {
  legend: "auto",
  numbers: "auto",
  decimals: null,
  colors: [],
  axisMin: null,
  axisMax: null,
  grid: true,
};

/** Tipo do gráfico e a fórmula de cada métrica, para o "?" de "Quando usar". */
export type ChartHelp = {
  type: "kpi" | "line" | "column" | "bar" | "pie" | "donut" | "treemap" | "funnel" | "gantt";
  metrics: { label: string; formula: string }[];
};

/** Um ponto do eixo: um dia, uma semana, uma campanha... */
export type ChartCategory = {
  key: string;
  /** Texto curto, no eixo. */
  label: string;
  /** Por extenso, na dica ("sábado, 17 de outubro de 2026"). */
  longLabel: string;
  /** ongoing: ainda em andamento; clipped: o período cobre só uma parte; null: completo. */
  partial: "ongoing" | "clipped" | null;
  /** O ponto equivalente do período de comparação, por extenso (null sem comparação). */
  compareLabel: string | null;
};

export type ChartSeries = {
  id: string;
  name: string;
  /** Linha, coluna (vertical) ou barra (horizontal). */
  kind: "line" | "column" | "bar";
  axis: "left" | "right";
  format: MetricFormat;
  direction: MetricDirection;
  /** Valor em cada ponto; null = sem dado (taxa sem divisor, gasto por hora). */
  values: (number | null)[];
  /** Posição da cor na paleta do tema (0 a 7), sempre a mesma para a mesma série. */
  color: number;
  /** Empilhado 100%: values traz a fatia (fração) e absolute o valor de verdade. */
  absolute?: (number | null)[];
  /** O mesmo ponto no período de comparação e a variação contra ele. */
  compare?: { values: (number | null)[]; changes: Change[] };
};

export type ReferenceLine = {
  kind: "goal" | "average";
  axis: "left" | "right";
  value: number;
  format: MetricFormat;
  /** Casas decimais do valor no rótulo (a média de uma contagem pode ser 12,5). */
  decimals?: number;
  label: string;
  /** Cor da série a que a linha pertence (a média de cada métrica), ou null (meta). */
  color: number | null;
};

/** Gráficos com eixos: linhas, colunas e barras. */
export type ChartSpec = {
  kind: "axis";
  /** time: eixo de tempo (linhas e colunas); category: itens de uma dimensão (barras). */
  axis: "time" | "category";
  categories: ChartCategory[];
  series: ChartSeries[];
  /** Formato de cada eixo de valores; null = sem eixo direito. */
  axes: { left: MetricFormat; right: MetricFormat | null };
  stack: "none" | "stacked" | "percent";
  smooth: boolean;
  markers: boolean;
  area: boolean;
  labels: boolean;
  zoom: boolean;
  /** Desenha a comparação (linha pontilhada ou colunas mais claras); senão, ela aparece só na dica. */
  drawCompare: boolean;
  references: ReferenceLine[];
  currency: string;
  /** Nome curto da comparação, para a legenda e a dica ("período anterior"). */
  compareName: string | null;
  /** Avisos que aparecem embaixo do gráfico. */
  notes: string[];
  /** Nada para mostrar: todos os valores zerados ou sem dado. */
  empty: boolean;
  /** Por quê: no-data (nada no período) ou daily-only (as métricas só existem por dia e o gráfico está por hora). */
  emptyReason: "no-data" | "daily-only" | null;
  display?: SpecDisplay;
};

// ---- proporção: pizza, rosca e treemap -----------------------------------------------------------

export type SpecMetric = { id: string; name: string; format: MetricFormat; direction: MetricDirection };

/** O mesmo item no período de comparação e a variação contra ele. */
export type SpecCompare = { value: number | null; change: Change };

export type PieSlice = {
  key: string;
  label: string;
  value: number;
  /** Fração do total (0,25 = 25%): a mesma no rótulo, na dica e na tabela. */
  share: number;
  /** Posição da cor na paleta (0 a 7); null = "Outros", em cinza. */
  color: number | null;
  compare: SpecCompare | null;
};

export type PieSpec = {
  kind: "pie";
  /** Rosca: o total aparece no centro. */
  donut: boolean;
  metric: SpecMetric;
  slices: PieSlice[];
  /** Soma das fatias: o total da métrica no período. */
  total: number;
  compareTotal: SpecCompare | null;
  labels: "value" | "percent" | "both";
  currency: string;
  compareName: string | null;
  notes: string[];
  empty: boolean;
  emptyReason: "no-data" | null;
  display?: SpecDisplay;
};

export type TreemapNode = {
  /** Único no gráfico inteiro: as chaves do caminho até aqui. */
  key: string;
  label: string;
  /** "Outros": o resto do nível, junto (em cinza). */
  others: boolean;
  /** Os nomes do caminho até aqui, do primeiro nível a este ("Meta", "Campanha X"). */
  path: string[];
  size: number;
  /** Fração do total do gráfico. */
  share: number;
  /** Valor da métrica da cor (null = sem dado ou sem métrica de cor). */
  color: number | null;
  compare: { size: SpecCompare; color: SpecCompare | null } | null;
  children: TreemapNode[];
};

export type TreemapSpec = {
  kind: "treemap";
  /** Nome de cada nível ("Plataforma", "Campanha", "Anúncio"). */
  levels: string[];
  size: SpecMetric;
  /** Métrica da cor, a faixa de valores dela e o valor do gráfico inteiro (o meio da escala). */
  color: (SpecMetric & { min: number; mid: number; max: number }) | null;
  nodes: TreemapNode[];
  total: number;
  currency: string;
  compareName: string | null;
  notes: string[];
  empty: boolean;
  emptyReason: "no-data" | null;
  display?: SpecDisplay;
};

// ---- processo: funil e Gantt ----------------------------------------------------------------------

export type FunnelStep = {
  key: string;
  label: string;
  value: number;
  /** Fração da etapa anterior (null na primeira, ou com a anterior zerada). */
  fromPrevious: number | null;
  /** Fração do topo (null com o topo zerado). */
  fromTop: number | null;
  compare: SpecCompare | null;
  /** A etapa que mais perdeu em relação à anterior (em proporção). */
  biggestLoss: boolean;
};

export type FunnelSpec = {
  kind: "funnel";
  source: "sales" | "kanban";
  steps: FunnelStep[];
  /** O quadro do funil do kanban e o link para ele (null no funil de vendas). */
  board: { name: string; href: string } | null;
  currency: string;
  compareName: string | null;
  notes: string[];
  empty: boolean;
  /** no-board: o quadro não existe ou a pessoa não pode ver. */
  emptyReason: "no-data" | "no-board" | null;
  display?: SpecDisplay;
};

export type GanttTask = {
  key: string;
  label: string;
  /** Abre o card ao clicar (/b/<quadro>?card=<card>). */
  href: string;
  /** Início e entrega em milissegundos (UTC). Sem início, é um marco na entrega. */
  start: number | null;
  end: number;
  /** Fração concluída: os itens do checklist, ou tudo quando a entrega foi marcada como feita. */
  progress: number;
  checklist: { done: number; total: number } | null;
  done: boolean;
  overdue: boolean;
  /** Posição da cor na paleta (0 a 7); null = sem responsável, sem etiqueta... (cinza). */
  color: number | null;
  people: string;
  board: string;
  list: string;
};

export type GanttSpec = {
  kind: "gantt";
  groups: { key: string; label: string; tasks: GanttTask[] }[];
  /** A legenda das cores (o que cada cor é). */
  legend: { color: number | null; label: string }[];
  legendTitle: string;
  /** Janela do eixo do tempo e o momento de agora (linha "Hoje"), em milissegundos. */
  from: number;
  to: number;
  now: number;
  scale: "day" | "week" | "month";
  timezone: string;
  notes: string[];
  empty: boolean;
  emptyReason: "no-tasks" | "no-board" | null;
  display?: SpecDisplay;
};

/** Qualquer gráfico dos Painéis. */
export type PanelChartSpec = ChartSpec | PieSpec | TreemapSpec | FunnelSpec | GanttSpec;
