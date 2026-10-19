// Textos dos botões "?" (components/ds/help-tip.tsx), num lugar só. Cada
// explicação responde "o que é isto e para que serve" em linguagem simples,
// para a pessoa não precisar perguntar a ninguém.

type Entry = { title: string; body: string[] };

export const HELP = {
  // ---- início, workspace e pessoas ---------------------------------------------------------
  inicio: {
    title: "Início",
    body: [
      "A primeira tela do workspace: seus prazos da semana, os quadros favoritos, os que você abriu por último, todos os quadros do time e os dashboards de vendas.",
      "Use o botão “Criar quadro” para começar um projeto novo. Em Configurações dá para escolher outra tela para abrir depois de entrar.",
    ],
  },
  "inicio-prazos": {
    title: "Seus prazos nos próximos 7 dias",
    body: ["Os cards em que você está e que vencem nos próximos 7 dias, do mais próximo para o mais distante. Clique num card para abrir."],
  },
  "inicio-favoritos": {
    title: "Favoritos",
    body: ["Os quadros que você marcou com a estrela. Eles também aparecem primeiro no menu lateral. Para marcar ou desmarcar, passe o mouse no quadro e clique na estrela."],
  },
  "inicio-recentes": {
    title: "Vistos recentemente",
    body: ["Os últimos quadros que você abriu, para voltar rápido ao que estava fazendo."],
  },
  "inicio-quadros": {
    title: "Quadros do workspace",
    body: [
      "Todos os quadros que você pode ver. Quadro “Workspace” todo mundo do time vê; quadro “Privado” só quem foi convidado.",
      "Quadros fechados ficam numa lista à parte, onde dá para reabrir ou apagar de vez.",
    ],
  },
  "inicio-dashboards": {
    title: "Dashboards de vendas",
    body: ["Cada dashboard junta uma loja e as contas de anúncio de uma operação. Abra para ver o Resumo com faturamento, gasto, ROAS e lucro."],
  },
  "meus-cards": {
    title: "Meus cards",
    body: [
      "Todos os cards em que você está, de todos os quadros, num lugar só.",
      "“Por quadro” agrupa pelo quadro de cada card; “Por prazo” mostra primeiro o que está atrasado e o que vence logo. Atalho: tecla Q.",
    ],
  },
  membros: {
    title: "Membros do workspace",
    body: [
      "Quem faz parte do workspace. Admin muda as configurações, convida pessoas, mexe nas integrações e nos custos; membro vê os dashboards e trabalha nos quadros.",
      "Para trazer alguém, use o convite por e-mail ou gere um link que vale por 30 dias.",
    ],
  },
  workspace: {
    title: "Configurações do workspace",
    body: [
      "O nome e a descrição do workspace, e o domínio de e-mail permitido nos convites.",
      "Com um domínio (por exemplo, suaempresa.com.br), só e-mails desse domínio podem ser convidados. Só admins mudam estas configurações.",
    ],
  },

  // ---- quadro e card -------------------------------------------------------------------------
  quadro: {
    title: "Como funciona o quadro",
    body: [
      "O quadro é dividido em listas (colunas), e cada lista tem cards (tarefas). Arraste um card para mudar de lista ou de posição; pelo teclado, selecione com Espaço e mova com as setas.",
      "Na barra do quadro: a estrela marca como favorito, o filtro mostra só alguns cards, Automação abre as regras automáticas, e o menu “…” tem o fundo, as etiquetas, as configurações e os itens arquivados.",
      "Tudo o que alguém muda aparece na hora para quem está com o quadro aberto.",
    ],
  },
  "quadro-fundo": {
    title: "Fundo do quadro",
    body: [
      "Escolha uma das 25 cores ou importe uma imagem do seu computador (JPG, PNG ou WebP). O fundo vale para todo mundo que abre este quadro.",
      "A imagem é reduzida antes de enviar, para carregar rápido. Escolher uma cor de novo tira a imagem.",
    ],
  },
  "card-descricao": {
    title: "Descrição",
    body: ["O que precisa ser feito, com detalhes. Aceita negrito, listas e links. Para salvar, clique em Salvar ou use Ctrl+Enter."],
  },
  "card-checklist": {
    title: "Checklist",
    body: ["Uma lista de passos dentro do card. Marque cada item quando terminar; a barra mostra quanto já foi feito. Um item pode ter prazo e uma pessoa responsável."],
  },
  "card-atividade": {
    title: "Comentários e atividade",
    body: [
      "A conversa do card e o histórico do que mudou nele.",
      "Escreva @ e o nome de alguém para avisar a pessoa: ela recebe uma notificação no sino.",
    ],
  },
  "card-metricas": {
    title: "Métricas do card",
    body: [
      "Quando o card está ligado a uma campanha, um conjunto ou um anúncio, aqui aparece o ROAS, o gasto, o faturamento e as vendas dos últimos 7 dias.",
      "Os valores ficam na moeda do dashboard. Sem gasto ou sem venda no período, o ROAS aparece como 0,00.",
    ],
  },
  automacao: {
    title: "Automação",
    body: [
      "Regras que fazem o trabalho repetido sozinhas. Há seis tipos:",
      "Regra: age quando algo acontece num card (criado, movido, com etiqueta nova…). Regra por métrica: olha os números das campanhas de tempos em tempos e age nos cards ligados a elas. Programada: roda num dia e hora fixos. Por data de entrega: roda antes ou depois do prazo dos cards. Botão do card e botão do quadro: fazem várias ações com um clique.",
      "O interruptor ao lado de cada uma liga e desliga sem apagar.",
    ],
  },
  "automacao-historico": {
    title: "Histórico de execuções",
    body: ["Cada vez que uma automação rodou: quando, em qual card, se deu certo e o motivo quando não deu. Use os filtros para ver só os erros."],
  },

  // ---- vendas e tracking ------------------------------------------------------------------
  resumo: {
    title: "Resumo",
    body: [
      "O retrato da operação no período escolhido: quanto vendeu, quanto gastou em anúncio, o que sobrou de lucro e de onde vieram as vendas.",
      "Mude o período no botão de datas e use os filtros para olhar só uma conta de anúncio, uma fonte de tráfego ou um produto.",
      "Cada número tem o próprio “?” explicando o que ele quer dizer e como é calculado. Sem venda ou gasto no período, os valores aparecem zerados.",
    ],
  },
  "resumo-resultado": {
    title: "Resultado",
    body: [
      "Os números que dizem se a operação está dando dinheiro: faturamento, gasto com anúncio, retorno (ROAS e ROI), lucro e margem.",
      "A seta embaixo de cada valor compara com o mesmo número de dias logo antes. Verde é melhora, vermelho é piora.",
    ],
  },
  "resumo-vendas": {
    title: "Vendas",
    body: ["Quantos pedidos foram pagos, quantos estão esperando pagamento e quantos voltaram como reembolso ou chargeback."],
  },
  "resumo-custos": {
    title: "Custos",
    body: [
      "Tudo o que sai do faturamento antes de virar lucro: anúncios, custo dos produtos, taxas, despesas e impostos.",
      "Os percentuais de imposto, as taxas e o custo de cada produto são cadastrados em Taxas. As contas fixas, em Despesas.",
    ],
  },
  paineis: {
    title: "Painéis",
    body: [
      "Gráficos da operação ao longo do tempo: cartões com os números principais, linhas, colunas e rankings por campanha, conta, produto e origem.",
      "Cada dashboard pode ter vários painéis, em abas (por exemplo “Visão geral”, “Tráfego” e “Equipe”). O administrador cria um painel do zero ou a partir de um modelo pronto, e em “Editar painel” arrasta e redimensiona os gráficos, adiciona, muda e remove; tudo é salvo sozinho.",
      "No menu “…” de cada painel, o administrador escolhe quem pode ver (todo o workspace ou só algumas pessoas), se os membros podem mudar o período e os filtros e com que filtros o painel abre. Cada gráfico também pode ter período próprio ou ignorar os filtros do painel.",
      "“Exportar”, em cada gráfico, baixa a imagem (PNG) ou os dados (CSV, que abre direto no Excel).",
      "A pizza e a rosca mostram quanto cada parte é do total (a rosca traz o total no centro). No treemap, o tamanho de cada retângulo é o gasto e a cor é o ROAS; clique num retângulo com ▶ para ver o que tem dentro e use o caminho embaixo dele para voltar.",
      "O funil mostra quantos passam de uma etapa para a outra e destaca a maior perda: o de vendas vai das impressões à venda paga; o do quadro conta até que lista os cards criados no período chegaram. O cronograma (Gantt) mostra os cards com data; clique numa barra para abrir o card.",
      "“Agrupar por” decide se cada ponto é uma hora, um dia, uma semana, uma quinzena, um mês ou um ano. No automático, o INtellect escolhe pelo tamanho do período. Por hora dá para ver até 31 dias.",
      "“Comparar com” mostra a variação contra o período anterior, o mesmo período do ano anterior ou datas que você escolher. Verde é melhora e vermelho é piora, conforme a métrica: CPA caindo é verde.",
      "O trecho tracejado e a faixa “Parcial” marcam o período que ainda não terminou (hoje, este mês), para ninguém comparar um mês pela metade com um mês fechado.",
      "Os filtros e escolhas desta tela valem só para você e ficam no endereço da página: dá para mandar o link para alguém ver a mesma coisa.",
    ],
  },
  "trafego-meta": {
    title: "Meta",
    body: [
      "Gasto, vendas, faturamento, lucro e ROAS das campanhas do Facebook e do Instagram, com as vendas que chegaram da loja.",
      "As abas mudam o nível: contas, campanhas, conjuntos ou anúncios. Clique num nome para abrir o que está dentro dele.",
      "O interruptor de cada linha liga ou pausa a campanha, o lápis muda o orçamento diário, e “Colunas” escolhe o que aparece na tabela. Pelo menu de cada linha dá para criar um card ligado a ela.",
    ],
  },
  "trafego-google": {
    title: "Google",
    body: [
      "Gasto, vendas, faturamento, lucro e ROAS das campanhas do Google, com as vendas que chegaram da loja.",
      "As abas mudam o nível: contas, campanhas, grupos, anúncios ou palavras-chave. A aba de palavras-chave mostra quais buscas trouxeram venda, não só clique.",
      "O interruptor de cada linha liga ou pausa a campanha, o lápis muda o orçamento diário, e “Colunas” escolhe o que aparece na tabela.",
    ],
  },
  "trafego-numeros": {
    title: "Números do período",
    body: [
      "Os totais de tudo o que está na tabela abaixo, no período escolhido: o que foi gasto, o que voltou em vendas e como as pessoas reagiram aos anúncios.",
      "Pare o mouse 3 segundos em cima de qualquer número para ver o que ele é e para que serve.",
    ],
  },
  "leitura-anuncios": {
    title: "Leitura dos anúncios",
    body: [
      "Frases que explicam o que os números de cada item estão dizendo: alcance e frequência, visualizações do vídeo, hook, hold, CPM e CPA.",
      "Cada número é comparado com a média da conta no mesmo período. Quando existe uma referência conhecida no mercado (frequência de 2 a 3, hook acima de 25% a 30%), ela aparece como algo a considerar. A decisão do que fazer é sempre sua.",
      "O hook usa as visualizações de 3 segundos, que é como o Meta mede o começo do vídeo; o hold de 75% conta quantas dessas visualizações chegaram a 75% do vídeo.",
    ],
  },
  vendas: {
    title: "Vendas",
    body: [
      "Todos os pedidos da loja no período, com a situação (pago, pendente, reembolsado…) e de qual campanha cada um veio.",
      "“Não rastreada” quer dizer que o pedido chegou sem os parâmetros de rastreio no link. Clique num pedido para ver os itens e a jornada até a compra.",
    ],
  },
  pedido: {
    title: "Detalhe do pedido",
    body: [
      "A situação do pedido, os itens, o valor, a forma de pagamento e de onde o cliente veio.",
      "A jornada mostra a primeira e a última visita antes da compra. A última é a que conta para dizer qual campanha trouxe a venda. Nenhum dado pessoal do comprador fica guardado: para ver nome e endereço, use “Abrir na Shopify”.",
    ],
  },
  taxas: {
    title: "Taxas",
    body: [
      "Aqui ficam os custos que o INtellect desconta de cada venda para chegar no lucro de verdade: impostos, taxas por pedido e o custo de cada produto.",
      "Mudar um valor não reescreve o passado: cada mudança vale a partir da data escolhida, e as vendas antigas continuam com o valor da época.",
    ],
  },
  "taxas-impostos": {
    title: "Impostos",
    body: [
      "O percentual de imposto sobre as vendas (por exemplo, o do Simples Nacional) e o imposto cobrado sobre o gasto no Meta.",
      "Impostos extras servem para qualquer outro percentual que incida sobre o faturamento.",
    ],
  },
  "taxas-adicionais": {
    title: "Taxas adicionais",
    body: [
      "Custos por venda que não são imposto, como embalagem, brinde, frete pago por você ou a taxa de antecipação do cartão.",
      "Podem ser um valor fixo por pedido (ou por unidade de um produto) ou um percentual do valor do pedido, e valer para todos os pedidos, para um produto ou para uma forma de pagamento.",
    ],
  },
  "taxas-produtos": {
    title: "Custo por produto",
    body: [
      "Quanto custa para você cada unidade de cada produto. Com o custo cadastrado, o lucro desconta o que foi gasto com a mercadoria vendida.",
      "Os produtos aparecem sozinhos aqui depois da primeira venda que chega da loja.",
    ],
  },
  despesas: {
    title: "Despesas",
    body: [
      "Contas do negócio que não são anúncio: ferramentas, equipe, contabilidade, aluguel. Entram no lucro do Resumo.",
      "Uma despesa pode ser única (cai num dia) ou mensal (repete no mesmo dia de cada mês, até a data final, se houver).",
      "Cada despesa aparece na moeda em que foi lançada; os totais, na moeda do dashboard, pela cotação do dia de cada uma.",
    ],
  },
  integracoes: {
    title: "Integrações",
    body: [
      "Onde o dashboard se conecta com as contas de anúncio (Meta e Google) e com a loja (Shopify), e onde ficam os parâmetros de rastreio.",
      "Sem essas conexões o Resumo fica zerado: é daqui que vêm o gasto e as vendas.",
    ],
  },
  "integ-anuncios": {
    title: "Contas de anúncio",
    body: [
      "A conexão com a plataforma e as contas de anúncio dela. O interruptor de cada conta escolhe se ela entra nos números deste dashboard.",
      "A conexão tem validade: quando estiver perto de vencer, aparece um aviso para conectar de novo.",
    ],
  },
  "integ-loja": {
    title: "Loja",
    body: [
      "A loja Shopify ligada ao dashboard. Cada pedido feito nela chega aqui na hora, por webhook (um aviso automático que a Shopify manda).",
      "“Entregas com problema” conta os avisos que chegaram mas não deu para processar.",
    ],
  },
  "integ-meta-url": {
    title: "Parâmetros de URL do Meta",
    body: [
      "Este texto vai no campo “Parâmetros de URL” dos anúncios do Meta. É ele que diz ao INtellect de qual campanha, conjunto e anúncio veio cada venda.",
      "Copie com o botão e cole no anúncio (ou no nível da campanha). Sem ele, as vendas aparecem como “não rastreadas”.",
    ],
  },
  "integ-google-url": {
    title: "Sufixo de URL final do Google",
    body: [
      "Este texto vai em Configurações da conta do Google Ads, no campo “Sufixo de URL final”. Ele vale para todas as campanhas da conta e permite ligar cada venda à campanha, ao grupo e à palavra-chave.",
    ],
  },
  "integ-utm-organico": {
    title: "UTMs para tráfego orgânico",
    body: [
      "Monta um link com UTMs para usar fora dos anúncios: link na bio, WhatsApp, e-mail, parceiro. A venda que vier dele aparece em “Outras fontes” com a origem certa.",
    ],
  },
  "integ-teste": {
    title: "Testar a integração",
    body: [
      "Gera um link de teste para conferir se o rastreio funciona antes de investir. Abra o link numa janela anônima e faça uma compra de teste.",
      "O pedido de teste aparece aqui e não entra nos números do dashboard.",
    ],
  },
  "integ-testes-lista": {
    title: "Últimos testes",
    body: ["Os testes feitos e a situação de cada um: esperando o pedido, recebido sem campanha (o rastreio não chegou) ou recebido e atribuído (está tudo certo)."],
  },

  // ---- configurações e perfil ---------------------------------------------------------------
  configuracoes: {
    title: "Configurações",
    body: [
      "Tudo o que dá para ajustar no INtellect, separado em abas.",
      "Aparência: tema, plano de fundo, menu lateral, frase em destaque no Início e tela inicial. Perfil e preferências: foto, nome, fuso, atalhos e e-mails. Vendas e moeda: como o dashboard calcula e em que moeda mostra os valores. Workspace: nome e regras de convite.",
    ],
  },
  "config-tema": {
    title: "Tema",
    body: ["Claro, escuro ou igual ao do seu computador (muda sozinho quando o computador muda). Vale para todas as telas."],
  },
  "config-plano-de-fundo": {
    title: "Plano de fundo",
    body: [
      "Uma imagem do seu computador atrás das telas do INtellect, como papel de parede. Só você vê o seu plano de fundo; cada quadro tem o próprio fundo, no menu do quadro.",
      "“Quanto o tema cobre a imagem” deixa a imagem mais forte ou mais suave: mais alto, os textos ficam mais fáceis de ler. O desfoque também ajuda na leitura.",
    ],
  },
  "config-navegacao": {
    title: "Navegação",
    body: [
      "O menu lateral pode ficar aberto ou só com os ícones; ele nunca recolhe sozinho. O botão com a flecha no meio da borda do menu faz a mesma coisa.",
      "A frase em destaque no topo do Início pode ser escondida, e a tela que abre depois do login pode ser o Início, Meus cards ou o Resumo de vendas.",
    ],
  },
  "config-dashboard-nome": {
    title: "Nome do dashboard",
    body: ["Como o dashboard aparece no menu lateral e no Início. Use o nome da loja ou da operação."],
  },
  "config-moeda": {
    title: "Moeda",
    body: [
      "Em que moeda o dashboard mostra os valores: real, euro, libra esterlina, franco suíço ou dólar americano.",
      "Se a loja vende numa moeda e a conta de anúncio cobra em outra (dólar, por exemplo), o INtellect converte tudo para a moeda escolhida pela cotação de referência do Banco Central Europeu do dia de cada valor. No fim de semana e no feriado, vale a cotação do último dia útil.",
      "Despesas, taxas e custos já lançados continuam na moeda em que foram cadastrados e são convertidos do mesmo jeito.",
    ],
  },
  "config-fuso": {
    title: "Fuso horário do dashboard",
    body: ["Decide o que é “hoje” e “ontem” nos números: uma venda às 23h30 entra no dia certo do seu fuso. Use o fuso de onde a operação acontece."],
  },
  "config-semana": {
    title: "Início da semana",
    body: [
      "Em que dia a semana começa quando os gráficos dos Painéis agrupam os números por semana.",
      "Segunda a domingo é o padrão internacional (ISO 8601). Domingo a sábado é como muitos calendários do Brasil e dos Estados Unidos mostram a semana.",
    ],
  },
  "config-faturamento": {
    title: "Faturamento usado nas contas",
    body: [
      "Líquido tira a taxa que a plataforma de pagamento cobra de cada venda; bruto usa o valor que o cliente pagou.",
      "A escolha muda o ROAS, o lucro e a margem do Resumo e das campanhas.",
    ],
  },
  "config-juros": {
    title: "Juros do parcelamento",
    body: ["Quando o cliente parcela no cartão com juros, ele paga a mais do que o preço do produto. Ligado, esses juros contam como faturamento; desligado, ficam de fora."],
  },
  "config-plataformas": {
    title: "Plataformas de anúncio",
    body: ["Quais plataformas este dashboard usa. Só as marcadas aparecem no menu lateral (Meta e Google) e nos números de gasto."],
  },
  perfil: {
    title: "Perfil e preferências",
    body: ["Sua foto, seu nome, como as pessoas mencionam você e as preferências que valem só para você, como atalhos de teclado e e-mails de aviso."],
  },
  "perfil-foto": {
    title: "Foto de perfil",
    body: [
      "Importe uma imagem do seu computador. O centro da imagem vira um quadrado e aparece no menu, nos cards e nos comentários.",
      "Sem foto, aparecem as iniciais do seu nome. Só pessoas do seu workspace veem a sua foto.",
    ],
  },
  "perfil-dados": {
    title: "Seus dados",
    body: [
      "O nome aparece nos cards e comentários. O @ é como as pessoas mencionam você (por exemplo, @ana).",
      "O fuso horário acerta os horários de prazos e notificações para onde você está.",
    ],
  },
  "perfil-preferencias": {
    title: "Preferências",
    body: ["Ajustes que valem só para você: cores e animações, atalhos de teclado e com que frequência o INtellect manda e-mail."],
  },
  "pref-daltonicos": {
    title: "Modo para daltônicos",
    body: ["As etiquetas dos cards ganham padrões desenhados além da cor. Assim dá para diferenciar uma da outra sem depender só da cor."],
  },
  "pref-animacoes": {
    title: "Reduzir animações",
    body: ["Tira os movimentos e transições da tela, como o deslizar das janelas. Bom para quem sente enjoo ou prefere a tela parada."],
  },
  "pref-atalhos": {
    title: "Atalhos de uma tecla",
    body: ["Com isto ligado, uma tecla só faz uma ação: / abre a busca, F abre o filtro do quadro e Q leva para Meus cards. O ícone de teclado na barra de cima mostra todos os atalhos."],
  },
  "pref-emails": {
    title: "E-mails de notificação",
    body: ["Quando alguém menciona você, coloca você num card ou um prazo chega perto: “Na hora” manda um e-mail para cada aviso, “Um resumo por hora” junta tudo, e “Nunca” deixa só o sino do INtellect."],
  },
} satisfies Record<string, Entry>;

export type HelpTopic = keyof typeof HELP;
