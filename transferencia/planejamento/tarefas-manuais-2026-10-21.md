# Tarefas manuais — 2026-10-21

O que ficou para você fazer depois das etapas 4 e 5 da troca para o Supabase.
Em ordem de importância. Nenhuma custa dinheiro.

> Atualizado em 24/10: agora são **3** migrações (entrou `20261022120000_mfa_aal2.sql`, da verificação em duas etapas) e o código já está no GitHub (https://github.com/MatheusMorex/intellect, ramo `etapa5-anexos`). Deixe o repositório **privado**. Para trocar de PC: `OneDriveINtellect-troca-de-pcCOMO-ABRIR-NO-PC-NOVO.md`.

## 1. Aplicar as migrações novas no banco principal (5 minutos)

O Claude não tem permissão para gravar no banco principal (o próprio Claude Code
bloqueia). No projeto de teste elas já estão aplicadas e testadas.

1. Abra um terminal (PowerShell).
2. Rode:
   ```
   cd C:\Users\Soare\dev\intellect
   ..\tools\supabase-cli\supabase.exe db push --linked --dry-run
   ```
   Tem que aparecer só estas duas:
   `20261020120000_fx_coverage.sql`, `20261021120000_attachments_storage.sql` e `20261022120000_mfa_aal2.sql`.
3. Se estiver certo, rode `npm run db:push` e responda `Y`.
4. Tem que terminar com `Finished supabase db push.`

Se der "TransportError" ou "fetch failed", é a internet: espere um pouco e
rode de novo (o passo 2 mostra o que ainda falta).

## 2. Criar os repositórios no GitHub (10 minutos)

Ainda não existe cópia do código fora do seu notebook.

1. Em github.com, crie dois repositórios **privados e vazios** (sem README):
   `intellect` e `mazyos`.
2. Mande os dois endereços para o Claude. Ele liga e envia o código.

## 3. Testar o modo real com dados (15 minutos, quando quiser)

1. Terminal 1: `cd C:\Users\Soare\dev\intellect` e `npm run seed:teste-real`
   (grava os dados de exemplo no projeto de **teste**).
2. Ainda no terminal 1: `npm run dev:teste-real`. Espere o `Ready`.
3. Abra http://localhost:3000 e entre com `ana@intellect.test` e a senha
   `DEMO_PASSWORD` do `.env.local`.
4. Experimente: Resumo, Meta, Google, Vendas, Painéis; e num card, o botão
   "Anexo" (arquivo do computador ou link). Tudo isso já grava no Supabase.

## 4. Decisões que só você pode tomar

1. **Tirar o modo simulado?** O plano era tirar depois da troca. Ele ainda é
   útil para testes rápidos sem internet. Diga se quer tirar agora ou depois.
2. **A pasta `saidas/PROJETO MIRIAM`** (no MazyOS) é uma cópia do MazyOS. É de
   uma cliente? Se for, diga quem é e o que você faz para ela, para entrar em
   `_memoria/empresa.md`.
3. Perguntas antigas que continuam abertas:
   - a venda conta no dia do pedido ou no dia da aprovação do pagamento?
   - o que a UTMify chama de "tipo de faturamento" e de "contabilizar juros"?

## 5. Quando for usar de verdade (não é para agora)

- Primeira conta de admin no banco principal: `npm run admin:criar`.
- As integrações reais (Meta Ads, Google Ads e Shopify) precisam de contas de
  desenvolvedor suas em cada plataforma. O Claude explica o passo a passo
  quando chegar a hora.
- Colocar o app no ar (Railway ou Render) tem custo mensal: decidir antes.
