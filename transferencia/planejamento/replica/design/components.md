# Componentes: app interno da INtellect

Base: `replica/recon.md` (lista de componentes e telas S01 a S30) e
`replica/design/tokens.json`. Data: 2026-10-12.

## Como ler

- **De onde vêm as medidas.** O recon não tem capturas de tela logadas dos
  dois apps, e o pedido é identidade 100% própria. Então nada aqui foi medido
  do Trello ou da UTMify: o sistema foi montado a partir das funções que o
  recon levantou, numa escala comum de 4 px. Os padrões (o que é um popover,
  como um formulário avisa erro) são de uso geral; cores, textos, ícones,
  nomes de recursos e o desenho das telas são nossos.
- **A marca.** Logo, símbolo e cores vêm do pacote que o usuário criou
  (`replica/design/marca/`, 2026-10-12): roxo `#2D1E8F`, lavanda `#B9AEFF` e
  `#9D8FFF`, quase-preto `#0A0912`. O roxo é a cor principal no tema claro; a
  lavanda forte, no escuro. A fonte da interface continua a Inter (o logo é
  desenho, não depende de fonte). Ver a seção **Marca** abaixo.
- **Uma fonte da verdade.** Cor, tamanho, raio, sombra e tempo de animação vêm
  sempre dos tokens. Nenhum componente usa hex nem px solto. Depois de mudar
  um token: `python replica/design/build_tokens.py`.
- **Base de código.** shadcn/ui (Radix por baixo), ícones Lucide (licença
  ISC), @dnd-kit, TanStack Table, Recharts, Tiptap. Cada bloco diz qual peça
  do shadcn usa.

### Nomes no Tailwind

O `theme.css` expõe os tokens com os nomes que o shadcn/ui já usa (assim
os componentes dele funcionam sem edição), mais os papéis que o shadcn não
tem.

| token (tokens.json) | classe no Tailwind | para quê |
| --- | --- | --- |
| bg | `bg-background` | fundo da página |
| surface | `bg-card`, `bg-popover`, `bg-surface` | cards, painéis, popovers, modais, tabelas |
| surface-sunken | `bg-muted`, `bg-surface-sunken` | coluna de lista, cabeçalho de tabela, skeleton |
| surface-hover | `bg-accent`, `bg-secondary`, `bg-surface-hover` | hover de linha e de item de menu, botão secundário, item selecionado |
| border | `border-border` (padrão de toda borda) | divisórias |
| border-input | `border-input` | borda de campo, checkbox, trilho do toggle desligado |
| text | `text-foreground` | texto |
| text-muted | `text-muted-foreground` | texto de apoio, placeholder, cabeçalho de tabela |
| accent / on-accent | `bg-primary text-primary-foreground` | ação principal |
| accent-hover | `bg-primary-hover` | hover da ação principal |
| accent-subtle | `bg-primary-subtle` (com `text-primary`) | item selecionado: menu lateral, aba segmentada, opção escolhida |
| ring | `ring-ring`, `outline-ring` | anel de foco |
| danger / danger-subtle / on-danger | `bg-destructive`, `text-danger`, `bg-danger-subtle`, `text-on-danger` | erro, excluir, número negativo |
| success / success-subtle / on-success | `text-success`, `bg-success-subtle`, `bg-success text-on-success` | positivo, concluído, conectado |
| warning / warning-subtle / on-warning | `text-warning`, `bg-warning-subtle` | perto do prazo, atenção, dados atrasados |
| label-{cor}-subtle / label-{cor} / label-{cor}-bold | `bg-label-green-subtle` etc. | etiquetas, capas, fundos de quadro, avatares |
| chart-1 a chart-8 | `fill-chart-1` / `var(--color-chart-1)` | séries de gráfico (chart-1 é o roxo da marca) |
| brand (fixas, iguais nos dois temas) | `bg-brand-indigo`, `text-brand-lavender`… | só em peças da marca: tela de login, e-mail, imagem de compartilhamento. A interface usa os papéis acima |

Tamanho de texto: `text-xs` 12/16, `text-sm` 14/20 (padrão da interface),
`text-base` 16/24 (texto longo), `text-lg` 20/28, `text-xl` 24/32,
`text-display` 32/40. Raios: `rounded-sm` 4, `rounded-md` 8, `rounded-lg` 12,
`rounded-full`. Sombras: `shadow-card`, `shadow-pop`, `shadow-modal`.
Larguras: `max-w-content` 1600, `max-w-form` 720, `w-list` 272,
`max-w-card-modal` 768, `w-side-panel` 360. Espaço: múltiplos de 4 px (2 e 6
só dentro de etiquetas e badges).

### Regras que valem para todos

- **Foco:** todo elemento interativo mostra, no foco por teclado, um contorno
  de 2 px na cor `ring` com 2 px de folga (`focus-visible`). O contraste do
  anel foi conferido sobre `bg`, `surface` e `surface-sunken`.
- **Alvo de clique:** no mínimo 32 px no desktop e 40 px em tela de toque
  (`pointer: coarse`). Nada interativo menor que 24 px.
- **Desabilitado:** opacidade 50% e cursor `not-allowed`. Quando o usuário
  precisa saber o motivo, usar `aria-disabled` (o elemento continua focável)
  e um tooltip com o motivo.
- **Carregando:** o componente mantém o tamanho (sem pulo de layout). Ações
  com mais de 300 ms mostram spinner; telas usam skeleton.
