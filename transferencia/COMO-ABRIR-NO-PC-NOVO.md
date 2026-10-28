# Como abrir o INtellect no PC novo

Preparado em 24/10/2026. Faça na ordem. Nada aqui custa dinheiro.

## O que vai por onde

| O quê | Por onde chega no PC novo |
| --- | --- |
| Código do app | GitHub: https://github.com/MatheusMorex/intellect (ramo `etapa5-anexos`) |
| Documentos (planejamento, MazyOS) | OneDrive, sozinho (pasta `Imagens\Screenshots\PROJETOS\MazyOS`) |
| Dados de teste e memória do Claude | OneDrive, sozinho (esta pasta) |
| **Chaves** (`.env.local` e `.env.test.local`) | **Pendrive, à mão** (passo 4). Não vão pela internet de propósito. |
| Programa do Supabase (CLI) | Baixar de novo (passo 6) |

## 1. ANTES de desligar o PC velho: copiar as chaves para um pendrive

1. Abra o Explorador de Arquivos e vá em `C:\Users\Soare\dev\intellect`.
2. Se não aparecerem arquivos começando com ponto: menu **Exibir** → **Mostrar** → marque **Itens ocultos**.
3. Copie os dois arquivos para o pendrive: `.env.local` e `.env.test.local`.

**Sem pendrive:** use os modelos da pasta `chaves-modelo` (aqui ao lado): já
vêm com tudo o que não é segredo, e as chaves você copia do painel do Supabase
no PC novo. Ou copie você mesmo os 2 arquivos para o seu OneDrive e apague de
lá depois de usar.

Se esquecer: dá para refazer com o modelo `.env.example` (vem no código) e as
chaves do painel do Supabase (Project Settings → API Keys), uma vez para cada
projeto (principal e teste). A senha de teste (`DEMO_PASSWORD`) e o
`AUTH_SECRET` você pode inventar de novo.

## 2. Instalar os programas no PC novo

1. **Node.js** versão 24 (LTS): https://nodejs.org → baixar e instalar (Avançar em tudo).
2. **Git**: https://git-scm.com/download/win → instalar (Avançar em tudo).
3. **VS Code**: https://code.visualstudio.com e, dentro dele, a extensão **Claude Code**.
4. Entre no **OneDrive** com a mesma conta e espere sincronizar.

## 3. Baixar o código

Abra o **PowerShell** e rode, uma linha por vez:

```
mkdir $HOME\dev
cd $HOME\dev
git clone https://github.com/MatheusMorex/intellect.git
cd intellect
git checkout etapa5-anexos
git config user.name "Matheus Soares"
git config user.email "soaresmoreiramatheus@gmail.com"
npm install
```

O `git clone` pode abrir uma janela pedindo login no GitHub: entre com a sua conta.
O `npm install` demora alguns minutos.

> O código fica em `C:\Users\<seu usuário>\dev\intellect`, **fora do OneDrive**
> (a pasta `node_modules` tem milhares de arquivos e trava o OneDrive).

## 4. Colocar as chaves

Copie do pendrive os arquivos `.env.local` e `.env.test.local` para dentro de
`C:\Users\<seu usuário>\dev\intellect`. Depois **apague do pendrive**.

## 5. Seus dados de teste (opcional)

Para ter os mesmos quadros e cards de teste do PC velho: crie a pasta
`.data` dentro de `dev\intellect` e copie para ela os 2 arquivos de
`OneDrive\INtellect-troca-de-pc\dados-de-teste`.
Sem isso, o app cria dados de exemplo novos na primeira vez.

## 6. Programa do Supabase (só para mexer no banco)

1. Baixe `supabase_windows_amd64.tar.gz` em https://github.com/supabase/cli/releases/latest
2. Crie a pasta `C:\Users\<seu usuário>\dev\tools\supabase-cli` e extraia o `supabase.exe` nela.
3. No PowerShell, dentro de `dev\intellect`: `npm run db:login` (abre o navegador) e depois `npm run db:link`.

## 7. Testar

```
cd $HOME\dev\intellect
npm run dev
```

Espere aparecer `Ready` e abra http://localhost:3000. Entre com
`ana@intellect.test` e a senha que está em `DEMO_PASSWORD` no `.env.local`.

## 8. Claude com a memória de antes

No VS Code do PC novo, abra a pasta do projeto e diga ao Claude:

> Leia a pasta OneDrive\INtellect-troca-de-pc\memoria-do-claude e grave tudo
> na sua memória. Depois leia o README de saidas\INtellect.com na pasta do MazyOS.

## 9. Depois que tudo funcionar

1. **Deixe o repositório privado**: https://github.com/MatheusMorex/intellect →
   Settings → lá embaixo **Change visibility** → **Change to private**.
2. Continue as tarefas de `saidas\INtellect.com\tarefas-manuais-2026-10-21.md`
   (pasta do MazyOS). Agora são **3** migrações para o banco principal (entrou a
   da verificação em duas etapas, `20261022120000_mfa_aal2.sql`).
3. Esta pasta (`INtellect-troca-de-pc`) pode ser apagada.
