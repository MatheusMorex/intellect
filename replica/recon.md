# Recon map: Trello + UTMify, um app combinado (web)

Escopo: o núcleo do Trello (workspaces, quadros, listas, cards com arrastar e
soltar, verso do card, convites) mais a automação no estilo Butler (regras,
botões, agendadas, por data de entrega), juntos com o núcleo da UTMify:
vendas chegando por webhook do checkout, gasto puxado da API de anúncios,
dashboards com faturamento, gasto, ROAS, lucro e CPA por campanha, conjunto e
anúncio, e o script de UTMs. Mais a cola entre os dois: cards ligados a
campanhas e automações disparadas por métricas.
Para: uso interno da INtellect. Time pequeno, sem cadastro público, sem cobrança.
Plataforma: web, primeiro desktop, com layout responsivo. Apps móveis ficam de fora.
Data: 2026-10-11, atualizado em 2026-10-12
Decidido com o usuário em 2026-10-11: o checkout é a **Shopify**; os anúncios
são no **Meta Ads** e no **Google Ads**.
Em 2026-10-12 o usuário entregou dois levantamentos de funções, um da UTMify
e um do Trello (fontes 26 e 27). Eles foram escritos como prompts para
construir dois apps separados; o escopo continua sendo **um app só**.

## Regras e termos (ler antes de qualquer coisa)

- **Trello.** O Atlassian Customer Agreement, §2.2(d), proíbe usar os produtos
  para "develop a similar or competing product or service". Por isso **este
  recon não acessou nenhuma conta do Trello**: as fontes 1 a 9 são páginas
  públicas, documentação de suporte e a REST API pública. Em 2026-10-12 o
  usuário entregou um levantamento do Trello feito por ele com o Claude in
  Chrome (fonte 27). A decisão de fazer e usar esse levantamento é do
  usuário.
- **UTMify.** Os termos de uso não estão em página pública (`/termos-de-uso`
  dá 404, e o app é uma SPA atrás de login) e **continuam não lidos**. O
  levantamento da fonte 26 foi feito pelo usuário na conta dele.
- **Identidade própria.** Os dois levantamentos pedem marca, logo, cores,
  textos e layout próprios. Daqui vêm só as funções.
- **O que é visto e o que é inferido.** Este recon não viu nenhuma tela
  logada. As telas da UTMify agora descrevem o que o levantamento do usuário
  encontrou na conta real (marcado "visto"). Os estados (vazio, erro,
  carregando) quase nunca aparecem nos levantamentos e continuam "inferidos".
- **Cuidado com o nome parecido:** `utmize.help.center` é a central de ajuda
  da **Utmize**, um concorrente, e não da UTMify. Não foi usada como fonte.

## Fontes

| # | fonte | URL | o que deu |
| --- | --- | --- | --- |
| 1 | Trello: preços | https://trello.com/pricing | planos e o que é pago: visões, campos personalizados, espelhamento, cota de automação |
| 2 | Trello: guia | https://trello.com/guide | capítulos do produto: quadros, Inbox, Planner, templates, Power-Ups, automação |
| 3 | Trello: permissões | https://trello.com/guide/permissions-controls | visibilidade do quadro e do workspace, papéis, convites |
| 4 | Trello: automação (visão geral) | https://support.atlassian.com/trello/docs/automation-overview/ | 5 tipos de automação, construtores, variáveis, logs |
| 5 | Trello: variáveis de automação | https://support.atlassian.com/trello/docs/automation-variables/ | catálogo completo de variáveis (`{cardname}`, `{date}`, prefixos `{trigger}`, `{found}`) |
| 6 | Trello: cotas e limites | https://support.atlassian.com/trello/docs/butler-quotas-and-limits/ | 20 ações por execução, 20 botões de card e 20 de quadro, 64000 caracteres de automação |
| 7 | Trello: gatilhos e ações | resumo de busca em support.atlassian.com e community.atlassian.com | categorias de gatilhos e de ações. **Não lido na íntegra**: confiança média |
| 8 | Trello: REST API, definição dos objetos | https://developer.atlassian.com/cloud/trello/guides/rest-api/object-definitions/ | modelo de dados: Board, Card (`pos` float, `closed`, `idShort`, descrição de até 16384 caracteres), Action, Attachment, Member |
| 9 | Atlassian Customer Agreement | https://www.atlassian.com/legal/atlassian-customer-agreement | §2.2(d): proibição de usar o produto para construir um concorrente |
| 10 | UTMify: site | https://utmify.com.br | o slogan: "Trackeie suas vendas de forma precisa!" |
| 11 | UTMify: App Store | https://apps.apple.com/br/app/utmify/id6504533155 | descrição completa das funcionalidades; nota 4,9 com cerca de 3.000 avaliações; reclamações (app desloga, vendas que às vezes não trackeiam) |
| 12 | UTMify: API de envio de vendas | https://docs.utmify.com.br/envio-de-vendas | payload completo do pedido: status, método de pagamento, cliente, produtos, UTMs, comissão, moeda, `isTest` |
| 13 | UTMify: API de consulta de dados | https://docs.utmify.com.br/consulta-de-dados.md | todas as métricas do "Resumo", os filtros, as fontes de tráfego e os nomes de planos (Monster/Scale/Enterprise) |
| 14 | UTMify: central de ajuda | https://utmify.help.center/ | categorias: Configuração Inicial, Configuração de UTMs, Pixel, Integrações via API, WhatsApp, Afiliados, Principais Dúvidas, Problema de Trackeamento. A maioria dos artigos carrega por JS e não foi possível ler |
| 15 | UTMify: artigo sobre vendas não trackeadas | https://utmify.help.center/article/1024-possiveis-solucoes-para-o-problema-de-trackeamento-de-vendas | o script de UTMs, as causas (UTM inválida, vazia, outras fontes) e o `utm_source` manual para tráfego orgânico |
| 16 | Monetizze: integração com a UTMify | https://help.monetizze.com.br/books/integracoes/page/integracao-utmify | fluxo do postback: URL gerada na UTMify mais o token da plataforma, com escolha de eventos |
| 17 | Kiwify: API de webhooks | https://docs.kiwify.com.br/api-reference/webhooks/create | exemplo de eventos de checkout: `compra_aprovada`, `pix_gerado`, `compra_reembolsada`, `chargeback` |
| 18 | utmpixel.com: análise da UTMify (set/2026) | https://utmpixel.com/ferramentas/utmify | terceiro: rastreamento server-side via CAPI, preço sob consulta |
| 19 | Busca: lista de integrações da UTMify | resumo de busca | Meta Ads, Hotmart, Kiwify, Cartpanda, Vega, Kirvano, Shopify, PerfectPay, Yampi, Lastlink, Stripe. Confiança média |
| 20 | Shopify: CustomerJourneySummary | https://shopify.dev/docs/api/admin-graphql/2026-10/objects/CustomerJourneySummary | primeira e última visita antes do pedido, janela de 30 dias, `daysToConversion` |
| 21 | Shopify: UTMParameters / CustomerVisit | https://shopify.dev/docs/api/admin-graphql/2026-10/objects/UTMParameters | `source`, `medium`, `campaign`, `content`, `term` e a `landingPage` de cada visita |
| 22 | Shopify: webhooks de pedido | https://shopify.dev/docs/agents/orders/order-webhooks | cabeçalhos: HMAC-SHA256, `X-Shopify-Webhook-Id` para deduplicar, `X-Shopify-Event-Id` |
| 23 | Shopify: criar app no Dev Dashboard | https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard | apps criados no admin não podem mais ser criados; app novo no Dev Dashboard, instalado por OAuth; dados protegidos de cliente exigem aprovação |
| 24 | Google Ads: parâmetros ValueTrack | https://support.google.com/google-ads/answer/6305348?hl=pt-BR | `{campaignid}`, `{adgroupid}`, `{creative}`, `{keyword}`, `{matchtype}`, `{network}`, `{device}`, `{gclid}` |
| 25 | Google Ads API: developer token | https://developers.google.com/google-ads/api/docs/api-policy/developer-token | níveis Test, Basic e Standard; Basic exige verificação de marca do projeto no Google Cloud; MCC só para várias contas |
| 26 | UTMify: levantamento do usuário (2026-10-12) | colado no chat, feito com o Claude in Chrome na conta do usuário | menu completo (17 páginas), filtros, cards do Resumo, colunas das tabelas de tráfego, abas de Integrações, formulário de Regras, Taxas, Despesas, Relatórios, Eventos, Notificações, Conta, Avançado e as fórmulas que o levantamento atribui ao app |
| 27 | Trello: levantamento do usuário (2026-10-12) | colado no chat, feito pelo usuário com o Claude in Chrome | barra superior, home, filtro do quadro, menu da lista, frente e verso do card, menu do quadro, compartilhar, automação, workspace, perfil, atalhos de teclado |

