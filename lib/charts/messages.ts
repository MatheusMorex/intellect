// Textos dos Painéis em português do Brasil. Ficam todos aqui, fora do código,
// para a tradução futura: outro idioma é outro objeto com as mesmas chaves.
// As métricas que já existem no glossário (lib/metrics-glossary.ts) usam os
// textos de lá; aqui ficam só as novas.

import type { Dimension } from "@/lib/charts/catalog";
import type { CompareMode, Granularity, PanelPeriodId, WeekStart } from "@/lib/charts/options";
import type { WidgetType } from "@/lib/charts/widgets";
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

  /** Por onde um gráfico de barras abre a métrica. */
  dimension: {
    platform: "Plataforma",
    adAccount: "Conta de anúncio",
    campaign: "Campanha",
    product: "Produto",
    paymentMethod: "Forma de pagamento",
    utmSource: "Origem (utm_source)",
    utmMedium: "Mídia (utm_medium)",
    utmCampaign: "Campanha (utm_campaign)",
    utmContent: "Conteúdo (utm_content)",
  } satisfies Record<Dimension, string>,

  /** Linha das vendas que não têm aquela informação (ficam juntas, para a soma bater com o total). */
  withoutValue: {
    adAccount: "Sem conta de anúncio",
    campaign: "Sem campanha",
    utm: "Sem UTM",
  },

  /** Tipos de gráfico, com a dica "Quando usar". */
  widgetType: {
    kpi: {
      label: "Cartão de KPI",
      whenToUse: "Um número que você acompanha sempre, com a variação contra o período de comparação, a tendência e, se quiser, uma meta.",
    },
    line: {
      label: "Gráfico de linhas",
      whenToUse: "Ver a tendência ao longo do tempo e comparar a evolução de até 4 métricas. Com unidades diferentes, cada uma ganha o próprio eixo.",
    },
    column: {
      label: "Gráfico de colunas",
      whenToUse: "Comparar valores entre dias, semanas ou meses e ver do que um total é feito (colunas empilhadas).",
    },
    bar: {
      label: "Gráfico de barras",
      whenToUse: "Rankings e comparações entre itens com nomes longos, como campanhas e produtos.",
    },
  } satisfies Record<WidgetType, { label: string; whenToUse: string }>,

  panel: {
    title: "Painéis",
    sections: { kpis: "Números principais", charts: "Gráficos" },
    filters: { account: "Conta de anúncio", source: "Fonte de tráfego", product: "Produto" },
    granularityAdjusted: "Agrupamento ajustado",
    compareTitle: "Comparação",
    fx: {
      title: "Não deu para buscar a cotação do dia",
      body: (currency: string) =>
        `Este dashboard mostra os valores em ${currency}, e parte dos pedidos, gastos ou custos está em outra moeda. Sem a cotação, os números ficariam errados, então eles não aparecem. Confira a internet e tente de novo em alguns minutos.`,
      retry: "Tentar de novo",
    },
    granularity: "Agrupar por",
    automatic: (label: string) => `Automático (${label.toLowerCase()})`,
    compare: "Comparar com",
    compareDates: "Datas da comparação",
    compareDatesApply: "Comparar",
    compareDatesMissing: "Escolha as datas do período de comparação para ver a variação.",
    compareUnavailable: "“Todo o período” não tem um período anterior para comparar. Escolha outro período ou compare com datas escolhidas.",
    /** Texto depois da variação no cartão: "+12,4% vs. período anterior". */
    versus: {
      previous: "vs. período anterior",
      year: "vs. mesmo período do ano anterior",
      custom: "vs. período escolhido",
    } satisfies Record<Exclude<CompareMode, "off">, string>,
    /** Nome da série de comparação no gráfico: "Faturamento líquido (período anterior)". */
    compareSeries: {
      previous: "período anterior",
      year: "ano anterior",
      custom: "comparação",
    } satisfies Record<Exclude<CompareMode, "off">, string>,
    compareRange: (range: string) => `Comparando com ${range}.`,
    empty: {
      title: "Ainda não há dados neste período",
      description: "Escolha outro período, tire algum filtro ou confira as integrações do dashboard.",
    },
    emptyDailyOnly: {
      title: "Este gráfico não existe por hora",
      description: "O gasto com anúncios, os impostos e as despesas chegam por dia. Escolha agrupar por dia para ver este gráfico.",
    },
    error: {
      title: "Não deu para carregar este gráfico",
      description: "Algo deu errado ao buscar os números. Os outros gráficos continuam valendo.",
      retry: "Tentar de novo",
    },
    loading: "Carregando o gráfico…",
    notes: {
      hourUnavailable: "O gasto, as impressões, os cliques, os impostos e as despesas chegam por dia: por hora, eles aparecem sem dado.",
      expensesFiltered: "As despesas não entram quando há filtro de conta, produto ou fonte (não dá para dividir uma conta de luz).",
      productRevenue: "Por produto, o faturamento é a soma dos itens pagos, como em “Vendas por produto” do Resumo.",
      expensesByItem: "As despesas não se dividem por item: ficam de fora do lucro de cada linha.",
      percent: "Cada coluna soma 100%: a altura mostra a participação de cada parte no total daquele período.",
      stackedCompare: "Nas colunas empilhadas, a comparação aparece na dica de cada coluna.",
    },
    average: {
      /** Linha de média de uma métrica somável: o total dividido pelo número de dias, semanas... */
      sum: (granularity: string) => `Média por ${granularity.toLowerCase()}`,
      /** Linha de média de uma taxa: a taxa do período inteiro, refeita dos totais. */
      rate: "Média do período",
    },
    goal: "Meta",
    kpi: {
      goal: (percent: string, target: string) => `${percent} da meta de ${target}`,
      alert: "Em alerta",
      alertBelow: (value: string) => `abaixo de ${value}`,
      alertAbove: (value: string) => `acima de ${value}`,
      trend: (granularity: string) => `Tendência por ${granularity.toLowerCase()}`,
    },
    table: {
      show: "Ver como tabela",
      hide: "Ver como gráfico",
      time: "Período",
      category: "Item",
      compareNote: (name: string) => `Em cinza: ${name} e a variação.`,
    },
    legendHint: "Clique na legenda para esconder ou mostrar uma série.",
    footer: (label: string, description: string) =>
      `${label}, ${description}, no fuso do dashboard. As vendas contam pelo dia do pedido; o gasto, pelo dia informado pela plataforma.`,
  },

  /** Erros na configuração de um widget (o editor da Fase 5 mostra estes textos). */
  widgetError: {
    id: "O identificador do widget usa só letras minúsculas, números e hífen (até 40).",
    metric: "Escolha uma métrica da lista.",
    dimension: "Escolha por onde abrir a métrica: campanha, conta, produto...",
    textTooLong: (max: number) => `Use até ${max} caracteres.`,
    seriesMin: "Escolha pelo menos uma métrica.",
    seriesMax: (max: number) => `Dá para mostrar até ${max} métricas neste gráfico.`,
    repeated: "A mesma métrica aparece duas vezes.",
    leftAxisEmpty: "Coloque pelo menos uma métrica no eixo esquerdo.",
    mixedUnits: "Métricas de unidades diferentes (R$, %, x) não podem dividir o mesmo eixo: use o outro eixo ou outro gráfico.",
    stackRates: "Só métricas somáveis (faturamento, gasto, pedidos...) podem ser empilhadas. Taxas como ROAS e CPA não se somam.",
    dimensionMetric: (metric: string, dimension: string) => `“${metric}” não pode ser aberta por ${dimension.toLowerCase()}.`,
    goalPositive: "A meta precisa ser maior que zero.",
    goalDashboardMoney: "A meta de faturamento do dashboard só vale para métricas em dinheiro.",
    goalAxis: "A linha de meta precisa ficar num eixo que tenha alguma métrica.",
    topN: "Escolha mostrar de 1 a 50 itens.",
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