- **Cor nunca sozinha:** status, prazo, lucro e etiquetas sempre levam texto,
  ícone ou padrão junto da cor. Número negativo leva o sinal "−".
- **Modo para daltônicos** (`data-colorblind="on"` no `<html>`, preferência do
  perfil): etiquetas e capas ganham padrões (`--ds-pattern-{cor}`).
- **Reduzir animações:** com a preferência do sistema ou do perfil
  (`data-motion="reduced"`), as durações viram 0 e o card arrastado não gira.
- **Tema:** claro, escuro ou automático (`users.theme`). O next-themes põe
  `data-theme` no `<html>` antes da primeira pintura, para não piscar.
- **Atalhos de uma tecla** (N, F, Q, E…) não disparam com o foco num campo
  de texto e podem ser desligados no perfil (WCAG 2.1.4).
- **Leitor de tela:** ícone decorativo leva `aria-hidden`; botão só com ícone
  leva `aria-label` e tooltip; mudanças assíncronas (salvo, copiado, card
  movido) são anunciadas numa região `aria-live="polite"`.

### Formato de números e datas (pt-BR)

| dado | formato | exemplo |
| --- | --- | --- |
| dinheiro | `Intl.NumberFormat('pt-BR', { style: 'currency', currency })`, moeda do dashboard | R$ 1.234,56 |
| negativo | sinal de menos (U+2212), cor `danger` | −R$ 120,00 |
| percentual | 1 casa (os pontos-base do banco ÷ 100) | 12,4% |
| ROAS | 2 casas, sem símbolo | 2,45 |
| sem dado | travessão, com `aria-label="sem dados"` | — |
| data curta | dia e mês | 12 de out. |
| data e hora | 24 h | 12/10/2026 14:30 |
| relativa | date-fns `formatDistance` com `ptBR`, hora exata no `title` | há 3 min |

Os números de tabelas, KPIs e badges usam algarismos de largura fixa
(classe `tabular`) e ficam alinhados à direita nas tabelas. O tracking mostra
horários no fuso do dashboard; o kanban, no fuso do usuário.

### Textos

Todos os textos são escritos do zero, sem copiar os rótulos dos originais.
Tom direto, tratando por "você", com só a primeira letra maiúscula. Botões
dizem verbo e objeto ("Criar quadro", "Conectar conta"), nunca "OK". Erros
dizem o que aconteceu e o que fazer. Nomes de recurso dos originais ficam de
fora; os nomes próprios saem no /replica-brand.

---

## Marca

Arquivos em `replica/design/marca/`. No build, os SVG vão para `public/marca/`
e os ícones para `app/` (o Next.js gera as tags sozinho).

| peça | arquivo | onde |
| --- | --- | --- |
| logo horizontal, fundo transparente | `intellect-logo-para-fundo-claro.svg` | barra superior e login no tema claro |
| logo horizontal, fundo transparente | `intellect-logo-para-fundo-escuro.svg` | barra superior e login no tema escuro |
| logo com fundo e margem | `intellect-logo-fundo-branco.svg` / `-fundo-preto.svg` | cabeçalho de e-mail (convites, lembretes), imagem de compartilhamento do link |
| símbolo no quadrado roxo | `intellect-simbolo.svg` | menu recolhido, ícone da aba do navegador (`app/icon.svg`), avatar das automações |
| símbolo sem fundo, roxo | `intellect-simbolo-roxo.svg` | estados vazios e carregamento da página inteira no tema claro |
| símbolo sem fundo, branco | `intellect-simbolo-branco.svg` | sobre fundos roxos ou fotos; carregamento no tema escuro |
| ícone de app 512 | `icone-app-512.png` | `app/apple-icon.png` e manifesto (atalho na tela do celular) |
| favicon 32 | `favicon-32.png` | `app/favicon.ico` (navegadores antigos) |
| foto de perfil | `intellect-foto-perfil.svg` | foto padrão do workspace INtellect |

```
Logo
  tamanhos   barra superior: 24 px de altura (símbolo 24 + nome); menu recolhido: só o símbolo, 32 px;
             login: 40 px de altura
  respiro    em volta do logo, no mínimo a largura de um quadradinho do símbolo (cerca de 16% da altura)
  troca por tema  as duas versões ficam no HTML e o CSS mostra a certa (data-theme ou prefers-color-scheme),
             para não piscar na carga
  regras     não recolorir, não esticar, não pôr sombra; sobre foto ou cor forte, usar o símbolo branco
  a11y       <img alt="INtellect"> uma vez por página; o logo da barra é um link para o Início ("INtellect, Início")
  usado em   barra superior, S01, S02, e-mails
```

O desenho dos quadradinhos do símbolo (degraus que sobem, com o último em
lavanda) pode reaparecer em detalhes nossos: o carregamento da página inteira
acende os quadradinhos em sequência (parado, com reduzir animações), e o
estado vazio do tracking usa o símbolo roxo em 48 px.

---

## Layout

```
Estrutura do app (todas as telas logadas)
  barra superior   56 px, fixa no topo, z 20
  menu lateral     248 px; recolhido 56 px (só ícones, com tooltip); z 30
                   abaixo de 1024 px vira gaveta (Sheet à esquerda), aberta pelo botão de menu
  conteúdo         rola sozinho; páginas de tracking com max-w-content e padding 24 (16 no celular)
  breakpoints      sm 640, md 768, lg 1024, xl 1280, 2xl 1536 (padrão do Tailwind)
  camadas (z)      sticky 10, barra 20, menu 30, gaveta 40, modal 50, popover 60, toast 70, tooltip 80
                   (o popover fica acima do modal porque abre de dentro do verso do card)
```