Fontes que não foram alcançadas: a página de preços da UTMify (SPA), a
playlist "Curso Completo Utmify" no YouTube (o conteúdo não carregou), o
modelo exato de parâmetros de URL para o Meta Ads (o artigo deu 404; o
levantamento confirma que a tela existe, mas não traz o texto) e os termos de
uso da UTMify.

## Core loop

Ver quanto cada campanha vendeu de verdade (faturamento, gasto, ROAS, lucro)
e transformar isso em trabalho organizado: cards num quadro kanban que andam
sozinhos por automações, inclusive quando uma métrica muda.

Os dois loops originais:
- **UTMify:** a venda chega por webhook, é atribuída a campanha, conjunto e
  anúncio pela UTM, e o painel mostra ROAS e lucro. A partir daí, escala ou
  pausa pelo próprio relatório.
- **Trello:** cria um card, move entre listas, e a automação reage.

## Telas

Componentes marcados como **visto** vêm dos levantamentos do usuário (fontes
26 e 27). O resto, e quase todos os estados, são **inferidos**.

### Base e kanban (Trello)

| ID | tela | rota / como chegar | propósito | componentes principais | estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Login | `/login` | entrar | Input, Button, botão Google, 2FA opcional | vazio, erro de credencial, senha fora da regra (8 a 50 caracteres, maiúscula, número, especial: visto na UTMify), carregando |
| S02 | Aceitar convite | `/invite/:token` (link do e-mail) | entrar no workspace ou no quadro | Card de convite, Button | válido, expirado, já é membro, convite revogado |
| S03 | Home | `/w/:workspace` | ver e abrir quadros | **visto:** menu lateral (Quadros, Modelos, Início, workspaces expansíveis com Quadros / Membros / Configurações), Favoritos, Vistos recentemente, grade de quadros por workspace, "Criar novo quadro", "Ver quadros fechados" | vazio (nenhum quadro), preenchido, carregando |
| S04 | Criar quadro | botão "Criar" da barra superior ou S03 | criar quadro | **visto:** título obrigatório, fundo (cores, gradientes, fotos), workspace, visibilidade | título vazio (erro), criando |
| S05 | Quadro | `/b/:boardId/:slug` | o kanban | **visto:** cabeçalho (nome editável, avatares, filtro, estrela, visibilidade, Compartilhar, menu); lista com título editável, contador, recolher, menu (adicionar card, copiar, mover, mover todos os cards, seguir, arquivar, arquivar todos, atalhos de automação); "Adicionar outra lista"; frente do card (capa, etiquetas que alternam faixa fina e com nome, badges, prazo colorido por situação, avatares, círculo de concluído); edição rápida por lápis ou clique direito. O seletor de visões, a Caixa de entrada e o Planejador ficam fora do recorte | sem listas, preenchido, filtro sem resultado, arrastando, somente leitura (observador), arquivado, outro usuário editando ao vivo, offline |
| S06 | Verso do card | modal, `/c/:cardId/:slug` | detalhar o trabalho | **visto:** seletor da lista atual, círculo de concluído + título, botão "Adicionar" (Etiquetas, Datas, Checklist, Membros, Anexo, Campos), descrição rica com @menção, campos personalizados; coluna lateral de comentários e atividade com mostrar/ocultar detalhes; menu de ações (ingressar, mover, copiar escolhendo o que manter, espelhar, criar modelo, seguir, compartilhar, arquivar e depois excluir). **Painel de métricas (novo)** | vazio, preenchido, arquivado, sem permissão, card excluído, descrição longa |
| S07 | Popovers do card | dentro do S06 | editar um atributo | **visto:** Etiquetas (buscar, criar, editar), Datas (calendário, início opcional, entrega com hora, recorrência, lembrete de "na hora" a "2 dias antes"), Checklist (copiar itens de outro, ocultar marcados, item com responsável e prazo, converter em card), Membros (buscar, ingressar), Anexo (arquivo, link com texto, recentes; imagem vira capa), Capa (faixa ou card inteiro), Mover/Copiar (quadro, lista, posição) | vazio, busca sem resultado, upload grande demais, upload falhou, excluir checklist (confirmação) |
| S08 | Menu do quadro | painel lateral a partir do S05 | administrar o quadro | **visto:** Sobre (admins, descrição, quem comenta), Visibilidade, Imprimir/exportar, Configurações (permissões de comentário e de membros, concluído na frente do card, capas ligadas), Fundo, Campos personalizados, Automação, Etiquetas, Atividade (todas ou só comentários), Itens arquivados (busca, cards ou listas, restaurar, excluir), Seguir, Copiar quadro, Fechar quadro | vazio, preenchido, excluir definitivamente (confirmação) |
| S09 | Compartilhar quadro | modal a partir do S05 | convidar e gerenciar membros | **visto:** e-mail ou nome + papel (admin, membro, observador); link de convite (criar, copiar, desativar, papel de quem entra); abas Membros e Solicitações para entrar | link desativado, convite pendente, último admin (bloquear remoção) |
| S10 | Busca e filtro | filtro no S05 (atalho F) e busca global na barra superior (atalho /) | achar cards | **visto:** filtro por palavra, membros (sem membros, eu, por membro), concluído, prazo (sem data, atrasado, 1 dia, 1 semana, 1 mês), etiquetas, atividade (1, 2, 4 semanas, parado há 4), modo qualquer ou todas, contador e limpar; busca de quadros, cards, membros e etiquetas com recentes | sem resultado, carregando |
| S11 | Notificações | popover do sino na barra superior | ver menções, atribuições e prazos | **visto:** contador, lidas e não lidas, filtro "só não lidas", "marcar todas como lidas" | vazio, não lidas |
| S12 | Workspace | `/w/:workspace/members` e `/w/:workspace/settings` | gerenciar o time | **visto:** abas Membros, Convidados, Solicitações; por membro última atividade, nº de quadros, papel, remover; configurações (nome, logo, descrição, domínio permitido, quem cria e exclui quadros, excluir workspace com confirmação forte) | só você, preenchido, convite pendente |
| S13 | Perfil e preferências | `/me` | conta e preferências | **visto:** perfil (foto, nome, @usuário, bio), atividade, configurações (tema, frequência e tipos de e-mail de notificação, notificações no navegador, modo para daltônicos, reduzir animações); da UTMify: 2FA e troca de senha | salvo, erro |
| S30 | Meus cards | menu do avatar ou atalho Q | ver o meu trabalho em todos os quadros | **visto:** cards atribuídos a mim agrupados por quadro ou por prazo | vazio, preenchido |

