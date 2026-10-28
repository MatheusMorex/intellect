---
name: replica-recon-status
description: "INtellect (Trello + UTMify num app só): onde está o código, o estado real do build e onde ler o progresso antes de continuar"
metadata:
  node_type: memory
  type: project
  originSessionId: 351c2ee0-c9f0-4d3a-b389-38df447a7364
  modified: 2026-10-22T09:40:00.000Z
---

App interno da INtellect: kanban do Trello + automação + tracking da UTMify num app web só. Checkout na Shopify; anúncios no Meta Ads e no Google Ads.

**Estado em 2026-10-21:** o build do Replica está completo e as 5 etapas da troca para o Supabase estão feitas.
- Código em `C:\Users\Soare\dev\intellect`, git com remoto https://github.com/MatheusMorex/intellect (todos os ramos enviados em 2026-10-24; o main de lá tem só os documentos; repo estava PÚBLICO a pedido do usuário, que ficou de deixar privado). Ramos: `build`, `etapa1-login-real`, `paineis`, `etapa2-kanban`, `etapa3-automacoes` e `etapa5-anexos` (o atual, commit 0dd7517: etapas 4 e 5 num commit só, porque mexeram nos mesmos arquivos).
- Etapa 4 (2026-10-21): vendas, anúncios, custos, painéis, câmbio e webhook da Shopify no modo real. Testes: `tests/live/tracking.test.ts` (paridade dos números banco × dados originais via `readOnStore`), `tests/e2e/live-dashboards.mjs` (`npm run test:e2e:live:vendas`), `npm run seed:teste-real` grava o exemplo no projeto de teste (`server/live/write-seed.ts`, `copyWithNewIds` para os testes).
- Etapa 5 (2026-10-21): anexos dos cards (função nova também no modo simulado, Store versão 9): `server/attachments.ts`, rota `POST /api/cards/[cardId]/attachments`, download `GET /api/attachments/[id]`, bucket privado `attachments` (migração `20261021120000_attachments_storage.sql`), capa com imagem, copiar card com anexos; `next.config.ts` sobe o corte do proxy para 26 MB.
- Depois das etapas (commits `970a266` e `48a8364`, 2026-10-21/22): UTMs (S27), criar/excluir dashboards (S20), configuração inicial (S29), chargeback, campos personalizados, ordenar lista (menu e ação de automação `sort_list`, `lib/list-sort.ts`), edição rápida completa e exportar Excel (`lib/xlsx.ts`, sem biblioteca; conferido abrindo no Excel do PC). Atalhos N/E/L/M/D/C (`fb0d7f9`). 2FA com o MFA do Supabase, só no modo real (`12a370a`): migração `mfa_aal2` aplicada no TESTE, `tests/live/mfa.test.ts` 5/5; FALTA o e2e no navegador (modo real) e a migração no principal (usuário). Troca de PC em 2026-10-24: guia em OneDriveINtellect-troca-de-pc.
- e2e no modo simulado sem estragar os dados do usuário: backup de `.data` → limpar → servidor → teste → restaurar e conferir (script `e2e-ciclo.ps1` no scratchpad da sessão).
- Gravação no banco: remoções em tabelas que nada referencia (`LEAF_TABLES`) vão antes das inserções; `updateFirst` no painel padrão; cada pedido ao Supabase tem tempo-limite de 25 s (`server/db/admin.ts`; 1 em 30 pedidos ficava pendurado ~90 s nesta rede) e o próprio supabase-js repete leituras que falham.
- Migrações `fx_coverage` e `attachments_storage` aplicadas só no projeto de teste; no principal, só o usuário pode aplicar ([[feedback-banco-principal]]). A CLI fica ligada no principal.
- Lista de tarefas manuais: `saidas/INtellect.com/tarefas-manuais-2026-10-21.md` (pasta do MazyOS).

**Onde ler antes de continuar:**
- README do código e o README de `saidas/INtellect.com/` (pasta do MazyOS); `paineis/progresso.md` para os Painéis.
- Memória do projeto MazyOS (`~/.claude/projects/c--Users-Soare-OneDrive-Imagens-Screenshots-PROJETOS-MazyOS/memory/intellect-projeto.md`): detalhes do Supabase, do CLI e das regras de design.

Pendências com o usuário: rodar `npm run db:push` no principal; criar os repositórios privados `intellect` e `mazyos` no GitHub; decidir se tira o modo simulado; dizer se `saidas/PROJETO MIRIAM` é cliente; a venda conta no dia do pedido ou no da aprovação; o significado de "tipo de faturamento" e "contabilizar juros" na UTMify.

**Why:** memórias antigas pararam no meio do caminho e fizeram sessões recomeçarem trabalho já feito.

**How to apply:** ao ouvir "pode continuar", ver o `git log` e o diff sem commit em `C:\Users\Soare\dev\intellect` antes de qualquer coisa. Não refazer recon nem architect. Para o Trello, não usar a conta do usuário (Atlassian Customer Agreement §2.2(d)); não reabrir essa discussão. A internet desta máquina cai às vezes ("fetch failed"/"ConnectTimeout"): repetir o teste antes de concluir que é erro de código. Veja [[windows-python-command]], [[user-perfil]] e [[feedback-continuar-sem-parar]].