```
Barra superior
  esquerda    botão do menu (abaixo de 1024 px), logo INtellect (24 px, versão do tema), seletor de workspace ou de
              dashboard (Combobox)
  centro      busca global (atalho /), Input de busca que abre a paleta de resultados
  direita     botão "Criar" (primário, sm), meta de faturamento (só no tracking), notificações (sino com contador),
              ajuda de atalhos, avatar com menu (perfil, meus cards, tema, sair)
  tokens      bg surface, borda inferior border, altura header
  a11y        <header> com landmark; o contador do sino entra no aria-label ("Notificações, 3 não lidas")
  usado em    todas as telas logadas
```

```
Menu lateral
  seções      Trabalho: Início, Meus cards, quadros favoritos, workspaces (expansíveis: Quadros, Membros, Configurações)
              Vendas: Resumo, Meta, Google, Vendas, UTMs, Relatórios, Taxas, Despesas (do dashboard atual)
              rodapé: Integrações, Configurações
  item        altura 32, ícone 16 + texto sm, raio md; hover: bg surface-hover; ativo: bg primary-subtle, texto primary,
              peso 600
  estados     padrão, hover, ativo (aria-current="page"), recolhido, gaveta aberta
  recolher    botão no rodapé; a escolha fica no navegador (localStorage); no quadro (S05) começa recolhido
  base        shadcn Sidebar
  a11y        <nav aria-label="Principal">; seções com título; no modo recolhido o nome vira tooltip e aria-label
  usado em    todas as telas logadas
```

```
Barra de filtros (tracking)
  conteúdo    Seletor de período, Multiselect (conta, produto, fonte, plataforma), "Mais filtros", "Limpar filtros",
              Indicador de atualização à direita
  comportamento  fixa no topo do conteúdo ao rolar (sticky, z 10, bg background); quebra em linhas no celular
  estado      os filtros vão para a URL (?periodo=7d&produto=...), então um link abre a mesma visão
  usado em    S17, S18, S19, S26, S27, S28
```

---

## Primitivos

```
Button
  variantes  primário, secundário, ghost, contorno, perigo, link
  tamanhos   sm 32 px, md 36 px (padrão), lg 40 px; só ícone: quadrado do mesmo tamanho
  estados    padrão, hover, pressionado, focus-visible (anel 2 px ring), desabilitado, carregando
  tokens     primário bg primary / text primary-foreground / hover primary-hover; secundário bg secondary;
             ghost transparente com hover bg accent; contorno border-input; perigo bg destructive / text on-danger;
             raio md; texto sm peso 500; ícone 16
  carregando spinner no lugar do ícone, o texto fica (o leitor continua ouvindo o nome), aria-busy, clique bloqueado
  a11y       <button> de verdade (ou <a> quando navega); só ícone exige aria-label e tooltip
  base       shadcn Button
  usado em   todas
```

```
Input / Textarea / título editável
  tipos      texto, e-mail, senha (mostrar e ocultar), número, dinheiro (prefixo da moeda), busca (ícone + limpar),
             textarea com altura automática, título editável no lugar
  tamanhos   sm 32, md 36, lg 40; no celular a fonte vai a 16 px para o navegador não dar zoom
  estados    padrão (borda border-input), hover, foco (anel ring), erro (borda danger + mensagem), desabilitado
             (bg muted), somente leitura
  tokens     bg surface, texto foreground, placeholder muted-foreground, raio md
  título editável  aparece como texto; clique ou Enter vira campo com a mesma fonte; Enter ou sair do campo salva;
             Esc cancela; vazio não salva e volta ao nome anterior com a mensagem "O nome não pode ficar vazio"
  a11y       sempre com <label> (visível ou sr-only); erro ligado por aria-invalid + aria-describedby;
             o título editável é um <button> que anuncia "Editar nome do quadro"
  base       shadcn Input, Textarea
  usado em   todas; título editável em S05 (quadro, lista), S06 (card), S14 (automação), S20 (dashboard)
```

```
Campo (rótulo + ajuda + erro)
  partes     rótulo (sm 500), campo, texto de ajuda (xs, muted), mensagem de erro (xs, danger, com ícone)
  obrigatório  escrito "(obrigatório)" no rótulo, não só um asterisco
  validação  ao sair do campo e ao enviar; no envio, foco vai para o primeiro campo com erro e um resumo aparece no topo
  base       shadcn Form (react-hook-form + Zod, os mesmos esquemas do servidor)
  usado em   S01, S04, S09, S12, S13, S15, S20, S21, S23, S26
```

```
Select / Combobox
  Select     lista curta e fixa: papel, fuso, moeda, recorrência, lembrete, categoria de despesa
  Combobox   lista longa ou com busca: plataforma, quadro, lista, membro, campanha (S24), troca de dashboard
  estados    fechado, aberto, buscando, sem resultado ("Nada encontrado para 'x'"), carregando, desabilitado
  tokens     gatilho igual ao Input; lista em popover (bg popover, shadow-pop, raio lg); item 32 px, hover accent
  teclado    setas movem, Enter escolhe, Esc fecha e devolve o foco, digitar busca
  a11y       Combobox com role="combobox" e aria-activedescendant; grupos com rótulo
  base       shadcn Select; Combobox = Popover + Command (cmdk)
  usado em   S04, S07, S09, S12, S15, S20, S21, S23, S24, S26
```

