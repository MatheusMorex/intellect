Você vai continuar o desenvolvimento do **INtellect** neste PC novo. O dono é o Matheus. Ele é iniciante em programação, fala português do Brasil e quer passos numerados, com evidência de que tudo foi testado. Trabalhe de forma profissional e técnica: não pule etapas, não suponha que algo funciona sem rodar, não declare "pronto" sem mostrar a saída dos testes. Se algo falhar, investigue a causa raiz antes de mudar código. Responda sempre em português, com acentuação correta.

# 0. Contexto do projeto

- **O que é:** um app web que junta kanban (estilo Trello: quadros, listas, cards, automações) e rastreamento de vendas e anúncios (estilo UTMify: dashboards, Meta Ads, Google Ads, Shopify, UTMs, painéis de gráficos).
- **Stack:** Next.js 16.4 (Turbopack, `proxy.ts`, `experimental.proxyClientMaxBodySize: "26mb"`), React 19, Tailwind 4, zod, TypeScript, Supabase (Auth, PostgREST, Storage, RLS, MFA) e supabase-js 2.117.
- **Repositório:** https://github.com/MatheusMorex/intellect
  - Ramo de trabalho: `etapa5-anexos`. Último commit: `12a370a` (verificação em duas etapas).
  - O `main` do repositório tem só os documentos de planejamento, com outra história. Não faça merge do `main` no código.
  - Outros ramos são pontos de restauração: `build`, `etapa1-login-real`, `etapa2-kanban`, `etapa3-automacoes`, `paineis`, `backup-antes-correcao`.
- **Dois modos do app:**
  - `AUTH_MODE=fake`: tudo em `.data/store.json`, com usuários de teste e botões "Entrar como…".
  - `AUTH_MODE=live`: Supabase de verdade. Um snapshot por requisição via AsyncLocalStorage; as gravações saem por `diffSnapshot`/`flushChanges` (`server/live/snapshot.ts`, `tables.ts`).
- **Projetos Supabase:**
  - Principal: `dxtytutmrsbeuwaiqlxi`. É de PRODUÇÃO: você NÃO grava nem aplica migração nele.
  - Teste: `aqaijwpnudhftlxwsfdm`. Todos os testes destrutivos rodam aqui. Os testes já travam pela URL.
- **Documentação de planejamento:** fica no OneDrive, em `OneDrive\Imagens\Screenshots\PROJETOS\MazyOS\saidas\INtellect.com\`.
  - `README.md`, `tarefas-manuais-2026-10-21.md`.
  - Em `replica/`: `features.csv` (matriz de funcionalidades: colunas `feature,area,priority,original,clone,notes,source`), `build-log.md`, `recon.md`, `architecture.md`.
- **Memória anterior:** está em `OneDrive\INtellect-troca-de-pc\memoria-do-claude\`. Leia TODOS os arquivos e grave o conteúdo no seu sistema de memória, ajustando os caminhos deste PC. O mais importante é `replica-recon-status.md`.

# 1. Regras que você NUNCA quebra

1. **Chaves secretas:**
   - Nunca peça que o Matheus cole chave no chat.
   - Nunca imprima o conteúdo de `.env.local` ou `.env.test.local` (para ler valores não secretos, use `grep` só na linha do valor).
   - Nunca faça commit de `.env*` ou `.data/`. O `.gitignore` já cobre esses arquivos: confira antes de cada commit.
2. **Banco principal:** não rode `db push` no projeto principal; o ambiente bloqueia isso, e não contorne. Migrações novas:
   - Você aplica no projeto de teste: `supabase link --project-ref aqaijwpnudhftlxwsfdm`, depois `db push --linked --dry-run`, depois `db push --linked --yes`.
   - Em seguida, **religue no principal** (`link --project-ref dxtytutmrsbeuwaiqlxi`) e confira `supabase/.temp/project-ref`.
   - Coloque `npm run db:push` na lista de tarefas manuais do Matheus.
3. **Gastos e serviços externos:** não gaste dinheiro, não crie contas em serviços externos e não publique nada fora do PC ou do GitHub dele sem pedir.
4. **Trello:** não use a conta Trello do Matheus para nada (Atlassian Customer Agreement §2.2(d)). Não reabra esse assunto.
5. **Dados do Matheus:** os dados do modo simulado (`.data/`) são dele.
   - Antes de qualquer e2e no modo simulado: faça backup de `.data`, limpe, rode, restaure e confira com hash que ficou idêntico.
   - Antes de restaurar, mate o servidor de desenvolvimento (inclusive o processo filho `start-server.js` que fica na porta 3000). Senão ele grava por cima.
6. **Commits:** mensagens em português, terminando com a linha de coautoria. Push só para o próprio repositório dele.

# 2. Montar o ambiente (faça e mostre a saída de cada passo)

1. Confira as versões: `node -v` (precisa ser 24.x), `git --version` e `npm -v`.
2. O código fica **fora do OneDrive**, em `$HOME\dev\intellect`; o `node_modules` trava o OneDrive.
   - Se a pasta ainda não existir: `git clone https://github.com/MatheusMorex/intellect.git`, depois `git checkout etapa5-anexos`.
   - Configure `git config user.name "Matheus Soares"` e `git config user.email "soaresmoreiramatheus@gmail.com"` só neste repositório.
