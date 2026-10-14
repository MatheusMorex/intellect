// O que é, para que serve e como é calculada cada métrica das tabelinhas.
// Aparece parando o mouse 3 segundos em cima do card ou no "?" dele.
// Os textos explicam; não dizem o que a pessoa deve fazer com a campanha.

export type MetricInfo = { label: string; explain: string; purpose: string; formula: string };

export const METRIC = {
  // ---- Resumo: resultado ----------------------------------------------------------------
  net: {
    label: "Faturamento líquido",
    explain: "Quanto as vendas pagas deixaram de fato no caixa, depois de tirar os reembolsos e a taxa da plataforma de pagamento.",
    purpose: "Mostrar o dinheiro que realmente entrou com as vendas. É a base para saber se a operação se paga.",
    formula: "vendas pagas − reembolsos − taxa da plataforma de pagamento",
  },
  spend: {
    label: "Gasto com anúncios",
    explain: "Quanto foi investido em anúncios no Meta e no Google no período.",
    purpose: "Ver quanto do caixa foi para anúncios e comparar com o que voltou em vendas.",
    formula: "gasto do Meta + gasto do Google no período",
  },
  roas: {
    label: "ROAS",
    explain: "Quanto voltou em faturamento para cada 1,00 investido em anúncio. ROAS 3,00 quer dizer que cada 1,00 gasto virou 3,00 em vendas; abaixo de 1,00, o anúncio custou mais do que vendeu.",
    purpose: "Comparar o retorno do investimento em anúncios entre períodos, campanhas e anúncios.",
    formula: "faturamento ÷ gasto com anúncios",
  },
  profit: {
    label: "Lucro",
    explain: "O que sobra depois de pagar os anúncios, os impostos, o custo dos produtos, as taxas adicionais e as despesas.",
    purpose: "Saber se a operação está dando dinheiro de verdade depois de todos os custos.",
    formula: "líquido − gasto − impostos − custo dos produtos − taxas adicionais − despesas",
  },
  roi: {
    label: "ROI",
    explain: "O lucro em relação ao que foi gasto com anúncios. ROI de 50% quer dizer que o lucro foi metade do valor investido.",
    purpose: "Medir o retorno do dinheiro investido em anúncios já descontando todos os custos.",
    formula: "lucro ÷ gasto com anúncios",
  },
  margin: {
    label: "Margem",
    explain: "Quanto de cada venda virou lucro. Margem de 20% quer dizer que, de cada 100,00 vendidos, 20,00 ficaram de lucro.",
    purpose: "Entender quanto sobra de cada venda e se o preço cobre os custos.",
    formula: "lucro ÷ faturamento líquido",
  },
  cpa: {
    label: "CPA",
    explain: "Custo por aquisição: quanto custou, em anúncio, cada venda paga.",
    purpose: "Saber quanto você paga em anúncio para conseguir uma venda e comparar com o que cada venda deixa de lucro.",
    formula: "gasto com anúncios ÷ vendas pagas",
  },
  ticket: {
    label: "Ticket médio",
    explain: "O valor médio de cada venda paga.",
    purpose: "Entender o valor típico de uma compra e quanto dá para investir para conseguir cada venda.",
    formula: "faturamento bruto ÷ vendas pagas",
  },

  // ---- Resumo: vendas -----------------------------------------------------------------------
  gross: {
    label: "Faturamento bruto",
    explain: "Tudo o que entrou em vendas pagas, antes de tirar a taxa da plataforma de pagamento.",
    purpose: "Ver o volume total vendido antes das taxas de pagamento.",
    formula: "vendas pagas − reembolsos parciais (sem descontar taxas)",
  },
  paid: {
    label: "Vendas pagas",
    explain: "Quantos pedidos foram pagos no período.",
    purpose: "Acompanhar quantos pedidos viraram dinheiro.",
    formula: "pedidos pagos, contados pelo dia do pedido",
  },
  pending: {
    label: "Vendas pendentes",
    explain: "Pedidos esperando pagamento, como Pix e boleto gerados e ainda não pagos, e quanto eles somam.",
    purpose: "Ver quanto ainda pode entrar se os clientes concluírem o pagamento.",
    formula: "pedidos com pagamento pendente",
  },
  refunded: {
    label: "Vendas reembolsadas",
    explain: "Pedidos em que o dinheiro voltou para o cliente.",
    purpose: "Acompanhar as devoluções, que tiram dinheiro do faturamento.",
    formula: "pedidos reembolsados no período",
  },
  refundRate: {
    label: "% Reembolso",
    explain: "De cada 100 vendas concluídas, quantas foram reembolsadas.",
    purpose: "Perceber cedo um problema com o produto, a entrega ou a expectativa do cliente.",
    formula: "reembolsados ÷ (pagos + reembolsados + chargeback)",
  },
  chargebackRate: {
    label: "% Chargeback",
    explain: "De cada 100 vendas concluídas, quantas o cliente contestou direto com o cartão de crédito.",
    purpose: "Acompanhar as contestações no cartão, que custam dinheiro e podem trazer problemas com a plataforma de pagamento.",
    formula: "chargebacks ÷ (pagos + reembolsados + chargeback)",
  },

  // ---- Resumo: custos ------------------------------------------------------------------------
  spendMeta: {
    label: "Gasto no Meta",
    explain: "Quanto foi investido em anúncios no Facebook e no Instagram.",
    purpose: "Ver quanto do investimento foi para o Meta.",
    formula: "soma do gasto das contas do Meta",
  },
  spendGoogle: {
    label: "Gasto no Google",
    explain: "Quanto foi investido em anúncios no Google (pesquisa, YouTube, Display e outros).",
    purpose: "Ver quanto do investimento foi para o Google.",
    formula: "soma do gasto das contas do Google",
  },
  productCost: {
    label: "Custos de produto",
    explain: "Quanto custaram os produtos vendidos, pelo custo cadastrado em Taxas.",
    purpose: "Descontar do lucro o que foi gasto com a mercadoria vendida.",
    formula: "custo de cada produto vendido, pelo valor que valia no dia da venda",
  },
  fees: {
    label: "Taxas adicionais",
    explain: "Custos extras por venda cadastrados em Taxas, como embalagem, brinde ou taxa de um meio de pagamento.",
    purpose: "Descontar do lucro os custos extras de cada pedido.",
    formula: "taxas fixas ou percentuais cadastradas em Taxas",
  },
  expenses: {
    label: "Despesas",
    explain: "Contas do negócio lançadas em Despesas, como ferramentas, equipe e contabilidade.",
    purpose: "Fazer o lucro considerar também os custos fixos do negócio.",
    formula: "despesas únicas e mensais lançadas em Despesas no período",
  },
  salesTax: {
    label: "Imposto sobre vendas",
    explain: "Imposto que incide sobre o faturamento, pelo percentual cadastrado em Taxas.",
    purpose: "Fazer o lucro já descontar o imposto que você vai pagar sobre o que vendeu.",
    formula: "percentual de Taxas × faturamento líquido",
  },
  metaTax: {
    label: "Imposto sobre anúncios do Meta",
    explain: "Imposto cobrado sobre o valor gasto no Meta, pelo percentual cadastrado em Taxas.",
    purpose: "Fazer o lucro descontar o imposto que incide sobre o gasto no Meta.",
    formula: "percentual de Taxas × gasto no Meta",
  },
  taxes: {
    label: "Imposto total",
    explain: "A soma de todos os impostos acima.",
    purpose: "Ver quanto do faturamento vai para impostos.",
    formula: "vendas + anúncios do Meta + impostos extras",
  },

  // ---- Meta e Google ------------------------------------------------------------------------
  adSpend: {
    label: "Gasto",
    explain: "Quanto foi investido nos anúncios desta plataforma no período.",
    purpose: "Saber quanto custou o resultado que aparece nas outras métricas.",
    formula: "soma do gasto informado pela plataforma",
  },
  adSales: {
    label: "Vendas",
    explain: "Pedidos pagos da loja que vieram dos anúncios desta plataforma, pelo rastreio do link.",
    purpose: "Ver quantas vendas os anúncios trouxeram de verdade, pelos pedidos da loja.",
    formula: "pedidos pagos atribuídos a esta plataforma",
  },
  adRevenue: {
    label: "Faturamento",
    explain: "Quanto somam os pedidos pagos que vieram dos anúncios desta plataforma.",
    purpose: "Comparar o que os anúncios trouxeram de vendas com o que custaram.",
    formula: "soma dos pedidos pagos atribuídos (líquido ou bruto, como está em Vendas e moeda)",
  },
  adRoas: {
    label: "ROAS",
    explain: "Quanto voltou em faturamento para cada 1,00 investido nesta plataforma.",
    purpose: "Comparar o retorno entre campanhas, conjuntos e anúncios.",
    formula: "faturamento ÷ gasto",
  },
  adCpa: {
    label: "CPA",
    explain: "Quanto custou, em anúncio, cada venda paga que veio desta plataforma.",
    purpose: "Saber quanto custa conseguir cada venda e comparar entre campanhas e anúncios.",
    formula: "gasto ÷ vendas",
  },
  cpm: {
    label: "CPM",
    explain: "Custo por mil impressões: quanto custou para o anúncio aparecer mil vezes.",
    purpose: "Medir o preço de aparecer para o seu público. Quando o CPM sobe, cada clique e cada venda tendem a ficar mais caros.",
    formula: "gasto ÷ impressões × 1.000",
  },
  impressions: {
    label: "Impressões",
    explain: "Quantas vezes os anúncios apareceram na tela das pessoas (a mesma pessoa pode contar mais de uma vez).",
    purpose: "Medir o tamanho da exposição comprada no período.",
    formula: "soma das impressões informadas pela plataforma",
  },
  reach: {
    label: "Alcance",
    explain: "Quantas pessoas diferentes viram os anúncios pelo menos uma vez.",
    purpose: "Saber quantas pessoas a campanha atingiu de fato, sem contar a mesma pessoa duas vezes.",
    formula: "pessoas únicas que viram o anúncio no período",
  },
  frequency: {
    label: "Frequência",
    explain: "Quantas vezes, em média, cada pessoa viu o anúncio no período.",
    purpose: "Perceber se o público está vendo o anúncio vezes demais (e cansando dele) ou poucas vezes para lembrar da oferta.",
    formula: "impressões ÷ alcance",
  },
  videoViews: {
    label: "Visualizações (3 s)",
    explain: "Quantas vezes as pessoas assistiram pelo menos aos 3 primeiros segundos dos vídeos.",
    purpose: "Medir quantas pessoas pararam de rolar a tela para olhar o vídeo.",
    formula: "visualizações de 3 segundos informadas pelo Meta",
  },
  hook: {
    label: "Hook",
    explain: "A cada 100 vezes que um anúncio em vídeo apareceu, em quantas a pessoa parou para assistir aos primeiros segundos (o Meta mede aos 3 segundos).",
    purpose: "Avaliar se o começo do vídeo prende a atenção. É o primeiro filtro: sem hook, ninguém chega na oferta.",
    formula: "visualizações de 3 s ÷ impressões dos vídeos",
  },
  hold: {
    label: "Hold 75%",
    explain: "Das visualizações de 3 segundos, quantas foram até 75% do vídeo.",
    purpose: "Avaliar se o meio do vídeo segura a atenção até a mensagem principal e a oferta.",
    formula: "visualizações até 75% do vídeo ÷ visualizações de 3 s",
  },
  clicks: {
    label: "Cliques",
    explain: "Quantas vezes as pessoas clicaram no anúncio.",
    purpose: "Medir o interesse que o anúncio gerou a ponto de levar a pessoa ao site.",
    formula: "soma dos cliques informados pela plataforma",
  },
  ctr: {
    label: "CTR",
    explain: "De cada 100 vezes que o anúncio apareceu, quantas viraram clique.",
    purpose: "Avaliar se o anúncio chama a atenção de quem vê a ponto de a pessoa clicar.",
    formula: "cliques ÷ impressões",
  },
  cpc: {
    label: "CPC",
    explain: "Custo por clique: quanto custou, em média, cada clique no anúncio.",
    purpose: "Saber quanto custa levar uma pessoa ao site.",
    formula: "gasto ÷ cliques",
  },
} satisfies Record<string, MetricInfo>;

export type MetricKey = keyof typeof METRIC;
