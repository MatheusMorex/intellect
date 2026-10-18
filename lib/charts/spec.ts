// Formato próprio dos gráficos dos Painéis: o servidor monta, o navegador
// desenha. Não tem nada do ECharts aqui; trocar de biblioteca é trocar só
// components/charts/echarts-option.ts e o renderizador.
//
// Os valores vêm na unidade da métrica (centavos, fração, multiplicador) e são
// formatados no navegador por lib/charts/format.ts, a mesma função dos
// cartões: o número sai igual no cartão, no gráfico, na dica e na tabela.

import type { MetricDirection, MetricFormat } from "@/lib/charts/catalog";
import type { Change } from "@/lib/charts/format";

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

export type ChartSpec = {
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
};