```
Checkbox / Radio
  tamanhos   caixa de 16 px dentro de um alvo de 32 px (o rótulo também clica)
  estados    desmarcado (borda border-input), marcado (bg primary), indeterminado ("selecionar todos"), foco,
             desabilitado
  concluído do card  checkbox redondo de 16 px na frente e no verso do card, aria-label "Marcar como concluído"
  base       shadcn Checkbox, RadioGroup
  usado em   S05, S06 (checklist), S10 (filtro), S13, S15, S18 (colunas)
```

```
Toggle (Switch)
  tamanhos   sm (trilho 28×16, dentro de tabelas), md (36×20)
  estados    ligado (trilho primary), desligado (trilho surface-hover com borda border-input), carregando
             (spinner no botão, aria-busy), erro (volta à posição anterior + toast com o motivo)
  confirmação  ligar ou pausar uma campanha de verdade (S18) pede confirmação num Dialog antes de chamar a API
  a11y       role="switch", aria-checked, nome com o objeto: "Campanha Black Friday ativa"
  base       shadcn Switch
  usado em   S13, S14 (liga e desliga automação), S18 (status da campanha)
```

```
Abas
  variantes  sublinhado (troca de seção na página), segmentado (2 a 4 opções curtas, ex.: "qualquer / todas")
  estados    ativa (sublinhado de 2 px em primary, texto foreground, peso 600; no segmentado, bg surface com sombra card),
             inativa (muted), hover, desabilitada, com contador
  abas de nível (S18)  Contas > Campanhas > Conjuntos (Grupos no Google) > Anúncios; clicar numa linha
             leva à aba seguinte já filtrada por ela, e o filtro aparece como chip removível
  URL        a aba ativa vai para a URL (?nivel=campanhas)
  teclado    setas trocam de aba, Home e End vão às pontas
  base       shadcn Tabs (Radix: role tablist / tab / tabpanel)
  usado em   S12, S13, S14, S18, S21
```

```
Tooltip
  conteúdo   texto curto (xs); nunca é o único lugar de uma informação necessária
  tokens     cores invertidas (bg foreground, texto background), raio sm, z 80
  tempo      abre em 500 ms com o mouse e na hora com o foco; Esc fecha
  base       shadcn Tooltip
  usado em   botões só com ícone, menu recolhido, fórmulas dos KPIs, badges
```

```
Kbd e ajuda de atalhos
  Kbd        mono xs, bg muted, borda border, raio sm, padding 2/6
  ajuda      Dialog aberto com "?" ou pelo menu, atalhos agrupados (Geral, Quadro, Card), busca
  a11y       cada atalho tem também um caminho por menu ou botão
  usado em   todas (menus mostram o atalho à direita do item)
```

```
Avatar e pilha de avatares
  tamanhos   xs 24 (frente do card), sm 28 (listas), md 32 (barra superior, comentários), lg 64 (perfil)
  conteúdo   foto, ou iniciais em branco sobre um tom label-*-bold escolhido pelo id do usuário (sempre o mesmo)
  pilha      sobreposição de 4 px com anel de 2 px na cor do fundo; até 3 avatares + botão "+N" que abre a lista
  a11y       imagem com alt = nome; numa pilha, a lista inteira vai no aria-label ("Ana, Bruno e mais 2")
  base       shadcn Avatar
  usado em   S03, S05, S06, S09, S12, S13, barra superior
```

```
Badge (frente do card)
  tipos      prazo, checklist x/y, comentários, anexos, tem descrição, métrica (novo)
  prazo      normal: bg muted, texto muted-foreground, ícone relógio
             perto (menos de 24 h): bg warning-subtle, texto warning
             vencido: bg destructive, texto on-danger, ícone alerta
             concluído: bg success, texto on-success, ícone check
  checklist  normal: muted; 100%: bg success-subtle, texto success
  métrica    ROAS ou lucro do período; positivo: success-subtle / success com seta para cima; negativo:
             danger-subtle / danger com seta para baixo; sem dados: muted com "—"; atrasado: ícone relógio + tooltip
  tamanho    altura 20, texto xs (12/16, 500), ícone 12, raio sm, padding 2/6
  a11y       aria-label com a frase inteira: "Entrega 14 de out., vencida", "Checklist 3 de 10", "ROAS 2,45 nos últimos 7 dias"
  usado em   S05, S25, S30
```

```
Pill de status
  pedido     pago (success), pendente (warning), recusado ou cancelado (muted), reembolsado (muted com ícone de
             devolução), chargeback (danger), teste (contorno tracejado com o texto "Teste")
  integração conectada (success), expira em breve (warning), erro ou token vencido (danger), aguardando (muted)
  forma      bg do tom -subtle + texto do tom forte, ponto de 6 px antes do texto, raio full, texto xs, altura 20
  a11y       o texto diz o status; a cor só reforça
  usado em   S19, S21, S29
```

