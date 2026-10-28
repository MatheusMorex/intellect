# Arquitetura: app interno da INtellect (refaz as funções principais do Trello e da UTMify)

Base: `replica/recon.md` (30 telas, 19 fluxos) e `replica/features.csv`
(must 55, should 48, could 44, skip 25). O app se chama **INtellect**; logo e
cores vêm do pacote do usuário em `replica/design/marca/`. Data: 2026-10-12.

Um app web só, para uso interno: kanban com automação, tracking de vendas da
Shopify com gasto do Meta Ads e do Google Ads, e a cola entre os dois (card
ligado a campanha, badge de ROAS, regra disparada por métrica).

## Stack

| camada | escolha | por quê |
| --- | --- | --- |
| web | Next.js (App Router) + TypeScript | Pedido do usuário. Uma base só para as telas, as server actions e as rotas de webhook e OAuth. |
| interface | Tailwind + shadcn/ui; @dnd-kit, TanStack Table, Recharts, Tiptap | Pedido do usuário (Tailwind, shadcn, @dnd-kit). TanStack Table dá colunas para mostrar, ocultar e reordenar e a linha de totais; Recharts é o que os gráficos do shadcn usam; Tiptap dá o editor rico com @menção. Tokens de cor e tipo vêm do /replica-design. |
| banco | PostgreSQL 17 | Um banco só, que também é a fila de jobs e o canal de tempo real. No computador, via Docker; em produção, o Postgres gerenciado do mesmo provedor do app. |
| ORM | Prisma | Pedido do usuário; o Prisma Studio mostra os dados sem escrever SQL. As regras que o Prisma não expressa (CHECK, índices parciais, gatilhos) ficam no SQL da migração. |
| auth | Better Auth (troca do Auth.js do prompt) | E-mail e senha com sessão no banco, 2FA (TOTP) e login com Google já prontos, e o cadastro público pode ser desligado. No Auth.js, o login por senha só funciona com sessão JWT e o 2FA teria de ser feito à mão. |
| pagamentos | nenhum | Uso interno, sem cobrança. |
| e-mail | Mailpit no computador; Resend em produção | O Mailpit é uma caixa de e-mail falsa em `localhost:8025`: dá para ver os convites sem enviar nada. O Resend só entra com o "sim" do usuário e um domínio próprio. |
| jobs | pg-boss num processo `worker` separado | Fila e agendamento dentro do mesmo Postgres: retry com espera, um sync por vez por conta de anúncio (singleton), cron com fuso. Nenhum serviço a mais. |
| tempo real | Server-Sent Events + LISTEN/NOTIFY do Postgres | O quadro recebe "o card X mudou" e busca o card de novo. Sem serviço pago de websocket. |
| arquivos | pasta local no computador; Cloudflare R2 em produção | Compatível com S3 e sem taxa de saída. Os dois atrás da mesma interface. |
| validação e datas | Zod; date-fns + @date-fns/tz | Zod valida todas as entradas, inclusive os gatilhos e as ações de automação. |
| hospedagem | Railway ou Render: um serviço web, um worker e um Postgres | Decidido no /replica-deploy, com custos, só com o "sim" do usuário. O app precisa de processos que ficam ligados (SSE e worker a cada minuto). A Vercel não serve bem: o plano Hobby é só para uso não comercial, o cron dele roda uma vez por dia, e SSE e worker contínuo pediriam outros serviços. |

Integrações reais começam desligadas. Cada uma tem duas implementações atrás
da mesma interface (`live` e `fake`), escolhidas por `INTEGRATIONS_MODE` no
`.env`. A `fake` lê arquivos de exemplo: dá para construir e testar tudo sem
conta no Meta, no Google ou na Shopify.

### Pastas

O código fica em `C:\Users\Soare\dev\intellect`, fora do OneDrive. Esta pasta
`replica/` guarda o plano, o design e a marca. Os tokens chegam ao app com
`python replica/design/build_tokens.py --out C:/Users/Soare/dev/intellect/app`.