### Automação (Butler)

| ID | tela | rota / como chegar | propósito | componentes principais | estados |
| --- | --- | --- | --- | --- | --- |
| S14 | Diretório de automação | Automação no menu do quadro (S08) | ver e gerenciar automações | **visto:** menu lateral Regras, Programadas, Por data de entrega, Botões do card, Botões do quadro, Histórico, Sugestões; liga e desliga por automação; editar, copiar, excluir | vazio, com itens, desativada por erro |
| S15 | Construtor de automação | "Criar" a partir do S14 | montar gatilho + filtros + ações | blocos de gatilho e de ação com selects inline, prévia da frase, até 20 ações, inserir variável. **Gatilho por métrica (novo)**, com os campos das Regras da UTMify (visto): aplicar a campanhas / conjuntos / anúncios ativos ou pausados, filtro por nome, condições em E (métrica + operador + valor) no nível do objeto ou do dashboard, período de cálculo (hoje, ontem, últimos N dias com ou sem hoje, máximo), frequência a partir de 15 min | incompleto, inválido (lista excluída), salvo |
| S16 | Log de execuções | aba ou link no S14 | auditar o que rodou | tabela: quando, automação, card, status, mensagem | vazio, sucesso, erro |

### Tracking (UTMify)

**Visto (fonte 26):** a UTMify tem menu lateral fixo com Resumo, uma página
por fonte de tráfego (Meta, Google, Kwai, TikTok, Taboola), UTMs,
Integrações, Regras, Taxas, Despesas, Relatórios, Eventos, Notificações,
Assinatura, Minha conta, Avançado, Indique e ganhe, Suporte, Novidades e
Aplicativo. No topo: nome do dashboard atual (troca de dashboard), tema,
idioma, barra de meta de faturamento com selos e avatar. Quase toda tela tem
os filtros Período (Máximo, Hoje, Ontem, Últimos 7 dias, Este mês, Mês
passado, Personalizado), Conta de anúncio e Produto, um botão "Atualizar" e o
texto "atualizado há X minutos". **Não há página de lista de vendas.**

No nosso app o menu fica: Resumo, Meta, Google, UTMs, Relatórios, Vendas
(nossa), Integrações, Taxas, Despesas. As Regras viram automação (S14/S15).

| ID | tela | rota / como chegar | propósito | componentes principais | estados |
| --- | --- | --- | --- | --- | --- |
| S17 | Resumo | `/d/:dashboardId` | ler a operação | **visto:** filtros período, conta, fonte de tráfego, plataforma de venda, produto e "mais filtros" (tipo de venda: todas, recorrência, única); cards Faturamento líquido, Gastos com anúncios, ROAS, Lucro, ROI, Margem, Vendas pendentes, Vendas reembolsadas, % Reembolso, % Chargeback, Despesas adicionais, Custos de produto, Taxas, Imposto sobre vendas, Imposto sobre anúncios Meta, Imposto total; gráficos vendas por produto, por forma de pagamento (Pix, Cartão, Boleto, Outros + total), por fonte de tráfego e taxa de aprovação por forma de pagamento. Nosso extra: bruto, CPA, ticket médio | **visto:** faixa "configuração incompleta" com link para continuar, "atualizado há X minutos". Inferido: carregando, período sem vendas, ROAS sem gasto ("—"), erro de sincronização |
| S18 | Tráfego (Meta / Google) | `/d/:dashboardId/meta` e `/google` | otimizar | **visto:** abas por nível Contas > Campanhas > Conjuntos (Grupos no Google) > Anúncios, **não** árvore expansível; filtros nome, status (ativo, pausado, rejeitado/com restrições), período, conta, produto; tabela com colunas para mostrar, ocultar e reordenar, linha de totais, exportar; colunas status (toggle), nome, orçamento (editável), última atualização, vendas, CPA, gastos, faturamento, lucro, ROAS, margem, ROI, IC, CPI, CPC, CTR, CPM, impressões, cliques, add to cart, custo por add to cart, bid cap, gasto mínimo e máximo; no Google também tipo de campanha e CPA desejado. Nosso extra: **criar card (novo)** | **visto:** "identificando vendas", link "por que minhas campanhas não aparecem?". Inferido: sem conta conectada, token expirado, carregando, sem gasto, ação falhou |
| S19 | Vendas (nossa) | `/d/:dashboardId/orders` | ver e depurar pedidos | tabela: data, status, método, produto, valor, comissão, campanha atribuída, UTMs e página de entrada; detalhe do pedido com o histórico de status | vazio, filtrado, venda sem UTM ("não trackeada"), pedido de teste. **Não existe na UTMify** |
| S20 | Dashboards | troca pelo nome no topo; gerenciar em `/settings/dashboards` (Avançado na UTMify) | criar e separar operações | **visto:** criar, editar, excluir; campos nome, tipo de faturamento, fuso, moeda, "contabilizar juros"; colaboradores convidados por e-mail com permissões. Inferido: escolher produtos, contas e integrações por dashboard | vazio, preenchido |
| S21 | Integrações | `/integrations` | conectar dados | **visto (abas):** Anúncios (OAuth; conectar neste navegador ou gerar link para outro navegador ou colaborador), Webhooks (plataforma numa lista pesquisável, URL única, Credenciais de API), UTMs (vira o S22), Pixel, WhatsApp, Testes (fonte de tráfego, plataforma de venda, usa pixel?, link da campanha → link de teste e lista "últimos testes"). Nosso: Anúncios (Meta, Google), Loja (Shopify: instalar o app, status dos webhooks, último pedido, importar pedidos antigos), Testes. Pixel e WhatsApp ficam fora | nenhuma, conectada, token expirado, permissão de dados de cliente pendente, erro, aguardando o primeiro pedido |
| S22 | Rastreamento | aba UTMs de Integrações | deixar a origem das vendas correta | **visto:** código de parâmetros por plataforma para colar no anúncio, script de UTMs para a página de vendas, script de back redirect (fora), gerador de UTMs para tráfego orgânico (URL + utm_source obrigatório, medium, campaign, content, term, parâmetros extras como sck). Nosso: modelo do Meta, sufixo do Google, gerador orgânico, script só se houver página fora da Shopify | não configurado, verificado, parâmetros perdidos (redirecionador) |
| S23 | Taxas | `/d/:dashboardId/fees` | deixar o lucro correto | **visto:** impostos (sobre vendas %, sobre gasto do Meta %, adicionais), taxas adicionais fixas ou % por produto ou plataforma, custo de produto (tabela produto > custo) | **visto:** produto só aparece depois da primeira venda. Inferido: salvo, valor inválido |
| S26 | Despesas | `/d/:dashboardId/expenses` | lançar o que não é anúncio | **visto:** data, tipo (única ou recorrente), categoria (Tráfego, Ferramentas, Funcionários, Contabilidade, Outros), descrição, valor; filtros descrição, categoria, período | vazio, preenchido, valor inválido |
| S27 | Relatório por UTM | `/d/:dashboardId/utms` | ver venda por parâmetro, inclusive orgânico | **visto:** agrupar por utm_campaign, utm_medium, utm_content, utm_source, utm_term, src ou keyword; busca, período, produto, conta; mesmas métricas do S18; exportar CSV/Excel | vazio, sem UTM |
| S28 | Relatórios | `/d/:dashboardId/reports` | ver a curva no tempo | **visto:** agrupar por dia ou hora; vendas, CPA, gastos, despesas, faturamento, lucro, ROAS, margem, ROI, IC, CPI, CPC, CTR, CPM, impressões, cliques; períodos incluindo esta semana e semana passada; exportar | vazio, carregando |
| S29 | Configuração inicial | ao criar um dashboard; faixa de aviso no S17 | deixar o dashboard pronto | **visto:** pergunta as plataformas de anúncio, depois guia cada conexão. Nosso: Meta, Google, Shopify, parâmetros nos anúncios, teste | em andamento, concluído |

