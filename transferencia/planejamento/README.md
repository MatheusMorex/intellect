# INtellect

Kanban (estilo Trello) + rastreamento de vendas e anúncios (estilo UTMify) num app só.

**O código não fica aqui.** Fica em `C:\Users\Soare\dev\intellect`, fora do
OneDrive, porque a pasta `node_modules` tem milhares de arquivos e o OneDrive
trava e deixa tudo lento.

Nesta pasta ficam só o planejamento (`replica/`) e o logo.

## Como abrir

No terminal:

```
cd C:\Users\Soare\dev\intellect
npm run dev
```

Espere aparecer `Ready` e abra http://localhost:3000. A primeira tela demora
um pouco pra compilar.

Login de teste: `ana@intellect.test` (ou `bruno@` / `carla@`). A senha é o
valor de `DEMO_PASSWORD` em `C:\Users\Soare\dev\intellect\.env.local`.

## Variáveis de ambiente

O app só lê o `.env.local` da pasta do código (`C:\Users\Soare\dev\intellect`).
As chaves do Supabase já foram copiadas pra lá.

## Supabase

O banco foi criado no Supabase em 2026-10-14. São 6 migrações (pasta
`C:\Users\Soare\dev\intellect\supabase\migrations\`):

- Aplicadas nos dois projetos: as 48 tabelas com RLS e o bucket privado de
  imagens; a proteção do e-mail no perfil; o dólar + início da semana no
  dashboard; os painéis salvos.
- Aplicadas só no projeto de teste (2026-10-20 e 21), **faltam no principal**:
  a cobertura das cotações do câmbio (`fx_coverage`) e o bucket privado dos
  anexos (`attachments`). Para aplicar: `npm run db:push` na pasta do código
  (o CLI já está ligado no principal) e responder `Y`.

- Projeto principal: `dxtytutmrsbeuwaiqlxi` (o CLI fica ligado nele)
- Projeto de teste: `aqaijwpnudhftlxwsfdm`, para os testes automáticos de
  segurança (`npm run test:live`, com as chaves no `.env.test.local`)
- Primeira conta de admin: `npm run admin:criar` (a senha é pedida no terminal)

Com `AUTH_MODE=live` já funcionam o login real (etapa 1), o kanban inteiro
(etapa 2, 2026-10-20: quadros, listas, cards, etiquetas, checklists,
comentários, notificações, compartilhar e fundo com imagem), as automações
(etapa 3, 2026-10-20: regras, botões, agendadas, por prazo, lembretes e
histórico), os dashboards (etapa 4, 2026-10-21: Resumo, Meta, Google, Vendas,
Painéis, taxas, despesas, integrações, câmbio, ROAS nos cards e o webhook da
Shopify) e os anexos dos cards (etapa 5, 2026-10-21: arquivo de até 25 MB,
link, renomear, baixar, imagem como capa, copiar o card com os anexos). Com
isso, as 5 etapas da troca para o Supabase estão feitas.

Para testar o modo real sem tocar no projeto principal: `npm run dev:teste-real`
num terminal e, em outro, `npm run test:e2e:live` (kanban e anexos) ou
`npm run test:e2e:live:vendas` (dashboards). Para usar à mão com dados:
`npm run seed:teste-real` e entrar como `ana@intellect.test` (veja o README do código).

## Onde mudar as coisas

- Configurações (menu lateral, embaixo): tema, plano de fundo, menu lateral,
  frases, tela inicial, foto de perfil, moeda e regras do dashboard, workspace.
- Fundo de cada quadro: menu “…” do quadro → “Mudar o fundo (papel de parede)”.
- Campos personalizados (verba, ID da campanha…): menu “…” do quadro →
  “Campos personalizados”, ou o botão “Campos” no verso do card. Automações
  podem reagir a um campo e preencher campos.
- Criar ou excluir dashboards: Configurações → “Vendas e moeda” → link
  “Dashboards” (endereço `/settings/dashboards`). Ao criar, abre a
  configuração inicial (passo a passo das contas, loja e teste).
- Vendas por parâmetro do link (utm_source, utm_campaign…): menu “UTMs” do dashboard.
- Ordenar os cards de uma lista (prazo, nome, mais novos, mais antigos): menu “…” da lista → “Ordenar cards por…”. Também existe como ação de automação.
- Editar o card sem abrir: lápis no canto do card (etiquetas, membros, prazo, capa, copiar, mover, arquivar).
- Atalhos no quadro (mouse em cima do card): N novo card, E edição rápida, L etiquetas, M membros, D prazo, C arquivar. A tecla ? mostra todos.
- Planilha do Excel dos relatórios Meta, Google e UTMs: botão “Exportar Excel”, ao lado do “Exportar CSV”.
- Testar um chargeback no modo simulado: `npm run simulate:order -- --chargeback "#1001"`
  (e `--ganhou "#1001"` para a disputa ganha).
- Frases do login e da barra de cima: `lib/taglines.ts`.
- Textos dos botões “?”: `lib/help.ts`.

## Ramos do git

- `etapa5-anexos`: ramo atual. Vendas e anúncios (etapa 4) e anexos (etapa 5) no Supabase (commit `0dd7517`, 2026-10-21); UTMs, Dashboards, configuração inicial, chargeback e campos personalizados (`970a266`); ordenar lista, edição rápida, ação de automação "ordenar lista" e exportar Excel (`48a8364`, 2026-10-22); atalhos de teclado no card (`fb0d7f9`); verificação em duas etapas, só no modo real (`12a370a`, falta o teste no navegador). Todos os ramos estão no GitHub: https://github.com/MatheusMorex/intellect
- `etapa3-automacoes`: as automações no Supabase (etapa 3, 2026-10-20)
- `etapa2-kanban`: o kanban no Supabase (etapa 2, 2026-10-20), feito a partir do `paineis`
- `paineis`: o módulo de gráficos "Painéis" (fases 1 a 6 prontas em 2026-10-20)
- `etapa1-login-real`: login real no Supabase e testes de segurança (2026-10-17)
- `build`: versão de 2026-10-14, ponto de segurança antes da troca para o Supabase
- `backup-antes-correcao`: cópia de 2026-10-13, antes de remover as telas
  duplicadas que travavam o app
