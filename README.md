# INtellect

Kanban (estilo Trello) + rastreamento de vendas e anúncios (estilo UTMify) num app só.

## Abrir o app

```
npm run dev
```

Espere aparecer `Ready` e abra http://localhost:3000. A primeira abertura de cada tela demora alguns minutos neste notebook.

## Dois modos

- **Simulado** (`AUTH_MODE=fake` no `.env.local`, o padrão): login e dados de exemplo no arquivo `.data/store.json`. `npm run seed` apaga os dados de exemplo (o app recria na próxima abertura).
- **Real** (`AUTH_MODE=live`): login pelo Supabase Auth e dados no Supabase. Já ligados: login, perfil, workspace e convites (etapa 1), o kanban inteiro (etapa 2: quadros, listas, cards, etiquetas, checklists, comentários, notificações, compartilhar e fundo com imagem), as automações (etapa 3: regras, botões, agendadas, por prazo, lembretes e histórico), os dashboards (etapa 4: Resumo, Meta, Google, Vendas, Painéis, taxas, despesas, integrações, cotação do câmbio, o ROAS nos cards e o webhook da Shopify) e os anexos dos cards (etapa 5: arquivo de até 25 MB no Storage, link, renomear, baixar, imagem como capa e copiar o card com os anexos).
- **Relógio da automação:** a cada minuto, roda as agendadas, as regras por prazo e os lembretes (`server/automation/clock.ts`, ligado pelo `instrumentation.ts`). Precisa de um servidor sempre ligado (Railway ou Render) e de **um só** servidor rodando o relógio. `AUTOMATION_CLOCK=off` desliga.

Como o modo real funciona por dentro: a cada tela ou ação, o app carrega do Supabase um "retrato" do que a pessoa pode ver, no mesmo formato do modo simulado (`server/live/snapshot.ts`). As mesmas regras rodam sobre ele, e no fim só o que mudou é gravado (`server/live/scope.ts`).

Desempenho: as telas de dashboard carregam as vendas e os anúncios do workspace inteiro (cerca de 1 s a mais com mil pedidos e 90 dias de anúncios, medido no projeto de teste). Com dezenas de milhares de pedidos isso vai pesar; o próximo passo, quando chegar lá, é a soma ser feita pelo banco (função SQL) em vez de no servidor. Cada pedido ao Supabase tem limite de 25 s (`server/db/admin.ts`): de vez em quando um fica pendurado, e o limite faz a leitura tentar de novo em vez de esperar.

## Testes

| Comando | O que faz |
| --- | --- |
| `npm test` | testes de unidade (sem banco) |
| `npm run test:e2e` | percorre o app no navegador (Edge), no modo simulado, com `npm run dev` ligado e dados de exemplo limpos |
| `npm run test:live` | regras de acesso (RLS), kanban, automações, dashboards e anexos contra o projeto de TESTE do Supabase (chaves no `.env.test.local`) |
| `npm run test:e2e:live` | o kanban (com anexos) no navegador, no modo real (veja abaixo) |
| `npm run test:e2e:live:vendas` | Resumo, Meta, Google, Vendas, taxas, despesas, Painéis e o webhook da Shopify no navegador, no modo real |

### Testar o modo real

1. Num terminal: `npm run dev:teste-real`. Ele liga o app no modo real, apontado para o projeto de **teste** (`intellect-teste`), sem mexer no `.env.local`.
2. Em outro terminal: `npm run test:e2e:live` (kanban) ou `npm run test:e2e:live:vendas` (dashboards). Cada um cria pessoas e dados temporários, percorre as telas e apaga tudo no fim.
3. Para usar o modo real à mão, com dados: `npm run seed:teste-real` grava no projeto de teste os mesmos dados de exemplo do modo simulado. Depois é só entrar como `ana@intellect.test` com a senha `DEMO_PASSWORD` do `.env.local`. Rodar de novo apaga e grava tudo outra vez.

Nada disso toca o projeto principal.

## Supabase

- Projeto principal: `dxtytutmrsbeuwaiqlxi` (o CLI fica ligado nele).
- Projeto de teste: `aqaijwpnudhftlxwsfdm`.
- Migrações em `supabase/migrations/`. Para aplicar as novas no principal: `npm run db:push` (confira antes com `..\tools\supabase-cli\supabase.exe db push --linked --dry-run`).
- Anexos: bucket privado `attachments` (`cards/<id do card>/<arquivo>`, até 25 MB). Imagens enviadas (foto, plano de fundo, fundo de quadro): bucket privado `uploads`.
- Primeira conta de admin no projeto principal: `npm run admin:criar` (a senha é pedida no terminal).
