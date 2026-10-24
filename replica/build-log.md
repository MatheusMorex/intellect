# Log do build

Código em `C:\Users\Soare\dev\intellect`, ramo `build`. Dados simulados em
`.data/` (arquivo JSON) atrás das mesmas funções de `server/data` que o banco
vai usar no `/replica-backend`. Capturas em `replica/clone-screens/`.

## Etapa 1: base e fatia vertical (2026-10-12)

Pronto quando: o pedido simulado aparece atribuído no S19, muda os números do
S17 e o ROAS do badge do card. **Conferido:**
- `npm run simulate:order -- --campanha remarketing --valor 497,00` criou o pedido #1965;
- o pedido apareceu no S19 atribuído a Meta › [Vendas] Remarketing 30d › Carrossel prova social;
- o líquido de hoje foi de R$ 1.822,47 para R$ 2.319,47 e o ROAS de 2,75 para 3,50;
- o badge do card foi de ROAS 4,00 para 4,91.

Webhook: assinatura errada recebe 401; a mesma entrega duas vezes vira um
pedido só; o corpo é apagado depois de processado. 20 testes automáticos
(fórmulas e atribuição) passam com `npm test`.

| tela | data | situação | o que falta | mais difícil que o esperado |
| --- | --- | --- | --- | --- |
| base | 2026-10-12 | feito | — | rotas de todas as telas (as que não são desta etapa mostram "em construção"); menu lateral que recolhe e vira gaveta no celular; login e sessão simulados |
| S01 Login | 2026-10-12 | parcial | 2FA, login com Google, limite de tentativas (Better Auth, no backend) | — |
| S03 Início | 2026-10-12 | parcial | favoritos, vistos recentemente, criar quadro | — |
| S05 Quadro | 2026-10-12 | parcial | arrastar e soltar, editar e arquivar listas, filtro, tempo real, menu do quadro | — |
| S06 Verso do card | 2026-10-12 | parcial | é uma página simples com o painel de métrica; o modal completo vem na fase do kanban | — |
| S17 Resumo | 2026-10-12 | parcial | bruto, ROI, margem, reembolsos, impostos e custos, gráficos, filtros por conta e produto, período personalizado | o "Hoje" no fuso do dashboard para pedido e gasto |
| S18 Meta e Google | 2026-10-12 | parcial | abas Contas, Conjuntos e Anúncios, colunas configuráveis, ligar e pausar, orçamento, exportar | — |
| S19 Vendas | 2026-10-12 | parcial | detalhe do pedido com o histórico, busca, exportar | — |
| S25 Badge | 2026-10-12 | feito | — | — |

Notas:
- O npm desta máquina é muito lento (rede), e o `npx shadcn` travou no cache
  (EPERM). Os componentes do shadcn/ui foram escritos à mão.
- `cacheComponents` do Next 16 ficou desligado: toda tela usa a hora atual.
- O Git Bash converte argumentos como `/b/…` em `B:/…` ao chamar programas do
  Windows; o script de captura usa `MSYS_NO_PATHCONV=1`.

## Etapa 2.1: tracking (2026-10-13)

Teste de ponta a ponta (`npm run test:e2e`, 17 passos no Edge) passando: login
com senha certa e errada, criar card, período e filtros, criar card a partir
da campanha, pausar e ativar, orçamento, impostos (com erro de valor), lançar
e excluir despesa, teste de integração recebendo o pedido simulado, detalhe do
pedido, sair e nenhum erro no console. 27 testes de unidade (fórmulas,
atribuição e custos) passam com `npm test`.

| tela | data | situação | o que falta | mais difícil que o esperado |
| --- | --- | --- | --- | --- |
| S17 Resumo | 2026-10-13 | feito | meta de faturamento no topo (could), filtro por tipo de venda (could) | impostos que mudam com o tempo: o imposto é somado dia a dia; despesa não entra quando há filtro |
| S18 Meta e Google | 2026-10-13 | feito | colunas de leilão, exportar .xlsx, duplicar campanha (could) | — |
| S19 Vendas | 2026-10-13 | feito | — | — |
| S21 Integrações | 2026-10-13 | parcial | OAuth real do Meta e do Google e app da Shopify: só com o sim do dono e contas de desenvolvedor; pixel e WhatsApp estão fora | — |
| S22 Rastreamento | 2026-10-13 | feito | script de UTMs para página fora da Shopify (só se existir) | — |
| S23 Taxas | 2026-10-13 | feito | — | — |
| S26 Despesas | 2026-10-13 | feito | — | despesa mensal no dia 31 cai no último dia dos meses curtos |

## Etapa 2.2: kanban (2026-10-13)

Teste de ponta a ponta com 28 passos (os 17 de antes e mais 11 do kanban):
abrir card com Enter, descrição salva com Ctrl+Enter, checklist até 100%,
comentário com @menção que vira notificação, Esc fecha e o teclado move o card
de lista (Espaço, seta, Espaço), convite por e-mail com link, conta nova pelo
convite (senha fraca dá erro e o nome digitado continua), busca com "/",
criar quadro, modo para daltônicos e o sino do Bruno com a menção.

| tela | data | situação | o que falta | mais difícil que o esperado |
| --- | --- | --- | --- | --- |
| S02 Aceitar convite | 2026-10-13 | feito | — | o React 19 limpa o formulário depois do envio; o servidor devolve nome e e-mail para não perder o que foi digitado |
| S03 Início | 2026-10-13 | feito | atividade recente no Início (está no perfil) | — |
| S04 Criar quadro | 2026-10-13 | feito | fundo com foto (fora do recorte) | — |
| S05 Quadro | 2026-10-13 | feito | recolher lista, ordenar lista, copiar lista e quadro (could) | arrastar com teclado entre listas e o id estável do dnd-kit (sem ele o servidor e o navegador geram ids diferentes) |
| S06 Verso do card | 2026-10-13 | feito | anexos e campos personalizados (should, próxima etapa) | conflito de descrição quando duas pessoas editam ao mesmo tempo |
| S07 Popovers do card | 2026-10-13 | parcial | anexo (should) | — |
| S08 Menu do quadro | 2026-10-13 | feito | exportar/imprimir, copiar quadro, campos personalizados (could/should) | — |
| S09 Compartilhar | 2026-10-13 | feito | solicitações para entrar (could) | — |
| S10 Busca e filtro | 2026-10-13 | feito | — | — |
| S11 Notificações | 2026-10-13 | parcial | aviso de prazo chegando e lembrete (precisam de jobs agendados, no backend) | — |
| S12 Workspace | 2026-10-13 | parcial | quem cria e exclui quadros, logo, excluir workspace (could) | — |
| S13 Perfil | 2026-10-13 | parcial | foto de perfil; troca de senha e 2FA vêm com o login real | — |
| S30 Meus cards | 2026-10-13 | feito | — | — |

Notas:
- O tempo real é SSE com consulta de 1 em 1 segundo ao carimbo do quadro. No
  backend real vira LISTEN/NOTIFY do Postgres, sem mudar as telas.
- As capturas agora usam o Playwright (`npm run screenshots`). O Edge headless
  direto travava no quadro, porque a conexão de tempo real nunca termina.