```
app/                      telas (App Router) e rotas /api
  design/                 prancha do sistema visual (componentes isolados)
components/ui             componentes de base no padrão shadcn/ui; components/ds: os nossos
  (auth)/login  invite/[token]
  w/[slug]/...            home, membros e configurações do workspace
  b/[boardId]/...         quadro, automação;  c/[cardId] abre o card
  d/[dashboardId]/...     tracking
  api/...                 webhooks, OAuth, SSE, busca, upload, exportação
server/
  db.ts  auth.ts          Prisma e Better Auth
  access.ts               checagens de acesso (uma por consulta)
  actions/                server actions por área
  metrics/formulas.ts     todas as fórmulas, num arquivo só, com testes
  attribution/            lê a URL de entrada e casa com o anúncio
  automation/             gatilhos, ações, motor, proteção contra loop
  integrations/           meta, google, shopify (live e fake)
  realtime.ts             NOTIFY e fan-out do SSE
worker/index.ts           processo do pg-boss com todos os jobs
prisma/                   schema.prisma, migrations/0001_init (= replica/schema.sql), seed.ts
scripts/simulate-order.ts webhook de pedido falso, assinado como a Shopify assina
docker-compose.yml        Postgres + Mailpit
```

## Esquema

Tabelas: **52** (5 de autenticação, 22 do kanban e da automação, 24 do
tracking, 1 da cola). Regras de acesso: **checagem na camada de dados**, não
RLS. O SQL completo está em `replica/schema.sql` e é a primeira migração.

Validado em 2026-10-12 num Postgres em memória (PGlite, Postgres 18): as 52
tabelas e os 33 gatilhos de `updated_at` foram criados, e 15 testes mostraram
que o banco recusa e-mail repetido, cor de etiqueta inválida, insight
duplicado, vínculo de card incoerente, automação com 21 ações, automação de
métrica sem dashboard, convite de observador para workspace, taxa sem valor,
despesa única com data final, início depois da entrega, domínio de loja
inválido e plataforma fora do escopo. A busca sem acento achou "Ação"
procurando "acao".

### Quem pode o quê

Toda server action e toda leitura passa por `server/access.ts` antes de
tocar nos dados: `requireWorkspace(ctx, id, papel)`,
`requireBoard(ctx, id, papel)`, `requireDashboard(ctx, id)`. Nunca se
confia num id vindo do navegador sem essa checagem.

| papel | pode |
| --- | --- |
| admin do workspace | tudo do workspace: membros, convites, integrações, custos, ligar e desligar campanha, mudar orçamento |
| membro do workspace | ver os dashboards, criar quadros, ver quadros com visibilidade "workspace" |
| admin do quadro | configurações, membros e convites do quadro; fechar e excluir |
| membro do quadro | editar listas, cards e automações do quadro |
| observador | só ler o quadro |

Quadro privado: só os membros do quadro veem. Quadro "workspace": os membros
do workspace veem, e editam se a preferência `workspace_can_edit` estiver
ligada. Dashboards: todos os membros do workspace veem; permissão por
dashboard é uma linha could.

### Decisões do esquema

- **Ordem de listas, cards e itens:** `rank` é texto com chave fracionária
  (pacote `fractional-indexing`), comparado byte a byte (`collate "C"`). Nunca
  precisa rebalancear, ao contrário do `pos` float do Trello. Empate entre duas
  inserções simultâneas é desfeito pelo id.