```
Chip de etiqueta
  tons       sutil (label-{cor}-subtle, texto label-text-subtle), normal (label-{cor}, texto label-text),
             forte (label-{cor}-bold, texto label-text-bold). No banco: green_light = sutil, green = normal,
             green_dark = forte (labels.color)
  modos      faixa fina (8×40, sem texto) ou com nome (altura 20, texto xs 500, padding 2/8, corta com reticências);
             clicar numa etiqueta da frente do card alterna o modo do quadro inteiro
  daltônicos amostra de 10×10 com o padrão --ds-pattern-{cor} antes do nome; na faixa fina o padrão cobre a faixa.
             A amostra usa `background: var(--ds-pattern-{cor}), var(--ds-label-{cor})` e a cor do padrão vem de
             `color` (--ds-pattern-ink, ou --ds-pattern-ink-on-bold no tom forte). O padrão nunca fica atrás do texto.
  estados    padrão, hover (brilho -5%), selecionado (check à direita, no popover), sem nome (só cor)
  a11y       etiqueta sem nome é anunciada pela cor ("Etiqueta verde"); a faixa fina leva o nome no aria-label
  usado em   S05, S06, S07, S10
```

```
Popover
  largura    320 (no celular vira painel de baixo para cima)
  partes     cabeçalho com título centralizado, botão voltar (subpáginas) e fechar; corpo com padding 12
  tokens     bg popover, raio lg, shadow-pop, z 60
  estados    aberto, carregando (skeleton no corpo), subpágina
  foco       vai para o primeiro campo ao abrir; Esc fecha e devolve o foco para quem abriu
  base       shadcn Popover; no celular, shadcn Drawer
  usado em   S07, S10, S11, S24, filtros de tracking
```

```
Menu dropdown e menu de contexto
  item       altura 32, ícone 16, texto sm, atalho à direita (Kbd), separadores, subtítulos de grupo
  variantes  item normal, item perigoso (texto danger), item desabilitado (com o motivo em tooltip), checkbox, submenu
  contexto   clique direito no card abre a edição rápida; a mesma coisa abre com E ou pelo botão de lápis
             (que aparece no hover e no foco)
  teclado    setas, Enter, Esc, digitar para pular ao item
  base       shadcn DropdownMenu, ContextMenu
  usado em   S05 (lista, card), S06, S08, S18 (ações da linha), barra superior
```

```
Modal / Dialog
  tamanhos   sm 400 (confirmação), md 560 (formulários), lg 768 (verso do card); tela cheia abaixo de 768 px
  tokens     bg popover, raio lg, shadow-modal, fundo overlay, z 50
  estados    abrindo, aberto, fechando, enviando (botões travados)
  confirmação de algo destrutivo  AlertDialog com o verbo no botão ("Excluir quadro"), botão de perigo à direita,
             foco começa no Cancelar; excluir workspace pede para digitar o nome
  foco       preso dentro do modal; Esc fecha (pergunta antes se houver texto não salvo); o foco volta para quem abriu
  a11y       aria-labelledby no título, aria-describedby na explicação
  base       shadcn Dialog, AlertDialog
  usado em   S04, S06, S09, S18, S29, F14
```

```
Painel lateral (Sheet)
  largura    360 à direita (menu do quadro); 280 à esquerda (menu no celular)
  partes     cabeçalho com título, voltar e fechar; subpáginas trocam o corpo sem fechar o painel
  tokens     bg popover, shadow-modal, z 40
  base       shadcn Sheet
  usado em   S08, menu lateral no celular
```

```
Toast
  variantes  sucesso, erro, informação, desfazer (botão "Desfazer" por 6 s)
  posição    canto inferior direito; no celular, embaixo e centralizado; no máximo 3 empilhados
  tempo      4 s (erro: 8 s); pausa com mouse ou foco em cima
  tokens     bg popover, borda border, shadow-pop, ícone na cor do tom, z 70
  a11y       role="status" (polite); erro usa role="alert"; erro que pede ação vai inline, não em toast
  base       shadcn Sonner
  usado em   todas
```

```
Faixa de aviso
  variantes  informação (bg muted), atenção (warning-subtle), erro (danger-subtle), sucesso (success-subtle)
  partes     ícone, título (sm 600), texto, ação (link ou botão sm), fechar quando dispensável
  exemplos   configuração incompleta (S17), token vencido ou perto de vencer (S17, S21), dados atrasados,
             permissão de dados de cliente pendente (S21), conflito de edição (S06)
  dispensar  a escolha fica salva por dashboard; avisos de erro não somem enquanto o erro existir
  a11y       role="status"; o de erro que surge depois da carga usa role="alert"
  base       shadcn Alert
  usado em   S06, S17, S18, S21
```

```
Estado vazio
  partes     ícone Lucide 32 em muted-foreground, título (base 600), uma linha de explicação, ação principal
  variantes  primeira vez (com ação: "Criar quadro"), filtro sem resultado ("Limpar filtros"), sem permissão,
             erro ("Tentar de novo")
  textos     escritos para cada tela, sem ilustração copiada; ilustrações próprias podem entrar no /replica-brand
  usado em   todas as listas e tabelas
```

```
Skeleton
  formas     linha (altura 12 ou 16), card do kanban, linha de tabela, KPI, bloco de gráfico
  tokens     bg muted, raio do componente que substitui, pulsação desligada com reduzir animações
  tempo      só aparece depois de 300 ms, para não piscar em carga rápida
  a11y       contêiner com aria-busy="true" e texto oculto "Carregando…"
  base       shadcn Skeleton
  usado em   S03, S05, S17, S18, S19, S27, S28
```

