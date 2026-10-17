// Textos dos Painéis em português do Brasil. Ficam todos aqui, fora do código,
// para a tradução futura: outro idioma é outro objeto com as mesmas chaves.
// As métricas que já existem no glossário (lib/metrics-glossary.ts) usam os
// textos de lá; aqui ficam só as novas.

import type { CompareMode, Granularity, PanelPeriodId, WeekStart } from "@/lib/charts/options";
import type { MetricInfo } from "@/lib/metrics-glossary";

export const chartsPtBR = {
  locale: "pt-BR",

  granularity: {
    hour: "Hora",
    day: "Dia",
    week: "Semana",
    fortnight: "Quinzena",
    month: "Mês",
    year: "Ano",
  } satisfies Record<Granularity, string>,

  /** Quando a granularidade escolhida não cabe no período. */
  granularityLimit: {
    hour: "Por hora dá para ver até 31 dias.",
    day: "Por dia dá para ver até 2 anos.",
    week: "Por semana dá para ver até 5 anos.",
    fortnight: "Por quinzena dá para ver até 10 anos.",
    month: "",
    year: "",
  } satisfies Record<Granularity, string>,
  granularitySuggestion: (label: string) => `Neste período, os dados aparecem por ${label.toLowerCase()}.`,

  fortnight: { first: "1ª quinzena", second: "2ª quinzena", firstShort: "1ª quinz.", secondShort: "2ª quinz." },
  weekOf: (range: string) => `Semana de ${range}`,
  /** A hora que se repete no dia em que o relógio volta uma hora (fim do horário de verão na Europa). */
  repeatedHour: (label: string) => `${label} (2ª vez)`,

  partial: {
    label: "Parcial",
    ongoing: "Período ainda em andamento. Não compare com um período fechado sem considerar isso.",
    clipped: "O período escolhido cobre só uma parte deste intervalo.",
  },

  others: "Outros",
  changeNew: "Novo",

  periods: {
    hoje: "Hoje",
    ontem: "Ontem",
    "7d": "Últimos 7 dias",
    "14d": "Últimos 14 dias",
    "30d": "Últimos 30 dias",
    quinzena: "Esta quinzena",
    mes: "Este mês",
    "mes-passado": "Mês passado",
    trimestre: "Este trimestre",
    ano: "Este ano",
    "ano-passado": "Ano passado",
    maximo: "Todo o período",
    personalizado: "Personalizado",
  } satisfies Record<PanelPeriodId, string>,

  compare: {
    off: "Sem comparação",
    previous: "Período anterior",
    year: "Mesmo período do ano anterior",
    custom: "Período personalizado",
  } satisfies Record<CompareMode, string>,

  weekStart: {
    monday: "Segunda a domingo",
    sunday: "Domingo a sábado",
  } satisfies Record<WeekStart, string>,

  formula: {
    empty: "Escreva a fórmula.",
    tooLong: (max: number) => `A fórmula pode ter até ${max} caracteres.`,
    tooManyParts: "A fórmula está grande demais. Divida em métricas menores.",
    unknownMetric: (name: string) => `“${name}” não é uma métrica. Use os nomes da lista.`,
    unexpected: (token: string) => `Não entendi “${token}” neste ponto.`,
    unexpectedEnd: "A fórmula terminou antes da hora: falta um número, uma métrica ou fechar um parêntese.",
    unclosed: "Falta fechar um parêntese.",
    tooDeep: "Parênteses demais, um dentro do outro.",
    noMetric: "Use pelo menos uma métrica na fórmula.",
    divideByZero: "Não dá para dividir por zero.",
    badNumber: (text: string) => `“${text}” não é um número válido.`,
  },

  /** Métricas que não estão no glossário. */
  metrics: {
    ordersCount: {
      label: "Pedidos gerados",
      explain: "Todos os pedidos criados no período, pagos ou não (pendentes, recusados, reembolsados e cancelados também contam).",
      purpose: "Ver quantas pessoas chegaram a fazer o pedido, mesmo as que não concluíram o pagamento.",
      formula: "pedidos criados no período, pelo dia do pedido",
    },
    clickConversion: {
      label: "Conversão por clique",
      explain: "De cada 100 cliques nos anúncios, quantos viraram venda paga.",
      purpose: "Ver se as pessoas que clicam no anúncio chegam a comprar. Junta o efeito do anúncio, da página e da oferta.",
      formula: "vendas pagas ÷ cliques",
    },
    refundedValue: {
      label: "Valor reembolsado",
      explain: "Quanto dinheiro voltou para os clientes em reembolsos, inteiros ou parciais.",
      purpose: "Ver quanto as devoluções tiraram do faturamento no período.",
      formula: "soma dos valores reembolsados dos pedidos do período",
    },
    chargebackCount: {
      label: "Chargebacks",
      explain: "Pedidos que o cliente contestou direto com o cartão de crédito.",
      purpose: "Acompanhar as contestações no cartão, que custam dinheiro e podem trazer problemas com a plataforma de pagamento.",
      formula: "pedidos com chargeback no período",
    },
    addToCarts: {
      label: "Adições ao carrinho",
      explain: "Quantas vezes as pessoas colocaram um produto no carrinho depois de ver o anúncio (informado pelo Meta).",
      purpose: "Medir o interesse no produto entre o clique e a compra.",
      formula: "adições ao carrinho informadas pelo Meta",
    },
  } satisfies Record<string, MetricInfo>,
};

export type ChartsMessages = typeof chartsPtBR;

/** Os textos em uso. Hoje só existe o português; outro idioma entra aqui. */
export const msg: ChartsMessages = chartsPtBR;
