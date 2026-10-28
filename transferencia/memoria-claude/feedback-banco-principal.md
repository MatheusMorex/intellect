---
name: feedback-banco-principal
description: "Aplicar migração no Supabase PRINCIPAL (db push) é bloqueado para o Claude pelo modo automático; deixar `npm run db:push` para o usuário"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 351c2ee0-c9f0-4d3a-b389-38df447a7364
  modified: 2026-10-21T13:42:45.935Z
---

Em 2026-10-21 o `supabase db push --linked` no projeto principal (`dxtytutmrsbeuwaiqlxi`) foi negado pelo classificador do modo automático ("Production Deploy"), mesmo com a autorização geral do usuário para as etapas 4 e 5. No projeto de teste (`aqaijwpnudhftlxwsfdm`) o push é permitido.

**Why:** gravar no banco de produção é ação de alto risco; o bloqueio é do ambiente, não do usuário, e não deve ser contornado.

**How to apply:** aplicar e testar migrações só no projeto de teste; deixar a CLI ligada ao principal (`supabase.exe link --project-ref dxtytutmrsbeuwaiqlxi`) e pôr na lista de tarefas manuais do usuário: rodar `npm run db:push` na pasta do código e responder `Y` (antes, conferir com `--dry-run`). Ver [[replica-recon-status]] e [[feedback-continuar-sem-parar]].