- **Número curto do card (#12):** `boards.next_card_number`, incrementado com
  a linha do quadro travada. Card que muda de quadro ganha número novo.
- **Insights de anúncio:** uma linha por objeto e por dia no menor nível que
  cobre todo o gasto (anúncio no Meta e no Google Search/Display; campanha no
  Performance Max). Somar nunca conta gasto duas vezes. Palavra-chave fica em
  tabela à parte e nunca entra nos totais. O `date` é o dia no fuso da conta
  de anúncio.
- **Pedidos sem dados pessoais:** não guardamos nome, e-mail, telefone,
  documento nem IP do comprador (LGPD e regras de dados protegidos da
  Shopify). O pedido mostra o número e um link para o admin da Shopify. O
  payload do webhook é apagado depois de processado.
- **Status do pedido:** vem do evento mais novo. `source_updated_at` impede
  que um evento antigo, chegado depois, desfaça um mais novo.
- **Dinheiro:** centavos em `bigint` mais a moeda. Percentuais em pontos base
  (650 = 6,50%).
- **Custos com data:** `cost_settings` e `product_costs` têm `valid_from`. A
  venda usa o custo que valia no dia dela, o que resolve o "custo mudou no
  meio do mês" do recon.
- **Despesa recorrente:** o mesmo valor no mesmo dia de cada mês, de `date` até
  `end_date`. É calculada na consulta, sem gerar linhas.
- **Atividade é o barramento de eventos:** toda mudança grava uma linha em
  `activities` na mesma transação. `automation_checked_at` nulo significa que
  as regras ainda não a avaliaram.
- **Tokens de terceiros:** cifrados com AES-256-GCM. A chave fica em
  `ENCRYPTION_KEY`, fora do banco.
- **Exclusões:** apagar workspace, quadro ou card apaga o que é dele
  (cascade). Apagar usuário remove as participações e deixa o conteúdo com o
  autor nulo ("usuário removido"). Desconectar uma conta de anúncio não apaga
  o histórico. Apagar uma campanha não apaga o pedido: a atribuição fica nula.
- **Prisma:** o `schema.prisma` é gerado com `prisma db pull` depois da
  primeira migração. Nas próximas, use `prisma migrate dev --create-only` e
  confira que o Prisma não tenta apagar CHECKs, índices parciais, índices de
  expressão ou gatilhos.

## Métricas: definições fixadas

Tudo em `server/metrics/formulas.ts`, com testes, e cada card mostra a
fórmula num tooltip. "Período" é contado pelo dia do pedido (`placed_at`) no
fuso do dashboard.

| métrica | definição |
| --- | --- |
| Bruto | Σ total dos pedidos pagos − reembolsos parciais − juros (se "contabilizar juros" estiver desligado) |
| Líquido | bruto − taxa da plataforma de pagamento (quando a Shopify informa) |
| Base | líquido (padrão) ou bruto, conforme `revenue_basis` do dashboard |
| Gasto | Σ spend convertido para a moeda do dashboard pela PTAX do dia do gasto |
| Impostos | imposto sobre vendas × líquido + imposto do Meta × gasto do Meta + impostos extras × líquido |
| Lucro | líquido − gasto − impostos − custo dos produtos vendidos − taxas adicionais − despesas |
| ROAS | base ÷ gasto (vazio sem gasto) |
| ROI | lucro ÷ gasto (vazio sem gasto) |
| Margem | lucro ÷ base (vazio sem venda) |
| CPA | gasto ÷ pedidos pagos (vazio sem venda) |
| Ticket médio | bruto ÷ pedidos pagos |
| % Reembolso / % Chargeback | pedidos reembolsados (ou chargeback) ÷ (pagos + reembolsados + chargeback) |

Nas linhas de campanha, conjunto e anúncio, as vendas são os pedidos
atribuídos a elas. O lucro da linha não desconta despesas: elas entram só no
Resumo e nos relatórios por dia.

Para confirmar com o usuário: aqui a venda conta no dia do pedido; a UTMify
pode contar no dia da aprovação (boleto e Pix pagos depois).

## Parâmetros de URL (o que o S22 mostra para copiar)

Os IDs vão em parâmetros próprios (`itl_*`) porque não mudam quando a
campanha é renomeada. As UTMs ficam legíveis para o relatório por UTM.

Meta Ads, campo "Parâmetros de URL":

```
utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&itl_c={{campaign.id}}&itl_s={{adset.id}}&itl_a={{ad.id}}&itl_p={{placement}}
```

Google Ads, "Sufixo de URL final" (na conta):

```
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}&itl_c={campaignid}&itl_s={adgroupid}&itl_a={creative}&itl_k={targetid}
```

Como a atribuição funciona: a última visita da jornada da Shopify (a
primeira, se faltar a última) → lê `itl_*` da página de entrada → casa com
anúncio, conjunto e campanha pelo id externo. Sem `itl_*`, tenta casar pelas
UTMs. `utm_source` de outra origem vira "outras fontes"; sem nada, "não
trackeada". No Performance Max, `{adgroupid}` e `{creative}` vêm vazios, e a
venda fica na campanha.

## API

Convenções: `action nome` é uma Server Action (POST interno do Next). As
páginas são Server Components que leem por `server/` com as mesmas
checagens. Entradas validadas com Zod; erros voltam como
`{ error: código, mensagem }`.

### Páginas

| rota | tela |
| --- | --- |
| `/login`, `/invite/[token]` | S01, S02 |
| `/w/[slug]`, `/w/[slug]/members`, `/w/[slug]/settings` | S03, S12 |
| `/b/[boardId]`, `/c/[cardId]` | S05 a S10, S24, S25 |
| `/b/[boardId]/automation` | S14 a S16 |
| `/me`, `/me/cards` | S13, S30 |
| `/d/[dashboardId]` | S17 |
| `/d/[dashboardId]/meta`, `/d/[dashboardId]/google` | S18 |
| `/d/[dashboardId]/orders` | S19 |
| `/settings/dashboards` | S20 |
| `/d/[dashboardId]/integrations` (abas Anúncios, Loja, UTMs, Testes) | S21, S22 |
| `/d/[dashboardId]/fees`, `/d/[dashboardId]/expenses` | S23, S26 |
| `/d/[dashboardId]/utms`, `/d/[dashboardId]/reports` | S27, S28 |
| `/d/[dashboardId]/setup` | S29 |

### Rotas e actions por fluxo

| método e rota | faz | quem | entrada | saída | fluxo |
| --- | --- | --- | --- | --- | --- |
| `GET /invite/[token]` | mostra o convite | quem tem o token | token | página: válido, expirado, revogado, já é membro | F01 |
| `action acceptInvite` | cria a conta, se for nova, e a participação; conta o uso do link | quem tem o token | token, nome, senha | workspaceId ou boardId | F01 |
| `GET/POST /api/auth/[...all]` | login, logout, sessão, 2FA, redefinir senha (Better Auth; cadastro público desligado) | anônimo, logado | e-mail, senha, código | cookie de sessão | F01 |
| `action createInvite`, `revokeInvite` | convite do workspace por e-mail ou link, com validade | admin do workspace | e-mail?, papel, validade | URL do convite | F01 |
| `action createBoard` | cria o quadro; o criador vira admin | membro do workspace | workspaceId, nome, fundo, visibilidade | boardId | F02 |
| `action updateBoard` | nome, descrição, fundo, visibilidade, preferências | admin do quadro | boardId, campos | quadro | F02 |
| `action closeBoard`, `reopenBoard`, `deleteBoard` | fechar, reabrir, excluir (com confirmação) | admin do quadro | boardId | ok | F02 |
| `action starBoard` | favoritar e desfavoritar | quem vê o quadro | boardId, ligado | ok | F02 |
| `action createList`, `renameList`, `archiveList` | listas | membro do quadro | boardId ou listId, nome, posição | lista | F02 |
| `action createCard` | card no fim (ou no topo) da lista, com número curto | membro do quadro | listId, nome, onde | card | F02 |
| `action moveCard` | muda lista e posição, ou quadro | membro do quadro (e do destino) | cardId, toListId, beforeId?, afterId? | rank novo | F03 |
| `action moveList` | reordena ou leva para outro quadro | membro do quadro | listId, beforeId?, afterId?, toBoardId? | rank novo | F03 |
| `GET /api/events?boardId=` | SSE: mudanças do quadro e notificações do usuário | quem vê o quadro | boardId, Last-Event-ID | eventos `{type, id, version}` | F03, F04 |
| `action updateCard` | título, descrição, datas, lembrete, concluído, capa | membro do quadro | cardId, campos, expectedVersion | card, ou conflito se a versão mudou | F04 |
| `action toggleCardMember` | entrar no card, atribuir, remover | membro do quadro | cardId, userId | membros | F04 |
| `action toggleCardLabel`, `upsertLabel`, `deleteLabel` | etiquetas (do mesmo quadro) | membro do quadro | cardId ou boardId, etiqueta | etiquetas | F04 |
| `action createChecklist`, `updateChecklist`, `deleteChecklist`, `addChecklistItem`, `updateChecklistItem`, `moveChecklistItem`, `deleteChecklistItem` | checklists e itens | membro do quadro | ids, campos | checklist | F04 |
| `POST /api/cards/[cardId]/attachments` | upload de até 25 MB, em stream, para disco ou R2 | membro do quadro | multipart | anexo | F04 |
| `action addLinkAttachment`, `renameAttachment`, `deleteAttachment` | anexos por link; renomear; remover (apaga o arquivo depois do commit) | membro do quadro | ids, campos | anexo | F04 |
| `GET /api/attachments/[id]` | download com checagem de acesso | quem vê o quadro | id | arquivo | F04 |
| `action addComment`, `editComment`, `deleteComment` | comentário com @menção (gera notificação); editar e excluir só o próprio | membro, conforme a permissão de comentário | cardId, documento | comentário | F04 |
| `action archiveCard`, `restoreCard`, `deleteCard` | arquivar, restaurar; excluir só arquivado e com confirmação | membro do quadro | cardId | ok | F04 |
| `action copyCard` | copia, escolhendo o que manter | membro do quadro (e do destino) | cardId, listId, keep | card | F04 |
| `action setCustomFieldValue` | valor de campo personalizado | membro do quadro | cardId, fieldId, valor | ok | F04 |
| `action inviteToBoard` | membro do workspace entra direto; e-mail de fora recebe convite | admin do quadro (ou membros, pela preferência) | boardId, e-mail, papel | convite ou membro | F05 |
| `action setBoardInviteLink` | criar, desativar e escolher o papel do link | admin do quadro | boardId, papel, ligado | URL | F05 |
| `action changeBoardMemberRole`, `removeBoardMember`, `leaveBoard` | papel e saída; recusa remover o último admin (linha travada) | admin do quadro, ou o próprio | boardId, userId, papel | membros | F05 |
| filtro do quadro (no navegador) | filtra os cards já carregados; estado na URL | quem vê o quadro | `?q&members&labels&due&activity&mode` | — | F06 |
| `GET /api/search?q=` | quadros, cards, membros e etiquetas, sem acento (trigram) | logado; só o que ele vê | q, tipo? | resultados | F06 |
| `action createAutomation`, `updateAutomation` | valida gatilho e até 20 ações; calcula `next_run_at` | membro do quadro | boardId, type, trigger, actions, timezone | automação | F07, F09, F17 |
| `action toggleAutomation`, `deleteAutomation` | ligar, desligar, excluir | membro do quadro | id, ligado | ok | F07 |
| `action runButton` | executa um botão de card ou de quadro | membro do quadro | automationId, cardId?, clickId | runId | F08 |
| `GET /api/oauth/meta/start` | redireciona para o login do Facebook (ads_read, ads_management, business_management) | admin do workspace, ou link de conexão assinado | dashboardId | redirect | F10 |
| `GET /api/oauth/meta/callback` | troca o code por token longo, cifra, lista as contas | Meta (state assinado) | code, state | redirect para o S21 | F10 |
| `GET /api/oauth/google/start`, `/callback` | o mesmo com o Google (escopo adwords, acesso offline) | idem | code, state | redirect para o S21 | F10 |
| `action selectAdAccounts` | escolhe as contas e liga ao dashboard; enfileira o primeiro sync | admin do workspace | connectionId, ids externos, dashboardId | contas | F10 |
| `action createConnectLink` | link assinado de 24 h para outra pessoa conectar | admin do workspace | provider, dashboardId | URL | F10 |
| `action disconnectAdConnection` | apaga o token; o histórico fica | admin do workspace | connectionId | ok | F10 |
| `GET /api/shopify/install?shop=` | inicia o OAuth (read_orders, read_products, read_shopify_payments_disputes) | admin do workspace | shop | redirect | F11 |
| `GET /api/shopify/callback` | valida HMAC e state, troca o code, cria a loja, registra os webhooks, enfileira a importação | Shopify | code, hmac, shop, state | redirect para o S21 | F11 |
| `POST /api/webhooks/shopify` | valida o HMAC sobre o corpo cru (401 se inválido), grava a entrega pelo `X-Shopify-Webhook-Id`, responde 200 na hora, enfileira | Shopify | corpo + cabeçalhos | 200 ou 401 | F11 |
| aba UTMs de `/d/[id]/integrations` | modelos para copiar e gerador de UTMs orgânicas (no navegador) | membro do workspace | — | página | F12 |
| `action refreshDashboard` | sync agora (no máximo 1 a cada 5 min por conta) | membro do workspace | dashboardId | horário da última atualização | F13 |
| `GET /api/d/[dashboardId]/export` | CSV ou Excel da tabela aberta | membro do workspace | tabela, filtros, formato | arquivo | F13 |
| `action setAdObjectStatus` | liga ou desliga campanha, conjunto ou anúncio na API, depois atualiza local | admin do workspace (com confirmação) | objectId, nível, status | status novo ou erro | F14 |
| `action setAdObjectBudget` | orçamento diário na API | admin do workspace (com confirmação) | objectId, centavos | orçamento | F14 |
| `action saveCostSettings` | impostos com data de início | admin do workspace | dashboardId, pontos base, validFrom | ok | F15 |
| `action upsertAdditionalFee`, `deleteAdditionalFee` | taxas adicionais | admin do workspace | campos | ok | F15 |
| `action setProductCost` | custo do produto com data de início | admin do workspace | productId, centavos, validFrom | ok | F15 |
| `action createExpense`, `updateExpense`, `deleteExpense` | despesas | admin do workspace | campos | ok | F15 |
| `GET /api/link-targets?q=&dashboardId=` | busca campanhas, conjuntos, anúncios e produtos | membro do quadro e do workspace | q, dashboardId | resultados por nível | F16 |
| `action linkCard`, `unlinkCard` | vincula o card a um alvo | membro do quadro | cardId, alvo | vínculo | F16 |
| `action createCardFromRow` | card a partir de uma linha do relatório, já vinculado | membro do workspace e do quadro de destino | linha, listId | card | F16 |
| `action createDashboard`, `updateDashboard`, `deleteDashboard` | dashboards com fuso, moeda e plataformas | admin do workspace | campos | dashboard | F18 |
| `action createIntegrationTest` | gera a URL de teste com `itl_test` e as UTMs | admin do workspace | dashboardId, fonte, URL | link de teste | F19 |
| `action updateProfile` | nome, foto, @, bio, fuso, tema, preferências | o próprio | campos | ok | — |
| `action markNotificationsRead` | uma ou todas | o dono | ids ou "todas" | ok | — |
| `action updateWorkspace`, `changeWorkspaceRole`, `removeWorkspaceMember` | configurações e membros do workspace | admin do workspace | campos | ok | — |

Total: **14 rotas HTTP**, **73 server actions** e **21 páginas**.

### Webhooks

- **Entrada (Shopify):** `orders/create`, `orders/updated`, `orders/paid`,
  `orders/cancelled`, `refunds/create`, `disputes/create`, `disputes/update`
  (só Shopify Payments), `app/uninstalled`. Mais os três de privacidade
  (`customers/data_request`, `customers/redact`, `shop/redact`): obrigatórios
  só para a App Store, mas simples, e implementados mesmo assim.
- **Saída:** nenhum. A ação "requisição HTTP" da automação é uma linha could.
- **E-mail de saída:** convite e redefinição de senha.

### Jobs (pg-boss, cron no fuso America/Sao_Paulo)

| job | quando | faz |
| --- | --- | --- |
| `automation.evaluate` | a cada atividade nova, mais uma varredura por minuto das que ficaram sem checar | acha as regras cujo gatilho casa e enfileira as execuções |
| `automation.run` | sob demanda | executa as ações numa transação, grava a execução e as atividades com `depth + 1` |
| `automation.scheduled` | a cada minuto | roda as agendadas com `next_run_at` vencido e calcula a próxima |
| `automation.due-date` | a cada 5 min | regras "X dias antes ou depois da entrega" |
| `automation.metric-check` | a cada 5 min | regras de métrica vencidas pela frequência; uma execução por janela (`dedupe_key`) |
| `cards.due-reminders` | a cada 5 min | lembretes de prazo viram notificação |
| `meta.sync-structure`, `google.sync-structure` | de hora em hora e ao conectar | campanhas, conjuntos, anúncios e palavras-chave; religa pedidos que chegaram antes do anúncio existir aqui |
| `meta.sync-insights`, `google.sync-insights` | a cada 15 min (hoje e ontem); às 04h, os últimos 7 dias | gasto e métricas por anúncio e por dia |
| `ads.sync-hourly` | a cada 15 min | gasto por hora de hoje, por conta, para o relatório por hora |
| `shopify.process-delivery` | a cada webhook | grava pedido, itens e status; busca a jornada; atribui; marca teste de integração |
| `shopify.journey-retry` | 2, 10 e 60 min depois | jornada ainda vazia: tenta de novo, depois desiste ("não trackeada") |
| `shopify.backfill` | ao conectar | pedidos dos últimos 60 dias |
| `shopify.reconcile` | às 03h | pedidos alterados nos últimos 3 dias, para pegar webhook perdido |
| `fx.ptax` | dias úteis às 14h | cotação PTAX do Banco Central para as moedas das contas |
| `tokens.check` | às 08h | token do Meta perto de vencer ou do Google revogado: notificação e faixa no S21 |
| `cleanup` | às 05h | entregas de webhook com mais de 30 dias, execuções com mais de 90, sessões e convites vencidos, gasto por hora com mais de 35 dias, arquivos órfãos |

## As partes que mordem

- **Fusos:** o "Hoje" é o dia no fuso do dashboard. Pedidos ficam em UTC e são
  agrupados com `at time zone`. O gasto diário vem no fuso da conta de anúncio
  e não dá para reagrupar: ao conectar uma conta com fuso diferente do
  dashboard, o S21 avisa. Datas de card são `timestamptz` mostradas no fuso de
  quem vê. Agendadas usam o fuso salvo na automação, com nomes IANA. O Brasil
  não tem horário de verão desde 2019, mas contas e pessoas em outros países
  podem ter.
- **Idempotência:** entrega de webhook única por `X-Shopify-Webhook-Id`; pedido
  único por loja e id externo; evento mais antigo não sobrescreve
  (`source_updated_at`); insights com upsert pela chave única; execução de
  automação única por `(automation_id, dedupe_key)`, que cobre o duplo
  clique no botão (`clickId`) e a janela da regra de métrica.
- **Corridas:** dois usuários movendo o mesmo card: vale o último, e o SSE
  manda o estado final. Texto (descrição) tem `version`: quem salva com
  versão velha recebe conflito e vê as duas. Remover o último admin é checado
  com a linha travada. Sync manual e agendado da mesma conta não rodam juntos
  (singleton do pg-boss).
- **Limites das APIs:** no Meta, ler o cabeçalho `X-Business-Use-Case-Usage` e
  esperar acima de 75%. No Google, o nível de acesso define o limite diário de
  operações (consultar a página de níveis de acesso). Na Shopify, o GraphQL
  cobra por custo de consulta: ler `extensions.cost.throttleStatus`.
- **Tokens que vencem:**
  - O token longo do Meta dura cerca de 60 dias, então `tokens.check` avisa antes. Para uso interno, um token de usuário do sistema do Business Manager não vence: fica como plano B.
  - No Google, app com tela de consentimento "Externo" em modo "Teste" recebe refresh token que **vence em 7 dias**. Antes do uso real, publique a tela de consentimento, ou use o tipo "Interno" se a INtellect tiver Google Workspace.
- **Jornada da Shopify:**
  - Exige `read_orders`.
  - Vem vazia em pedido sem sessão na loja online (criado no admin, rascunho, PDV): esse pedido fica "não trackeado".
  - Pode ainda não estar pronta logo depois do pedido, por isso o `journey-retry`.
  - Sem o escopo `read_all_orders` (que precisa de pedido à Shopify), só os últimos 60 dias de pedidos estão acessíveis.
  - O app pode ser criado no Dev Dashboard dentro da organização da própria loja e instalado pelo card "Installs".
  - Em app personalizado, os dados protegidos de cliente ficam disponíveis sem revisão. Mesmo assim, não os guardamos.
- **Dados pessoais (LGPD):** nenhum dado pessoal do comprador é guardado; o
  payload é apagado depois de processado; os webhooks de privacidade são
  atendidos; usuário removido vira "usuário removido" no histórico.
- **Tamanho de arquivo:** anexos de até 25 MB pela rota de upload em stream (a
  server action aceita só 1 MB por padrão).
- **Busca:** `pg_trgm` + `unaccent` em nome e descrição, sempre filtrada pelos
  quadros que a pessoa vê. Basta para um time pequeno; busca dedicada só se
  ficar lenta.
- **Tempo real:** o NOTIFY carrega no máximo 8000 bytes, então manda só tipo e
  id, e o navegador busca o resto. Ao reconectar, o quadro é recarregado
  inteiro. Cada processo web mantém uma conexão LISTEN.
- **Offline:** não há. Sem conexão, aparece uma faixa e a edição fica
  bloqueada até voltar.
- **E-mail:** no computador, tudo cai no Mailpit. Em produção, o Resend com SPF
  e DKIM no domínio, para o convite não cair no spam.
- **Multi-tenant:** tudo pertence a um workspace; a checagem de acesso é a
  única porta de entrada, e o /replica-test cobre cada papel.
- **Atribuição:** IDs na URL, não nomes; anúncio que ainda não foi
  sincronizado guarda os ids externos em `attribution_keys` e é religado
  depois; Performance Max atribui só à campanha.
- **Loop de automação:** `depth` até 5; a mesma automação não roda duas vezes
  na mesma cadeia; regra de métrica dispara uma vez por janela.
- **Prisma:** as regras que vivem só no SQL (CHECK, índices parciais e de
  expressão, `nulls not distinct`, gatilhos) precisam ser conferidas a cada
  migração nova.

## Antes de usar dados reais (contas externas, só com o "sim" do usuário)

Nada disso é preciso para começar: a fatia vertical e os must-haves rodam com
integrações simuladas. Mas alguns pedidos demoram, então vale começar cedo:

1. **Google Ads API:** desde 09/09/2026 o acesso é pedido direto no Google
   Cloud Console, sem conta de administrador (MCC). O nível de acesso inicial
   só funciona com contas de teste; o acesso às contas reais exige aprovação
   do Google e verificação de marca do projeto. Pode levar dias.
2. **Meta for Developers:** app do tipo Business com a Marketing API. Quem
   conecta precisa ter papel no app e na conta de anúncio. Para uso interno, o
   acesso padrão costuma bastar, sem revisão do app.
3. **Shopify:** app no Dev Dashboard, criado na organização da loja e
   instalado pelo card "Installs". Escopos: `read_orders`, `read_products`,
   `read_shopify_payments_disputes`.
4. **Hospedagem, domínio e Resend:** só no /replica-deploy.

## Ordem de construção

Cada etapa termina rodando no computador. O usuário testa, e a próxima só
começa depois do "ok" dele.

1. **Fatia vertical** (feia, ponta a ponta, tudo simulado):
   - **Telas:** S01; S17 só com líquido, gasto, ROAS e lucro; S18 só com a aba Campanhas do Meta, sem edição; S19; S05 sem arrastar; S25 (badge).
   - **Tabelas:**
     - autenticação: users, sessions, accounts, verifications;
     - workspace: workspaces, workspace_members;
     - dashboards e anúncios: dashboards, dashboard_ad_accounts, dashboard_stores, ad_accounts, campaigns, ad_sets, ads, ad_insights_daily;
     - loja e pedidos: stores, webhook_deliveries, products, orders, order_items, order_events;
     - kanban e cola: boards, board_members, lists, cards, activities, card_links.
   - **Rotas:** `/api/auth/[...all]`, `POST /api/webhooks/shopify`, o job `shopify.process-delivery`, `action createCard` e `createCardFromRow`, as páginas `/d/[id]`, `/d/[id]/meta`, `/d/[id]/orders` e `/b/[boardId]`.
   - **Seed e script:** dados fictícios de campanhas e gasto, mais `npm run simulate:order`, que manda um pedido falso assinado.
   - **Pronto quando:** o pedido simulado aparece atribuído no S19, muda os números do S17 e muda o ROAS no badge do card.
2. **Must-haves**, por área:
   1. **Tracking (fase 1 do recon):**
      - **Telas:** S17 completo, S18 Meta e Google com abas, filtros e colunas, S21 (com as conexões reais do Meta, Google e Shopify, cada uma com o "sim" do usuário), S22 e S23 (impostos).
      - **Tabelas:** ad_connections, keywords, keyword_insights_daily, cost_settings.
      - **Rotas:** OAuth do Meta e do Google, `selectAdAccounts`, install e callback da Shopify, `saveCostSettings`.
      - **Jobs:** sync de estrutura e de insights, `shopify.journey-retry`, `shopify.backfill`, `shopify.reconcile`.
   2. **Kanban (fase 2):**
      - **Telas:** S01 a S12, com convites, papéis, arrastar e soltar, teclado, tempo real, verso do card, etiquetas, datas, checklists, comentários e filtro.
      - **Tabelas:** invites, board_stars, board_visits, card_members, labels, card_labels, checklists, checklist_items, comments.
      - **Rotas:** as actions de F01 a F06 e `GET /api/events`.
   3. **Automação e a cola (fase 3):**
      - **Telas:** S14, S15, S16, S24 e S25 completos.
      - **Tabelas:** automations, automation_runs.
      - **Jobs:** `automation.evaluate`, `automation.run`, `automation.metric-check`.
3. **Should-haves**, depois as could-haves por valor:
   - **Tracking:** S19 com detalhe, S20, S26, S27, S28, S29; ligar e desligar e orçamento no S18; exportar; teste de integração; multimoeda; gerador de UTMs orgânicas; 2FA.
   - **Kanban:** S13, S30, anexos, campos personalizados, notificações, busca global, atalhos, edição rápida, permissões do quadro, tema.
   - **Automação:** botões, agendadas, por data de entrega, variáveis.
   - **Tabelas:** two_factors, attachments, custom_fields, custom_field_values, notifications, product_costs, additional_fees, expenses, integration_tests, fx_rates, ad_account_insights_hourly.
4. **Correções do /replica-entrepreneur:** entram aqui depois que ele rodar.