### A cola (novo)

| ID | tela | rota / como chegar | propósito | componentes principais | estados |
| --- | --- | --- | --- | --- | --- |
| S24 | Vincular card a métrica | popover no S06 | ligar um card a campanha, conjunto, anúncio, produto ou dashboard | busca com resultados agrupados por nível, escolher o dashboard de referência | sem integração, sem resultado, vinculado, alvo excluído no Meta |
| S25 | Badge e painel de métricas | frente do card (S05) e seção no S06 | ver o resultado sem sair do quadro | badge (ROAS ou lucro do período), mini-tabela no verso, link para o S18 | sem dados, carregando, positivo, negativo, dados atrasados |

## Fluxos

```
F01 Entrar pelo convite
    e-mail -> S02 -> S01 (definir senha ou Google) -> S03
    happy path clicks: 3
    edge: convite expirado, e-mail diferente do convidado, já tem conta

F02 Criar e estruturar um quadro
    S03 -> S04 (título, Criar) -> S05 -> adicionar 3 listas -> adicionar card
    happy path clicks: 6 (+ digitação)
    edge: título vazio, nome de 60+ caracteres, duplo clique em Criar

F03 Mover card entre listas
    S05 arrastar o card -> soltar em outra lista (ou S06 -> Mover -> lista -> posição)
    happy path clicks: 1 arraste
    edge: dois usuários movendo o mesmo card ao mesmo tempo, conexão cai no meio,
          precisão do pos float se esgota (rebalancear), só teclado, observador tenta arrastar

F04 Detalhar um card
    S05 -> S06 -> S07 (membro, etiqueta, data, checklist, anexo) -> comentário com @menção
    happy path clicks: 2 para abrir + 2 por atributo
    edge: anexo acima do limite, descrição com 16384 caracteres, @menção a quem não é membro,
          data com fuso diferente, card arquivado por outro usuário enquanto está aberto

F05 Convidar alguém para um quadro
    S05 -> S09 -> e-mail ou link -> papel -> enviar
    happy path clicks: 4
    edge: e-mail já é membro, link desativado, tentar remover o último admin

F06 Filtrar e buscar
    S05 -> filtro (etiqueta, membro, data) -> resultado ; header -> S10
    happy path clicks: 3
    edge: nenhum resultado, filtro salvo entre visitas

F07 Criar uma regra de automação
    S05 -> S14 -> Criar regra -> S15 (gatilho "card movido para a lista X" + filtro
    -> ações "adicionar etiqueta", "atribuir membro", "entrega em +2 dias") -> Salvar
    -> o gatilho acontece -> as ações rodam -> S16 mostra a execução
    happy path clicks: 8
    edge: loop (A dispara B que dispara A), lista do gatilho excluída, variável vazia,
          21ª ação (bloquear), automação desligada no meio de uma execução

F08 Botão de card / botão de quadro
    S15 cria o botão -> ele aparece no S06 / no header do S05 -> clicar executa as ações
    happy path clicks: 1 para executar
    edge: duplo clique, sem permissão, 21º botão ativo

F09 Automação agendada e por data
    S15 "todo dia útil às 9h, ordenar a lista X por data" ; "1 dia antes da entrega, etiqueta vermelha"
    happy path clicks: 7 para criar
    edge: fuso do usuário x fuso do servidor, card sem data, card arquivado

F10 Conectar o Meta Ads e o Google Ads
    S21 -> Conectar Meta -> OAuth (ads_read, + ads_management para editar)
    -> escolher contas de anúncio -> associar a um dashboard -> sincronização inicial
    S21 -> Conectar Google -> OAuth -> escolher a conta (customer id) -> sincronização inicial
    alternativa (visto): gerar um link de conexão para quem tem acesso à conta abrir em outro navegador
    happy path clicks: 5 por fonte
    edge: usuário recusa o escopo, token expira, conta sem permissão, conta em USD,
          limite de requisições das APIs, conta desativada, developer token do Google
          ainda em nível Test (só contas de teste)

F11 Conectar a Shopify
    S21 -> Conectar Shopify -> instalar o app da INtellect na loja (OAuth, read_orders)
    -> webhooks orders/create, orders/paid, orders/updated, refunds/create assinados
    -> importar os pedidos dos últimos 30 dias -> pedidos aparecem no S19 com a origem
    happy path clicks: 3
    edge: HMAC inválido, a mesma entrega chega duas vezes (X-Shopify-Webhook-Id),
          eventos fora de ordem, reembolso parcial, pedido criado no admin ou rascunho
          (sem visita, então "não trackeado"), pedido de teste, acesso a dados
          protegidos de cliente ainda não aprovado

F12 Configurar os parâmetros nos anúncios
    S22 (aba UTMs de Integrações) -> copiar o modelo -> colar em "Parâmetros de URL" no Meta Ads
    S22 -> copiar o sufixo -> colar em "Sufixo de URL final" no Google Ads (conta ou campanha)
    -> abrir a URL de teste na loja -> pedido de teste aparece atribuído
    happy path clicks: 4 (+ passos fora do app)
    edge: redirecionador remove os parâmetros, página fora da Shopify antes da loja
          (aí precisa do script), anúncio antigo sem o sufixo, Performance Max sem {keyword}

F13 Ler o resultado do dia
    S17 (período "Hoje") -> faturamento, gasto, ROAS, lucro -> S18 -> ordenar por ROAS
    -> abrir campanha -> conjuntos -> anúncios
    happy path clicks: 4
    edge: venda às 23h50 em Brasília é outro dia em UTC, gasto ainda não sincronizado,
          sem gasto (ROAS "—"), reembolso hoje de uma venda de ontem

F14 Otimizar pelo relatório
    S18 -> toggle para desligar o conjunto (ou editar o orçamento) -> confirmar -> Meta API -> status atualizado
    happy path clicks: 2
    edge: a API falha, sem permissão, alguém mudou direto no Gerenciador de Anúncios

F15 Configurar custos
    S23 -> imposto sobre vendas, imposto sobre o Meta, taxa adicional, custo por produto -> salvar
    S26 -> lançar despesa (única ou recorrente, categoria) -> lucro recalculado no S17
    happy path clicks: 4 + 3 por despesa
    edge: percentual acima de 100, custo mudou no meio do mês (vale a partir de quando?),
          produto sem venda ainda não aparece, despesa recorrente que para no meio do mês

F16 (novo) Vincular um card a uma campanha
    S06 -> Vincular -> S24 busca -> escolher -> badge no card (S25) e painel no verso
    happy path clicks: 3
    edge: campanha excluída no Meta, card movido para outro quadro, sem integração

F17 (novo) Regra por métrica
    S15 gatilho "ROAS da campanha vinculada abaixo de 1,0 nos últimos 3 dias"
    -> ações "mover para Revisar", "comentar com o ROAS", "notificar @gestor"
    happy path clicks: 8 para criar
    edge: métrica nula (sem gasto), oscilação em torno do limite (disparar uma vez por janela),
          dados atrasados, vários cards vinculados à mesma campanha

F18 Configuração inicial de um dashboard (visto na UTMify)
    criar dashboard -> S29 escolher plataformas (Meta, Google) -> F10 -> F11 -> F12 -> F19
    enquanto não termina: faixa "configuração incompleta" no S17 com link para continuar
    happy path clicks: 10 a 15 (com os OAuth)
    edge: abandonar no meio e voltar dias depois, conexão de um colaborador por link

F19 Testar a integração (visto na UTMify)
    S21 aba Testes -> fonte de tráfego, plataforma, link da campanha -> gerar link de teste
    -> abrir o link e fazer um pedido de teste na Shopify -> aparece em "últimos testes" atribuído
    happy path clicks: 5 (+ o pedido de teste)
    edge: pedido de teste não chega (webhook), chega sem visita, chega atribuído à campanha errada
```