```
Barra de progresso
  usos       checklist (com % ao lado), meta de faturamento no topo ("R$ 7.420 de R$ 10.000"), assistente (S29)
  forma      altura 6 (8 na meta), raio full, trilho muted, preenchimento primary; 100% vira success
  meta de faturamento  (could) ao bater uma meta: toast de sucesso e um selo no menu do avatar
  a11y       role="progressbar" com aria-valuenow e aria-valuetext ("74% da meta do mês")
  base       shadcn Progress
  usado em   S06, S29, barra superior do tracking
```

```
Caixa de código com copiar
  conteúdo   parâmetros de URL, script, URL de webhook, token, link de teste
  forma      fonte mono xs, bg muted, borda border, raio md, padding 12; código rola na horizontal, URL quebra a linha
  copiar     botão "Copiar" vira "Copiado" com check por 2 s; anunciado na região aria-live
  segredo    token aparece mascarado (••••) com botão "Mostrar"; nunca vem aberto
  usado em   S21, S22, S29
```

```
Seletor de tema
  forma      segmentado com 3 opções e ícone: Claro (Sun), Escuro (Moon), Automático (Monitor)
  onde       menu do avatar e S13; salva em users.theme e num cookie, para a página já vir no tema certo
  a11y       radiogroup com rótulo "Tema"
  usado em   barra superior, S13
```

---

## Datas e filtros

```
Seletor de data e hora
  partes     calendário do mês (setas de mês e ano), início (opcional, liga por checkbox), entrega com hora (24 h),
             recorrência (Select), lembrete (Select: nenhum, na hora, 5, 10, 15 min, 1 h, 2 h, 1 dia, 2 dias antes)
  regras     semana começa no domingo; aceita digitar "dd/mm/aaaa"; início depois da entrega dá erro no campo
  estados    vazio, selecionado, inválido, salvando
  teclado    setas mudam o dia, PageUp e PageDown o mês, Home e End a semana, Enter escolhe
  base       shadcn Calendar (react-day-picker) com locale ptBR do date-fns
  usado em   S07, S15 (agendadas), S26
```

```
Seletor de período
  gatilho    botão com o atalho e as datas: "Últimos 7 dias · 6 a 12 de out."
  popover    atalhos à esquerda (Hoje, Ontem, Últimos 7 dias, Este mês, Mês passado, Máximo, Personalizado;
             no S28 também Esta semana e Semana passada) e calendário de intervalo à direita para o personalizado
  fuso       o rodapé mostra o fuso do dashboard ("Horário de Brasília")
  estados    padrão, personalizado, intervalo inválido
  URL        ?periodo=7d ou ?de=2026-10-01&ate=2026-10-12
  usado em   S17, S18, S19, S26, S27, S28
```

```
Multiselect de filtro
  gatilho    botão "Produto: todos" / "Produto: 2 selecionados"
  lista      busca, checkbox por item, "Selecionar todos" e "Limpar"; aplica ao fechar
  estados    nenhum (= todos), alguns, todos, carregando, sem opções
  base       Popover + Command
  usado em   S10, S17, S18, S19, S27, S28
```

```
Indicador de atualização
  forma      "Atualizado há 3 min" (xs, muted; hora exata no title) + botão ghost sm "Atualizar" com ícone
  estados    em dia; atualizando (spinner, botão travado, texto "Atualizando…"); atrasado (mais de 2 ciclos de
             sincronização: ícone de atenção em warning + "Os dados podem estar atrasados" + tooltip com o
             último sync de cada conta)
  a11y       o texto relativo não fica em aria-live (mudaria a cada minuto); o fim de um "Atualizar" é anunciado
  usado em   S17, S18, S27, S28
```

---

## Kanban

```
Tile de quadro
  forma      altura 96, largura da grade (mínimo 200), raio lg; fundo = tom label-*-bold, degradê entre dois tons
             fortes, ou imagem com faixa escura (--ds-board-header) atrás do nome
  conteúdo   nome (sm 600, branco: label-text-bold), estrela no canto (aparece no hover e no foco; fica sempre
             visível se favoritado)
  estados    padrão, hover (escurece 8%), favoritado, foco
  a11y       o tile é um link; a estrela é um botão irmão, não um filho do link ("Favoritar quadro Marketing")
  usado em   S03
```

```
Seletor de fundo do quadro
  opções     10 cores (tons fortes), 6 degradês nossos entre tons fortes, imagem enviada
  forma      grade de amostras de 48×32, raio md; a escolhida tem check e anel ring
  a11y       radiogroup; cada amostra tem nome ("Azul", "Degradê azul e roxo")
  usado em   S04, S08
```

```
Coluna de lista
  forma      largura 272, espaço de 12 entre listas, bg surface-sunken (ou o tom -subtle da cor da lista),
             raio lg, padding 8
  cabeçalho  título editável (sm 600), contador de cards (xs muted), recolher, menu da lista
  corpo      rola na vertical quando enche; cards com 8 de espaço entre eles
  rodapé     "Adicionar card" (ghost) abre o compositor: textarea + "Adicionar" (primário) + fechar;
             Enter adiciona e mantém aberto, Esc fecha
  estados    padrão, arrastando, cheia (rolagem), compositor aberto, recolhida (40 de largura, título na vertical)
  arrastar   a lista sobe (shadow-pop) e o lugar dela vira um contorno tracejado em border-input
  usado em   S05
```

