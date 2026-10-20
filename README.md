# INtellect

Kanban (estilo Trello) + rastreamento de vendas e anúncios (estilo UTMify) num app só.

## Abrir o app

```
npm run dev
```

Espere aparecer `Ready` e abra http://localhost:3000. A primeira abertura de cada tela demora alguns minutos neste notebook.

## Dois modos

- **Simulado** (`AUTH_MODE=fake` no `.env.local`, o padrão): login e dados de exemplo no arquivo `.data/store.json`. `npm run seed` apaga os dados de exemplo (o app recria na próxima abertura).
- **Real** (`AUTH_MODE=live`): login pelo Supabase Auth e dados no Supabase. Já ligados: login, perfil, workspace e convites (etapa 1), o kanban inteiro (etapa 2: quadros, listas, cards, etiquetas, checklists, comentários, notificações, compartilhar e fundo com imagem) e as automações (etapa 3: regras, botões, agendadas, por prazo, lembretes e histórico). Os dashboards entram na etapa 4; até lá aparecem zerados, e as regras por métrica (que dependem deles) ainda não têm dashboard para escolher.
- **Relógio da automação:** a cada minuto, roda as agendadas, as regras por prazo e os lembretes (`server/automation/clock.ts`, ligado pelo `instrumentation.ts`). Precisa de um servidor sempre ligado (Railway ou Render) e de **um só** servidor rodando o relógio. `AUTOMATION_CLOCK=off` desliga.

Como o modo real funciona por dentro: a cada tela ou ação, o app carrega do Supabase um "retrato" do que a pessoa pode ver, no mesmo formato do modo simulado (`server/live/snapshot.ts`). As mesmas regras rodam sobre ele, e no fim só o que mudou é gravado (`server/live/scope.ts`).

## Testes

| Comando | O que faz |
| --- | --- |
| `npm test` | testes de unidade (sem banco) |
| `npm run test:e2e` | percorre o app no navegador (Edge), no modo simulado, com `npm run dev` ligado e dados de exemplo limpos |
| `npm run test:live` | regras de acesso (RLS) e o kanban contra o projeto de TESTE do Supabase (chaves no `.env.test.local`) |
| `npm run test:e2e:live` | o kanban no navegador, no modo real (veja abaixo) |

### Testar o modo real

1. Num terminal: `npm run dev:teste-real`. Ele liga o app no modo real, apontado para o projeto de **teste** (`intellect-teste`), sem mexer no `.env.local`.
2. Em outro terminal: `npm run test:e2e:live`. Ele cria duas pessoas temporárias, percorre o kanban e apaga tudo no fim.

Nada disso toca o projeto principal.

## Supabase

- Projeto principal: `dxtytutmrsbeuwaiqlxi` (o CLI fica ligado nele).
- Projeto de teste: `aqaijwpnudhftlxwsfdm`.
- Migrações em `supabase/migrations/`.
- Primeira conta de admin no projeto principal: `npm run admin:criar` (a senha é pedida no terminal).