## Componentes

| componente | variantes | estados | usado em |
| --- | --- | --- | --- |
| Button | primário, secundário, ghost, perigo, ícone | padrão, hover, foco, desabilitado, carregando | todas |
| Input / Textarea | texto, e-mail, número, busca, inline editável (títulos) | padrão, foco, erro, desabilitado | todas |
| Editor de texto rico | negrito, itálico, listas, títulos, links, código, @menção, emoji (visto) | vazio, editando, salvo, conflito | S06 (descrição e comentários) |
| Avatar / pilha de avatares | sm, md, iniciais ou imagem | padrão, +N | S03, S05, S06, S09, S12 |
| Chip de etiqueta | 10+ cores, com ou sem nome, compacto ou expandido | padrão, hover, selecionado | S05, S06, S07, S10 |
| Badge | data (normal, perto, vencida, concluída), checklist x/y, comentários, anexos, descrição, **métrica (novo)** | positivo, negativo, sem dados | S05, S25 |
| Card (frente) | com ou sem capa | padrão, hover, arrastando, placeholder, filtrado | S05 |
| Coluna de lista | normal, recolhida, com cor | padrão, arrastando, cheia (scroll), compositor aberto | S05 |
| Tile de quadro | com fundo de cor ou imagem | padrão, hover, favoritado | S03 |
| Popover | com título e voltar | aberto, carregando | S07, S11, S24 |
| Modal / Dialog | verso do card, confirmação | aberto, foco preso, fechando | S04, S06, S09, F14 |
| Painel lateral | menu do quadro | aberto, subpáginas | S08 |
| Menu dropdown | ações da lista, ações do card | aberto, item desabilitado | S05, S06, S18 |
| Seletor de data e hora | uma data, início + entrega, lembrete | vazio, selecionado, inválido | S07 |
| Checklist | com barra de progresso | itens, completo, ocultar marcados | S06 |
| Toast | sucesso, erro, desfazer | aparecendo, sumindo | todas |
| Toggle | automação ligada, status da campanha | ligado, desligado, carregando, erro | S14, S18 |
| Blocos do construtor de regra | gatilho, filtro, ação, variável | incompleto, válido, inválido | S15 |
| Card de métrica (KPI) | valor, comparação com o período anterior | carregando, sem dados, positivo, negativo | S17, S25 |
| Tabela de dados | ordenável, cabeçalho fixo, linha de totais, colunas para mostrar / ocultar / reordenar, célula editável (orçamento), exportar CSV/Excel (visto) | carregando (skeleton), vazio, erro | S12, S16, S18, S19, S26, S27, S28 |
| Abas de nível | Contas > Campanhas > Conjuntos > Anúncios (visto) | ativa, desabilitada | S18 |
| Seletor de período | atalhos Máximo, Hoje, Ontem, Últimos 7 dias, Este mês, Mês passado, Personalizado (visto); Esta semana e Semana passada no S28 | padrão, personalizado | S17, S18, S19, S27, S28 |
| Multiselect de filtro | produtos, plataformas, contas, status | nenhum, alguns, todos | S17, S18, S19, S27, S28 |
| Indicador de atualização | botão Atualizar + "atualizado há X minutos" (visto) | em dia, atualizando, atrasado | S17, S18, S27, S28 |
| Gráfico | barras, pizza | carregando, sem dados | S17 |
| Faixa de aviso | configuração incompleta (visto), token expirado | aberta, dispensada | S17, S21 |
| Assistente em passos | configuração inicial | passo atual, concluído, pulado | S29 |
| Construtor de condições | métrica + operador + valor, em E (visto nas Regras da UTMify) | incompleto, válido | S15 |
| Caixa de código com copiar | script, parâmetros, URL de webhook, token, link de teste | padrão, copiado | S21, S22 |
| Ajuda de atalhos | lista aberta com "?" (visto) | aberta, fechada | todas |
| Seletor de tema | claro, escuro, automático (visto nos dois) | n/a | barra superior, S13 |
| Pill de status | pedido (pago, pendente, recusado, reembolsado, chargeback), integração (ok, erro) | n/a | S19, S21 |
| Estado vazio | com ação principal | n/a | todas as listas |
| Skeleton | linha, card, tabela | n/a | S05, S17, S18 |