```
Card (frente)
  forma      bg surface, raio md, shadow-card, padding 8/12, espaço interno de 4
  partes     capa (faixa de 32 na cor normal da etiqueta ou imagem até 160 de altura), etiquetas, título (sm, até
             4 linhas), badges, avatares (xs) à direita; concluído (checkbox redondo) antes do título, se o quadro usa
  capa cheia o card inteiro na cor normal (texto label-text) ou imagem com faixa escura atrás do título
  estados    padrão; hover (contorno de 1 px border-input, aparece o lápis); foco (anel ring); arrastando (shadow-pop,
             gira 2°, sem giro com reduzir animações; o lugar vira contorno tracejado); filtrado (escondido, o filtro
             mostra a contagem); concluído (título com check); somente leitura (sem lápis, sem arrastar)
  clique     o card inteiro abre o verso (link esticado sobre o card); concluído e lápis são botões por cima do link
  teclado    Tab passa pelos cards; Enter abre; E edição rápida; Espaço pega para mover, setas movem entre posições e
             listas, Espaço solta, Esc cancela
  leitor     anúncios em português no arrastar: "Card Revisar anúncio pego. Posição 2 de 5 na lista A fazer.",
             "Movido para a lista Feito, posição 1 de 3."
  base       @dnd-kit (sensores de mouse, toque e teclado; anúncios próprios)
  usado em   S05, S30
```

```
Verso do card (estrutura do modal)
  topo       capa (se houver), seletor da lista atual ("na lista A fazer"), concluído + título editável (lg 600), fechar
  barra      botão "Adicionar" com Etiquetas, Datas, Checklist, Membros, Anexo, Campos, Métricas (novo)
  coluna principal  chips de membros, etiquetas, datas e métricas; descrição; campos personalizados; checklists;
             anexos; painel de métricas (S25)
  coluna lateral  280: comentários e atividade, com "Mostrar detalhes"
  responsivo abaixo de 768 px: tela cheia e a coluna lateral desce para baixo da principal
  URL        /c/:cardId abre o modal por cima do quadro; fechar volta para a URL do quadro
  usado em   S06
```

```
Checklist
  partes     título editável, barra de progresso com %, itens, "Ocultar marcados", compositor de item
  item       checkbox + texto editável + responsável (avatar xs) + prazo (badge) + menu (converter em card, excluir)
  reordenar  arrastar ou, pelo teclado, mover com Alt+setas
  excluir    checklist inteira pede confirmação num popover
  usado em   S06
```

```
Editor de texto rico
  barra      negrito, itálico, título, listas, link, código, menção; aparece ao editar
  atalhos    os de markdown (**, -, #) e Ctrl+Enter para salvar
  menção     "@" abre a lista dos membros do quadro (combobox com aria-activedescendant)
  estados    leitura (clicar edita; links funcionam), editando (Salvar e Cancelar), salvando, vazio
             ("Escreva uma descrição…"), conflito (faixa de atenção: "Esta descrição mudou enquanto você editava",
             com "Ver a versão nova" e "Manter a minha")
  rascunho   texto não salvo fica no navegador por card e volta se a página recarregar
  base       Tiptap
  usado em   S06 (descrição e comentários)
```

```
Comentário e atividade
  comentário avatar md, nome (sm 600), hora relativa (link para o comentário, hora exata no title), texto rico,
             Editar e Excluir no próprio
  atividade  avatar xs + frase ("Ana moveu este card de A fazer para Feito") + hora; ação de automação mostra
             ícone de robô e o nome da automação
  estados    vazio, lista, editando, excluído ("Comentário excluído")
  usado em   S06, S08 (atividade do quadro)
```

---

## Automação

```
Blocos do construtor de regra
  tipos      gatilho, filtro, ação; cada bloco é um card (bg surface, borda border, raio lg) com o tipo escrito no topo
  frase      cada bloco se lê como uma frase com selects no meio: "Quando um card for movido para a lista [Feito ▾]"
  ações      até 20, contador "3 de 20"; reordenar arrastando ou com botões subir e descer; remover
  variáveis  botão "Inserir variável" abre a lista; a variável entra como chip dentro do texto
  prévia     a regra inteira em uma frase, no topo
  estados    incompleto (borda tracejada + o que falta: "Escolha a lista"), válido, inválido (borda danger +
             motivo: "A lista Feito foi excluída"), salvo
  salvar     travado até ficar válido; um resumo no topo lista os erros com link para cada bloco
  usado em   S15
```

```
Construtor de condições
  linha      [métrica ▾] [operador ▾] [valor] [unidade] + remover; "E" escrito entre as linhas
  nível      objeto (campanha, conjunto, anúncio) ou dashboard
  valores    aceitam vírgula decimal; dinheiro e % com prefixo e sufixo
  estados    incompleto, válido, inválido
  usado em   S15 (gatilho por métrica)
```

---

## Tracking