3. Rode `npm install` e confira que terminou sem erro.
4. Arquivos de chaves:
   - Confira se `.env.local` e `.env.test.local` existem na raiz, sem mostrar o conteúdo.
   - Se não existirem: os modelos estão em `OneDrive\INtellect-troca-de-pc\chaves-modelo\`. Guie o Matheus, passo a passo e numerado, a preencher e salvar com o nome exato. As chaves vêm do painel do Supabase: Project Settings → API Keys, publishable e secret, uma vez por projeto.
   - Valide sem expor nada: confira que cada variável obrigatória está presente e não vazia (por exemplo, `node -e` que só imprime `ok`/`faltando: NOME`).
5. Dados de teste, opcional: copie `OneDrive\INtellect-troca-de-pc\dados-de-teste\*` para `.data\` se o Matheus quiser os mesmos dados do PC antigo.
6. Supabase CLI:
   - Baixe `supabase_windows_amd64.tar.gz` em https://github.com/supabase/cli/releases/latest e coloque o `supabase.exe` em `$HOME\dev\tools\supabase-cli\` (os scripts usam `..\tools\supabase-cli\supabase.exe`).
   - Depois: `npm run db:login` (o Matheus faz o login no navegador) e `npm run db:link` (liga no principal).
   - Rode `db push --linked --dry-run`. Deve listar exatamente 3 migrações pendentes no principal: `20261020120000_fx_coverage.sql`, `20261021120000_attachments_storage.sql` e `20261022120000_mfa_aal2.sql`. Mostre isso ao Matheus; quem aplica é ele, com `npm run db:push`.
7. Navegador dos testes: o Playwright usa o **Microsoft Edge** instalado (`channel: "msedge"`). Confira que o Edge existe.

# 3. Verificação completa antes de mexer em qualquer código

Rode tudo e mostre os números. Se algo falhar, pare e investigue antes de seguir.

1. `npm run typecheck`: precisa ser 0 erros.
2. `npm run lint`: precisa ser 0 erros.
3. `npm test`: na última vez foram 383 de 383.
4. `npm run test:live` (projeto de teste): conferir com as chaves de teste. A rede às vezes trava ("fetch failed", 180 s no Storage): repita o arquivo que falhou antes de concluir que é bug.
5. e2e no modo simulado (`npm run test:e2e`, na última vez 60 de 60):
   - Backup de `.data` → apagar o conteúdo de `.data` → `npx next dev -p 3000` → esperar "Ready" → fazer um GET em `/login` → esperar o `.data/store.json` aparecer (ele nasce depois do Ready) → rodar → matar o servidor e o filho → restaurar → conferir o hash.
   - Faça isso num script (PowerShell) para não errar a ordem.
6. `npm run build`: precisa passar.
7. Modo real no navegador:
   - Terminal 1: `node scripts/dev-teste-real.mjs -p 3100`.
   - Terminal 2, com `APP_URL=http://localhost:3100`: `npm run test:e2e:live` (kanban) e `npm run test:e2e:live:vendas` (dashboards).

# 4. Trabalho pendente, nesta ordem

## 4.1 Terminar a verificação em duas etapas (2FA). Prioridade 1

O que já existe (commit `12a370a`):
- `server/auth/mfa.ts`: `hasVerifiedFactor` com cache de 30 s e `forgetFactor`.
- Em `server/auth/session.ts`: `secondFactorPending`, o `getLiveUser` que exige aal2 quando há fator verificado, `requireUser` mandando para `/login/codigo` e `verifySecondFactorLive`.
- `server/actions/auth.ts` (o login manda para o código; `verifySecondFactor`) e `server/actions/two-factor.ts` (`startTwoFactor`, `confirmTwoFactor`, `disableTwoFactor`).
- Telas: `app/(auth)/login/codigo/`, `components/me/two-factor.tsx` e o perfil `/me`.
- Migração `20261022120000_mfa_aal2.sql`: política RESTRICTIVE `mfa_ok()` em todas as tabelas do `public` e em `storage.objects`. Já aplicada no TESTE.
- `tests/live/mfa.test.ts` passou 5 de 5; `tests/totp.ts` é o "celular" de teste (RFC 6238, testado).