## Modelo de dados inferido

```
User         id, email, full_name, username, initials, avatar_url, bio, timezone, locale, theme,
             totp_secret (2FA, criptografado), notification_prefs (jsonb)
             evidência: REST API Member; S13; levantamentos (tema, 2FA, preferências de e-mail)
             confiança: alta

Workspace    id, name, slug, visibility (private | public)
             evidência: guia de permissões
             confiança: alta

WorkspaceMember  workspace_id, user_id, role (admin | normal)
             evidência: guia de permissões
             confiança: alta

Invite       id, scope (workspace | board), scope_id, email (opcional), token, role, expires_at, created_by, revoked_at
             evidência: guia de permissões ("invite links"); S02
             confiança: média

Board        id, workspace_id, name, description, background, visibility (private | workspace), closed, prefs (jsonb), created_by
             prefs: quem comenta, quem adiciona membros, membros do workspace editam, concluído na frente do card, capas ligadas
             evidência: REST API Board (closed, prefs, idOrganization); fonte 27 (configurações do quadro)
             confiança: alta

BoardMember  board_id, user_id, role (admin | normal | observer)
             evidência: guia de permissões
             confiança: alta

BoardStar    board_id, user_id                      evidência: Board.starred por usuário; confiança: alta

List         id, board_id, name, pos (float), closed, color (opcional), collapsed (por usuário?)
             evidência: Card.idList, pricing (cor de lista, lista recolhível)
             confiança: alta (cor e recolher: média)

Card         id, board_id, list_id, number (idShort por quadro), name, desc (<= 16384), pos (float), closed,
             start_at, due_at, due_complete, due_reminder_minutes, due_recurrence (could), cover (jsonb), created_by, last_activity_at
             evidência: REST API Card; fonte 27 (lembrete de "na hora" a "2 dias antes", recorrência)
             confiança: alta

CardMember   card_id, user_id                      confiança: alta (Card.idMembers)
Label        id, board_id, name, color            confiança: alta (labelNames, idLabels)
CardLabel    card_id, label_id                     confiança: alta

Checklist    id, card_id, name, pos
CheckItem    id, checklist_id, name, state (complete | incomplete), pos, due_at, assignee_id
             evidência: Card.idChecklists, checkItemStates; pricing (checklist avançado)
             confiança: alta (due e assignee no item: média)

Attachment   id, card_id, uploader_id, name, url, bytes, mime_type, is_upload, pos, created_at
             evidência: REST API Attachment
             confiança: alta

Comment      id, card_id, author_id, text, created_at, edited_at
             evidência: no Trello, comentário é uma Action do tipo commentCard; aqui vira tabela própria
             confiança: alta (decisão nossa de separar)

Activity     id, board_id, card_id, actor_id, type, data (jsonb), created_at
             evidência: REST API Action
             confiança: alta

CustomField      id, board_id, name, type (text | number | date | checkbox | list), options (jsonb), pos
CustomFieldValue card_id, field_id, value (jsonb)
             evidência: pricing (Custom Fields), variáveis {customfieldname}/{customfieldvalue}
             confiança: média

Notification id, user_id, type, data (jsonb), read_at, created_at
             evidência: S11; não documentado no material lido
             confiança: palpite

Automation   id, board_id, type (rule | scheduled | due_date | card_button | board_button), name,
             trigger (jsonb), actions (jsonb, <= 20), enabled, created_by, failure_count, disabled_reason
             trigger de métrica (novo): applies_to (campaign | adset | ad), status_filter, name_filter,
             condition_level (object | dashboard), conditions [{metric, op, value}] em E,
             window (today | yesterday | last_n_days com ou sem hoje | max), frequency_minutes (>= 15)
             evidência: visão geral de automação, cotas e limites; Regras da UTMify (fonte 26)
             confiança: média (o formato é nosso)

AutomationRun  id, automation_id, trigger_event (jsonb), card_id, status (success | error | skipped),
             message, operations, depth (proteção contra loop), started_at, finished_at
             evidência: command log e usage log citados na documentação
             confiança: média

--- tracking ---

Dashboard    id, workspace_id, name, timezone, currency, billing_type, include_interest (bool),
             view_type (total | normal), revenue_goal_cents (could), ad_platforms, onboarding_completed_at
             evidência: API de consulta (dashboardId, currency, viewType); fonte 26 (nome, tipo de faturamento,
             fuso, moeda, "contabilizar juros", configuração inicial, meta de faturamento)
             confiança: alta. O significado de "tipo de faturamento" e de "contabilizar juros" (juros do
             parcelamento entram no faturamento?) não foi levantado

DashboardScope  dashboard_id, kind (ad_account | product | sales_integration), ref_id
             evidência: filtros da API (productNames, platforms, *AdAccountIds); escopo da chave de API por dashboard
             confiança: média

AdConnection id, workspace_id, provider (meta | google), external_user_id,
             access_token e refresh_token (criptografados), token_expires_at, scopes, status
             evidência: trafficSource e os campos *AdAccountIds da API
             confiança: média
             (TikTok, Kwai e Taboola existem na UTMify, mas a INtellect não usa)

AdAccount    id, connection_id, provider, external_id, name, currency, timezone, status
             evidência: metaAdAccountIds e similares na API
             confiança: alta

Campaign / AdSet / Ad   id, ad_account_id, external_id, parent_id, name, status, daily_budget_cents, updated_at
             evidência: App Store (escalar, desativar, duplicar); hierarquia pública do Meta
             confiança: média
             no Google: Campaign / AdGroup / Ad nas mesmas tabelas (AdSet = grupo de anúncios),
             mais Keyword (ad_group_id, text, match_type), que não existe no Meta

AdInsightDaily  ad_id, date (no fuso da conta), spend_cents, impressions, clicks, landing_page_views,
             initiate_checkouts, leads, currency
             evidência: ads.spend, clicks, pageViews, initiateCheckouts, leads na API
             confiança: alta (campos), média (granularidade por anúncio e por dia)

SalesIntegration  id, workspace_id, platform (shopify), shop_domain, access_token (criptografado),
             scopes, webhooks_ok, last_event_at, status
             evidência: x-api-token e "Integrações → Webhooks → Credenciais de API" na UTMify;
             Dev Dashboard e webhooks na documentação da Shopify
             confiança: alta

WebhookDelivery  delivery_id (X-Shopify-Webhook-Id, único), topic, received_at, processed_at, error
             evidência: documentação de webhooks da Shopify (deduplicar pela entrega)
             confiança: alta

Order        id, sales_integration_id, external_order_id, platform,
             payment_method (credit_card | boleto | pix | paypal | free_price),
             status (waiting_payment | paid | refused | refunded | chargedback),
             created_at, approved_at, refunded_at (UTC),
             customer_name, customer_email, customer_phone, customer_document, customer_country, customer_ip,
             src, sck, utm_source, utm_campaign, utm_medium, utm_content, utm_term,
             total_cents, gateway_fee_cents, user_commission_cents, currency, is_test,
             first_visit_landing_page, first_visit_utm (jsonb), last_visit_landing_page, last_visit_utm (jsonb),
             days_to_conversion, campaign_id, adset_id, ad_id, keyword_id (atribuição derivada), raw (jsonb)
             evidência: API de envio de vendas da UTMify; Order.customerJourneySummary da Shopify
             confiança: alta

OrderItem    order_id, product_id, external_product_id, name, plan_id, plan_name, quantity, price_cents
             evidência: API de envio de vendas (products[])
             confiança: alta

OrderEvent   order_id, status, received_at, raw (jsonb)     evidência: o mesmo orderId chega várias vezes; confiança: palpite (nosso)

Product      id, workspace_id, name, external_ids (jsonb por plataforma), cost_cents
             evidência: productNames, costs.productsCost
             confiança: média

CostSettings dashboard_id, sales_tax_pct, meta_ads_tax_pct, extra_taxes (jsonb), valid_from
             evidência: costs.taxes, costs.metaAdsTax; página Taxas (fonte 26)
             confiança: alta (campos), palpite (valid_from)

AdditionalFee  id, dashboard_id, name, kind (fixed | percent), value, scope (all | product | platform), scope_id
             evidência: "taxas adicionais fixas ou %, por produto ou plataforma" (fonte 26); costs.fees
             confiança: média

CustomExpense  id, dashboard_id, date, kind (once | recurring), category (traffic | tools | staff |
             accounting | other), description, amount_cents
             evidência: costs.customSpent; página Despesas (fonte 26)
             confiança: alta

IntegrationTest  id, dashboard_id, traffic_source, sales_platform, campaign_url, test_url, status,
             order_id (quando chega), created_at
             evidência: Integrações > Testes, "últimos testes" (fonte 26)
             confiança: média

--- a cola (novo) ---

CardLink     card_id, target_type (campaign | adset | ad | product | dashboard), target_id, dashboard_id
             confiança: n/a (desenho nosso)
```