```
Card de métrica (KPI)
  tamanhos   md (Resumo: grade de colunas automáticas, mínimo 240) e sm (painel do card, S25)
  partes     rótulo (xs 500, muted) com ícone de informação que mostra a fórmula; valor numa linha só, com
             algarismos fixos (md: display quando o card tem 320 px ou mais, xl abaixo disso; sm: xl);
             comparação: seta + "+12,4% vs. período anterior"
  cor da comparação  depende do sentido da métrica: mais é melhor (faturamento, lucro, ROAS) ou menos é melhor
             (gasto, CPA, reembolso); neutra fica em muted
  estados    carregando (skeleton), sem dados ("—" + "Sem vendas no período"), erro (ícone + "Não deu para
             carregar" + "Tentar de novo"), positivo, negativo
  tokens     bg card, borda border, raio lg, padding 16
  a11y       grupo com aria-label da frase inteira: "Lucro: R$ 1.234,56, 12,4% maior que no período anterior"
  usado em   S17, S25
```

```
Tabela de dados
  densidade  linha de 40 (padrão) ou 32 (compacta, preferência do usuário)
  cabeçalho  bg muted, texto sm 600 muted-foreground, fixo ao rolar; ordenar clicando (botão com aria-sort e seta)
  colunas    primeira coluna (nome) fixa ao rolar para o lado; números à direita com algarismos fixos;
             negativos em danger com "−"; mostrar, ocultar e reordenar por um popover com "Restaurar padrão"
             (a escolha fica no navegador, por tabela)
  totais     última linha fixa embaixo, peso 600, borda superior de 2 px
  célula editável (orçamento)  valor + lápis no hover e no foco; vira Input de dinheiro; Enter abre a confirmação
             "Mudar o orçamento de R$ 50,00 para R$ 80,00 no Meta?"; depois: spinner na célula; sucesso com toast;
             erro volta ao valor anterior com ícone de erro e o motivo em tooltip
  barra      busca por nome, filtros, botão de colunas, exportar (CSV e Excel)
  linha      menu de ações à direita (ex.: "Criar card" no S18); hover bg accent
  estados    carregando (5 linhas de skeleton), vazio (estado vazio dentro da tabela), filtro sem resultado, erro
             (faixa acima da tabela), muitas linhas (virtualizada acima de 200)
  a11y       <table> de verdade com <caption> oculta ("Campanhas do Meta, últimos 7 dias"); toggle de status com nome
  base       TanStack Table + shadcn Table
  usado em   S12, S16, S18, S19, S26, S27, S28
```

```
Gráfico
  tipos      barras (vendas por produto, por fonte; relatório por dia ou hora), rosca (forma de pagamento),
             barras de taxa de aprovação por forma de pagamento
  cores      chart-1 a chart-8 em ordem fixa por categoria, a mesma em todas as telas
             (Pix chart-1, Cartão chart-2, Boleto chart-3, Outros chart-8)
  leitura    legenda sempre visível com os valores; rótulo direto nas barras quando são até 8; tooltip com o valor
             exato; mais de 7 categorias: as 7 maiores + "Outras"; fatias da rosca separadas por 2 px de surface
  estados    carregando (bloco de skeleton), sem dados (estado vazio), erro
  a11y       <figure> com <figcaption>; botão "Ver como tabela" mostra os mesmos números numa Tabela de dados;
             o SVG fica com aria-hidden
  animação   as barras crescem ao carregar; com reduzir animações, aparecem prontas (useReducedMotion)
  base       shadcn Chart (Recharts)
  usado em   S17, S28
```

```
Assistente em passos
  forma      lista de passos à esquerda (lg) ou barra "2 de 5" no topo (celular); cada passo é um card com
             explicação e uma ação
  estados    atual (anel ring, peso 600, aria-current="step"), concluído (check em success), pulado (traço + "Pulado"),
             bloqueado (diz o que falta antes)
  ações      "Continuar" (primário), "Pular por enquanto" (ghost), "Voltar"
  a11y       <ol> com o estado de cada passo no texto
  usado em   S29
```

---

## A cola entre kanban e tracking

```
Vincular card a métrica
  forma      Combobox em popover com resultados agrupados (Campanhas, Conjuntos, Anúncios, Produtos, Dashboards),
             cada um com uma tag de texto da plataforma ("Meta", "Google", "Shopify") e o dashboard de referência
  logos      por enquanto só texto; logos de Meta, Google e Shopify só entram seguindo as regras de marca de cada um
             (decidido no /replica-brand)
  estados    sem integração (link para S21), sem resultado, vinculado (chip com remover), alvo excluído na plataforma
             (chip em warning: "Esta campanha não existe mais no Meta")
  usado em   S24
```

```
Painel de métricas no card
  forma      seção no verso do card: 3 a 4 KPIs sm (faturamento, gasto, ROAS, lucro), período (Select), link
             "Abrir no relatório" (S18 já filtrado)
  estados    sem dados, carregando, positivo, negativo, dados atrasados (faixa de atenção pequena)
  usado em   S06, S25
```

---

## Conferência

- Contraste: `replica/design/contrast-report.txt`, já com as cores da marca:
  74 pares em cada tema, 0 falhas no nível AA (texto 4,5:1; bordas de campo,
  anel de foco e cores de gráfico 3:1).
- Componentes do recon cobertos: os 34, mais Campo, Select/Combobox,
  Checkbox/Radio, Tooltip, Kbd, Barra de progresso, Barra superior, Menu
  lateral, Barra de filtros, Seletor de fundo, Verso do card, Comentário,
  Vincular e Painel de métricas.
- A conferência visual de verdade (os primitivos montados em código numa rota
  `/design`) fica para o primeiro passo do build, com o seu "sim".