Falta fazer:
1. Escrever `tests/e2e/live-2fa.mjs`, no padrão de `tests/e2e/live-kanban.mjs` (cria pessoas temporárias pela chave secreta, trava pela URL do projeto de teste, apaga tudo no fim). O roteiro:
   - Login com senha → perfil → "Ligar" → ler a chave mostrada no `CodeBox` → calcular o código com `tests/totp.ts` → "Confirmar e ligar".
   - Sair → entrar de novo → deve parar em `/login/codigo`.
   - Código errado mostra erro; o certo entra.
   - Acessar `/me` direto sem o código deve mandar para `/login/codigo`.
   - Desligar com um código novo.
   - O mesmo código não vale duas vezes: use `freshTotp`, que espera a próxima janela de 30 s.
   - Rode contra `dev-teste-real` na porta 3100. Mostre a saída.
2. Rodar de novo `npm run test:live` completo, para garantir que as políticas restritivas não quebraram os outros testes de RLS.
3. Conferir as telas no celular (390 px) e no computador (1440 px), em tema claro e escuro, sem nada cortado.
4. Atualizar os documentos:
   - Em `features.csv`, a linha "Autenticação em dois fatores (2FA)" passa de `no` para `yes`, com nota.
   - `build-log.md`, README do código e README de `saidas/INtellect.com`.
   - `tarefas-manuais`: como recuperar o acesso se perder o celular. É pelo painel do Supabase → Authentication → Users → remover o fator MFA. Confira o caminho exato antes de escrever.
5. Commit e push.

## 4.2 Trocar a senha no perfil (modo real). Prioridade 2

O espaço "Senha" saiu do perfil quando a seção de 2FA entrou, e não existe troca de senha no modo real.
- Implemente com `supabase.auth.updateUser({ password })`, pedindo a senha atual (valide com `signInWithPassword` antes) e a confirmação.
- Use as mesmas regras de força de senha do convite (veja `app/(auth)/invite`).
- Com o 2FA ligado, a sessão precisa estar em aal2.
- Teste em `tests/live` e no e2e real. Atualize `features.csv` se houver linha para isso.

## 4.3 Outras lacunas da matriz

Liste com `grep -nE ",(must|should),yes,(no|partial)," features.csv`.
- **Login com Google:** depende do Matheus criar o OAuth no Google Cloud. Escreva o passo a passo nas tarefas manuais; não crie conta.
- **Script de UTMs para página fora da Shopify:** baixo valor. Pergunte se ele quer.
- **Integrações reais** (Meta, Google Ads, Shopify app): dependem de contas e aprovações dele. Não comece sem ele.

# 5. Armadilhas já conhecidas (não perca tempo com elas)

- **Lentidão:** o OneDrive deixa o shell lento. O código fica fora dele. Comandos longos devem rodar em segundo plano.
- **Python:** pode não existir no PC. Use `node` para scripts.
- **Heredoc no Bash do Windows:** pode juntar barras invertidas (`\\` vira `\`). Para scripts com barra invertida, use a ferramenta de escrever arquivo.
- **Arquivos "use server":** só exportam funções assíncronas (tipos podem).
- **e2e:**
  - Espere a hidratação (veja `hydrated()` em `tests/e2e/smoke.mjs`) antes de clicar.
  - Use `waitForFunction(() => !document.querySelector('[role="menu"]'))` em vez de `getByRole("menu").waitFor({state:"detached"})`: com submenu aberto há 2 menus, e o modo estrito do Playwright falha.
- **Menus do Radix:**
  - Um submenu aberto junto com o menu principal fecha na hora. Ele abre um quadro depois (veja `pendingSub` em `board-canvas.tsx`).
  - Os atalhos de teclado escutam na fase de captura, porque o lápis do card dá `stopPropagation`.
- **Gravação no modo real:** remoções em `LEAF_TABLES` vão antes das inserções. Há timeout de 25 s por pedido ao Supabase (`server/db/admin.ts`) e repetição em falha de rede.
- **Datas:** use o fuso `America/Sao_Paulo` (`Intl.DateTimeFormat("en-CA", { timeZone })`), não UTC. Perto da meia-noite os testes erram.
- **Excel:** o `.xlsx` é montado à mão (`lib/xlsx.ts`, zip sem compressão + XML), sem biblioteca. Se mexer nele, valide abrindo no Excel por COM (`Excel.Application`, invisível, só leitura). Encerre só o processo que você abriu.

# 6. Ao terminar cada bloco

1. Mostre as evidências: saída dos testes, números e prints quando for interface.
2. Atualize `features.csv`, `build-log.md`, os READMEs e a sua memória.
3. Faça commit e `git push origin etapa5-anexos`.
4. Lembre o Matheus de deixar o repositório **privado** (Settings → Change visibility → Private), se ainda estiver público.
5. Ao final, dê um resumo curto em português: o que foi feito, com evidência, e uma lista numerada do que só ele pode fazer.

Comece pela seção 2 e só avance para a próxima quando a anterior estiver verificada.