Relacionamentos: Workspace 1-n Board, Board 1-n List, List 1-n Card, Card n-n
User (CardMember), Card n-n Label, Card 1-n Checklist 1-n CheckItem, Card 1-n
Attachment, Card 1-n Comment, Board 1-n Automation 1-n AutomationRun.
Workspace 1-n AdConnection 1-n AdAccount 1-n Campaign 1-n AdSet 1-n Ad 1-n
AdInsightDaily. Workspace 1-n SalesIntegration 1-n Order 1-n OrderItem n-1
Product. Order n-1 Ad (atribuição). Dashboard n-n AdAccount / Product /
SalesIntegration (DashboardScope). Dashboard 1-n AdditionalFee,
CustomExpense, IntegrationTest. Card 1-n CardLink.

### Métricas: os campos são públicos, as fórmulas não

Os nomes vêm da API de consulta da UTMify e dos cards do Resumo (fonte 26).
O levantamento do usuário traz fórmulas, mas não diz se elas aparecem no app
(num tooltip, por exemplo) ou se foram deduzidas por quem levantou: confiança
média. O replica-architect fixa a definição e o app a mostra num tooltip.

| métrica | campo na API | no levantamento (fonte 26) | fórmula proposta |
| --- | --- | --- | --- |
| Faturamento bruto | revenue.gross | não aparece no Resumo | soma de total_cents dos pedidos pagos |
| Faturamento líquido | revenue.net | vendas aprovadas − taxas da plataforma | soma de user_commission_cents dos pedidos pagos (na Shopify: total − taxas do gateway) |
| Pendente | revenue.pending | card "Vendas pendentes" | soma dos pedidos waiting_payment |
| % Reembolso / % Chargeback | — | cards no Resumo | pedidos reembolsados (ou chargeback) ÷ pedidos aprovados no período |
| Gasto | ads.spend | "Gastos com anúncios" | soma de spend convertido para a moeda do dashboard |
| Impostos | costs.taxes, costs.metaAdsTax | imposto sobre vendas + imposto sobre anúncios Meta = imposto total | % sobre o líquido + % sobre o gasto do Meta + impostos adicionais |
| Custos | costs.* | taxas, custos de produto, despesas | taxas adicionais + custo dos produtos + despesas |
| Lucro | result.profit | líquido − gastos − impostos − custos de produto − taxas − despesas | igual ao levantamento |
| ROAS | result.roas | faturamento ÷ gastos | líquido ÷ gasto (nulo sem gasto) |
| ROI | result.roi | lucro ÷ gastos | **muda para o levantamento:** lucro ÷ gasto (antes: lucro ÷ (gasto + custos)) |
| Margem | result.profitMargin | lucro ÷ faturamento | lucro ÷ líquido |
| CPA | result.cpa | gastos ÷ vendas | gasto ÷ pedidos pagos |
| Ticket médio | result.avgTicket | não aparece | bruto ÷ pedidos pagos |
| ARPU | result.arpu | não aparece | líquido ÷ clientes únicos (palpite) |

Pendente para o architect: o levantamento diz "faturamento" no ROAS e na
margem sem dizer se é bruto ou líquido. Como o Resumo só mostra o líquido,
a proposta usa o líquido.

### Atribuição

Na UTMify, a venda chega com `utm_source`, `utm_campaign`, `utm_medium`,
`utm_content`, `utm_term`, `src` e `sck`, que o script dela repassa da página
para o checkout. O modelo exato de parâmetros dela não foi lido.

Com a Shopify fica mais simples: o próprio pedido traz a **primeira e a última
visita** antes da compra (janela de 30 dias), cada uma com as UTMs e a URL
completa da página de entrada (`Order.customerJourneySummary`). Então:

- Os anúncios levam IDs na URL. No Meta, com os parâmetros dinâmicos públicos
  (`{{campaign.id}}`, `{{adset.id}}`, `{{ad.id}}`, `{{placement}}`). No Google,
  com o sufixo de URL final e os ValueTrack (`{campaignid}`, `{adgroupid}`,
  `{creative}`, `{keyword}`).
- A atribuição lê esses IDs da página de entrada e casa com Campaign / AdSet /
  Ad pelo ID, que não muda quando a campanha é renomeada.
- O modelo padrão é a última visita (como o resumo da UTMify, que credita uma
  campanha por venda). A primeira visita fica guardada para comparar depois.
- O script de UTMs só é necessário se houver uma página fora da Shopify antes
  da loja.
- Pedido sem visita (criado no admin, rascunho) ou sem UTM vira "não trackeado".
  Visita com `utm_source` manual (bio, WhatsApp, e-mail) vira "outras fontes".

## Matriz de funcionalidades

Ver `features.csv` (172 linhas, com uma coluna extra `source`: trello, utmify,
ambos ou novo). As linhas "skip" têm `clone=skip`.
Must: 55, should: 48, could: 44, skip: 25.
Das 55 must, 5 são novas (a cola entre os apps); o parity.py conta essas à
parte, então o placar de paridade usa 50 must. Também são novas 2 should
(criar card pelo relatório; a lista de Vendas, que a UTMify não tem) e 2
could.

Em 2026-10-12 os levantamentos acrescentaram 44 linhas e nenhuma must: o que
era essencial já estava na matriz. O que mudou de verdade foi o desenho das
telas de tracking (abas por nível em vez de árvore, Taxas e Despesas
separadas, relatório por UTM e por dia ou hora, configuração inicial, testes).

## Fora do escopo (não pode ou não deve ser clonado)

- Power-Ups e as integrações de parceiros da Atlassian (Jira, Bitbucket,
  Slack): é a rede de parceiros deles, não o produto.
- A galeria pública de templates do Trello: conteúdo do Trello e da comunidade.
- A rede de integrações da UTMify com 10+ plataformas de checkout: aqui entra
  só a Shopify, com uma integração escrita por nós a partir da documentação
  pública dela. TikTok Ads, Kwai Ads e Taboola também ficam de fora: a
  INtellect não anuncia nessas redes.
- Fora do recorte escolhido (podem voltar depois): as visões calendário,
  linha do tempo, tabela, painel e mapa; Inbox e Planner; IA; pixel
  server-side com Conversions API; rastreamento de WhatsApp; afiliados.
- Uso interno: planos e cobrança (página Assinatura), Indique e ganhe,
  central de tutoriais e suporte por WhatsApp, página de Novidades,
  SSO/Enterprise, cotas comerciais de automação, quadros públicos, API e MCP
  públicos, denúncia e formulário de feedback, recursos experimentais.
- Apps iOS e Android dos dois produtos, a página "Aplicativo" e a
  notificação push de venda no celular.
- Script de back redirect da UTMify: mexe no botão voltar do navegador e não
  se aplica a uma loja Shopify.
- Do Trello: adesivos, extensões internas, e-mail para quadro, QR code e
  código para incorporar.
- As páginas Kwai, TikTok e Taboola, Pixel, Eventos e WhatsApp da UTMify
  (a INtellect não usa).

## Tamanho

Telas: 30 (14 do kanban, 3 de automação, 11 de tracking, 2 novas). Fluxos: 19.
Entidades: 42 (22 do kanban e da automação; 19 do tracking, contando
Campaign, AdSet, Ad e Keyword separadas; 1 nova).

Partes difíceis:
1. **Kanban em tempo real**: arrastar e soltar com ordem fracionária e
   rebalanceamento, atualização otimista, conflito entre usuários e
   acessibilidade por teclado.
2. **Motor de automação**: barramento de eventos, gatilhos com filtros, até 20
   ações, variáveis, jobs agendados e por data, proteção contra loop,
   idempotência, log. Mais o gatilho por métrica, que depende do tracking.
3. **Integrações de anúncios e checkout**:
   - Meta: OAuth com um app próprio. Para uso interno, o acesso padrão da
     Marketing API costuma bastar para contas de anúncio de quem tem papel no
     app, sem revisão do Meta (confirmar no replica-architect).
   - Google: developer token com acesso Basic, que exige verificação de marca
     do projeto no Google Cloud. Com acesso Test, só contas de teste funcionam.
     Comece cedo.
   - Shopify: app no Dev Dashboard, e o acesso a dados protegidos de cliente
     (nome, e-mail) precisa de aprovação.
   - Nos três: renovação de token, limite de requisições, sincronização
     incremental por anúncio e por dia, webhooks idempotentes e fora de ordem,
     e conversão de moeda se alguma conta de anúncio for em USD.
4. **Fusos horários**: fuso do dashboard, fuso da conta de anúncio e pedidos em
   UTC precisam bater no mesmo "Hoje".

Tamanho: **L** (um trimestre) para o recorte inteiro. Dá para ter valor antes
dividindo em três fases de tamanho M (algumas semanas cada):
1. Tracking: S17 a S23 e S26 a S29, com Shopify, Meta e Google Ads.
2. Kanban: S01 a S13 e S30.
3. Automação e a cola: S14, S15, S16, S24 e S25.

## Pedidos do usuário para as próximas etapas

Vieram nos dois levantamentos (2026-10-12) e valem para o architect e o build:

- Stack sugerida pelo usuário: Next.js (App Router) + TypeScript + Tailwind +
  shadcn/ui, PostgreSQL com Prisma, Auth.js com e-mail e senha (2FA
  opcional), @dnd-kit para arrastar e soltar. O architect confirma ou
  justifica outra escolha.
- Rodar tudo localmente primeiro, com seed de dados fictícios (vendas,
  campanhas, gastos, quadros e cards) para ver as telas preenchidas.
- Integrações externas (e-mail, Meta, Google, Shopify) começam com interface
  pronta e implementação simulada até o usuário aprovar a conexão real.
- Construir em etapas, mostrar cada uma rodando e esperar o "ok" antes da
  próxima. Explicar em português, em passos numerados: o usuário é iniciante.
- Nada é publicado, nenhuma conta é criada e nenhum serviço pago é contratado
  sem um "sim" explícito.
- Ordem que o usuário propôs para o tracking: login e layout; Resumo com seed;
  webhook e Shopify com atribuição; parâmetros e scripts; página do Meta;
  Taxas, Despesas, Relatórios e UTMs; Google; Regras. Para o kanban: base e
  seed; identidade visual (2 opções); login e home; quadro, listas e cards;
  verso do card; menu do quadro; automação; workspace, perfil e busca;
  polimento.
