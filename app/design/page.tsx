import { FolderKanban, LayoutDashboard, Megaphone, Plus, ReceiptText, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Banner } from "@/components/ds/banner";
import { BrandSymbol, Logo } from "@/components/brand/logo";
import { ChecklistBadge, DueBadge, MetricBadge, StatusPill } from "@/components/ds/badges";
import { CodeBox } from "@/components/ds/code-box";
import { EmptyState } from "@/components/ds/empty-state";
import { DropPlaceholder, KanbanCard, ListColumn } from "@/components/ds/kanban";
import { KpiCard } from "@/components/ds/kpi-card";
import { LABEL_HUES, LABEL_HUE_NAME, LabelChip } from "@/components/ds/label-chip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CalendarDemo,
  CampaignTableDemo,
  ComboboxDemo,
  DesignControls,
  KpiRetryDemo,
  OverlaysDemo,
  PaymentsChartDemo,
  PeriodPickerDemo,
  RefreshDemo,
  SearchFieldDemo,
} from "./demos";

export const metadata: Metadata = { title: "Sistema visual" };
// Montada a cada acesso: os prazos de exemplo são calculados a partir de agora.
export const dynamic = "force-dynamic";

// Prancha do sistema visual (replica-design, passo 4): os primitivos montados uma
// vez, isolados, antes de qualquer tela. Fonte: replica/design/components.md.

const ROLES: { token: string; className: string }[] = [
  { token: "bg", className: "bg-background" },
  { token: "surface", className: "bg-card" },
  { token: "surface-sunken", className: "bg-muted" },
  { token: "surface-hover", className: "bg-accent" },
  { token: "border", className: "bg-border" },
  { token: "border-input", className: "bg-input" },
  { token: "text", className: "bg-foreground" },
  { token: "text-muted", className: "bg-muted-foreground" },
  { token: "accent", className: "bg-primary" },
  { token: "accent-hover", className: "bg-primary-hover" },
  { token: "accent-subtle", className: "bg-primary-subtle" },
  { token: "ring", className: "bg-ring" },
  { token: "danger", className: "bg-danger" },
  { token: "danger-subtle", className: "bg-danger-subtle" },
  { token: "success", className: "bg-success" },
  { token: "success-subtle", className: "bg-success-subtle" },
  { token: "warning", className: "bg-warning" },
  { token: "warning-subtle", className: "bg-warning-subtle" },
];

const TYPE = [
  { name: "display 32/40 700", className: "text-display", sample: "R$ 48.215,90" },
  { name: "xl 24/32 600", className: "text-xl", sample: "Resumo da operação" },
  { name: "lg 20/28 600", className: "text-lg", sample: "Revisar criativos da semana" },
  { name: "base 16/24 400", className: "text-base", sample: "Descrição longa de um card, com o contexto da tarefa e os links que o time precisa." },
  { name: "sm 14/20 400", className: "text-sm", sample: "Texto padrão da interface: menus, células de tabela, títulos de card." },
  { name: "xs 12/16 500", className: "text-xs text-muted-foreground", sample: "Ajuda, badges, etiquetas, cabeçalhos pequenos." },
];

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="rounded-lg border bg-card p-4 sm:p-6">
      <h2 id={`${id}-titulo`} className="text-lg">
        {title}
      </h2>
      {lead && <p className="mt-1 text-muted-foreground">{lead}</p>}
      <div className="mt-4 grid grid-cols-1 gap-4">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

export default function DesignPage() {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card px-4 py-2 sm:px-6">
        <Link href="/" aria-label="INtellect, início" className="rounded-sm">
          <Logo />
        </Link>
        <h1 className="flex-1 text-sm text-muted-foreground">Sistema visual</h1>
        <DesignControls />
      </header>

      <main className="mx-auto grid max-w-content grid-cols-1 gap-6 p-4 sm:p-6">
        <Section id="marca" title="Marca" lead="Peças do pacote INtellect (public/marca) e o item selecionado no menu.">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            <div className="grid h-24 place-items-center rounded-md border bg-white px-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático */}
              <img src="/marca/intellect-logo-para-fundo-claro.svg" alt="Logo para fundo claro" className="h-10" />
            </div>
            <div className="grid h-24 place-items-center rounded-md bg-brand-ink px-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático */}
              <img src="/marca/intellect-logo-para-fundo-escuro.svg" alt="Logo para fundo escuro" className="h-10" />
            </div>
            <div className="flex h-24 items-center justify-center gap-6 rounded-md bg-muted">
              <BrandSymbol size={48} alt="Símbolo" />
              <span className="grid size-14 place-items-center rounded-md bg-white">
                <BrandSymbol size={48} variant="purple" alt="Símbolo roxo" />
              </span>
              <span className="grid size-14 place-items-center rounded-md bg-brand-indigo">
                <BrandSymbol size={48} variant="white" alt="Símbolo branco" />
              </span>
            </div>
            <div className="grid h-24 grid-cols-4 overflow-hidden rounded-md" aria-label="Cores da marca: roxo, lavanda forte, lavanda e quase-preto">
              <span className="bg-brand-indigo" />
              <span className="bg-brand-lavender-strong" />
              <span className="bg-brand-lavender" />
              <span className="bg-brand-ink" />
            </div>
          </div>
          <Sub title="Menu lateral (item ativo em primary-subtle)">
            <nav aria-label="Exemplo de menu" className="grid w-62 gap-0.5 rounded-lg border p-2">
              {[
                { icon: FolderKanban, text: "Quadros" },
                { icon: LayoutDashboard, text: "Resumo", current: true },
                { icon: Megaphone, text: "Meta" },
                { icon: ReceiptText, text: "Vendas" },
              ].map(({ icon: Icon, text, current }) => (
                <a
                  key={text}
                  href="#marca"
                  aria-current={current ? "page" : undefined}
                  className="flex h-8 items-center gap-2.5 rounded-md px-2.5 hover:bg-accent aria-[current=page]:bg-primary-subtle aria-[current=page]:font-semibold aria-[current=page]:text-primary"
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {text}
                </a>
              ))}
            </nav>
          </Sub>
        </Section>

        <Section id="cores" title="Cores por papel" lead="Cada amostra mostra o papel (tokens.json) e a classe do Tailwind. Troque o tema no topo.">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {ROLES.map((role) => (
              <div key={role.token} className="overflow-hidden rounded-md border">
                <div className={`h-11 ${role.className}`} />
                <p className="px-2 pt-1.5 text-xs font-semibold">{role.token}</p>
                <p className="px-2 pb-1.5 font-mono text-xs text-muted-foreground">{role.className}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="tipografia" title="Tipografia" lead="Inter, com a fonte do sistema como reserva. Interface em 14 px; texto longo em 16 px.">
          <div className="divide-y">
            {TYPE.map((t) => (
              <div key={t.name} className="flex items-baseline gap-4 py-2">
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground sm:w-40">{t.name}</span>
                <span className={`${t.className} tabular`}>{t.sample}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="botoes" title="Botões" lead="Use Tab para ver o anel de foco.">
          <Sub title="Variantes">
            <div className="flex flex-wrap gap-3">
              <Button>Criar quadro</Button>
              <Button variant="secondary">Duplicar</Button>
              <Button variant="outline">Exportar</Button>
              <Button variant="ghost">Cancelar</Button>
              <Button variant="destructive">
                <Trash2 aria-hidden="true" />
                Excluir quadro
              </Button>
              <Button variant="link">Ver detalhes</Button>
            </div>
          </Sub>
          <Sub title="Tamanhos e estados">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Pequeno 32</Button>
              <Button>Médio 36</Button>
              <Button size="lg">Grande 40</Button>
              <Button size="icon" aria-label="Adicionar card">
                <Plus aria-hidden="true" />
              </Button>
              <Button disabled>Desabilitado</Button>
              <Button loading>Salvando</Button>
              <Button variant="outline" loading>
                Exportando
              </Button>
            </div>
          </Sub>
        </Section>

        <Section id="campos" title="Campos e seleção">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="d-nome">Nome do quadro</Label>
              <Input id="d-nome" placeholder="Ex.: Lançamento de novembro" aria-describedby="d-nome-ajuda" />
              <p id="d-nome-ajuda" className="text-xs font-normal text-muted-foreground">
                Até 512 caracteres.
              </p>
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="d-orcamento">Orçamento diário (obrigatório)</Label>
              <Input id="d-orcamento" defaultValue="abc" aria-invalid="true" aria-describedby="d-orcamento-erro" />
              <p id="d-orcamento-erro" className="text-xs font-normal text-danger">
                Use só números, como 80,00.
              </p>
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="d-fuso">Fuso do dashboard</Label>
              <Select defaultValue="sp">
                <SelectTrigger id="d-fuso" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sp">Horário de Brasília</SelectItem>
                  <SelectItem value="am">Horário do Amazonas</SelectItem>
                  <SelectItem value="ac">Horário do Acre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="d-desab">Desabilitado</Label>
              <Input id="d-desab" defaultValue="America/Sao_Paulo" disabled />
            </div>
            <div className="grid content-start gap-1.5 sm:col-span-2">
              <Label htmlFor="d-desc">Descrição</Label>
              <Textarea id="d-desc" placeholder="Escreva uma descrição…" />
            </div>
            <div className="grid content-start gap-1.5">
              <span className="text-sm font-medium">Busca e combobox</span>
              <SearchFieldDemo />
              <ComboboxDemo />
            </div>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Sub title="Checkbox">
              <div className="grid gap-2">
                <Label className="font-normal">
                  <Checkbox defaultChecked /> Marcado
                </Label>
                <Label className="font-normal">
                  <Checkbox /> Desmarcado
                </Label>
                <Label className="font-normal">
                  <Checkbox checked="indeterminate" /> Alguns selecionados
                </Label>
              </div>
            </Sub>
            <Sub title="Radio">
              <RadioGroup defaultValue="todas" aria-label="Modo do filtro">
                <Label className="font-normal">
                  <RadioGroupItem value="qualquer" /> Qualquer condição
                </Label>
                <Label className="font-normal">
                  <RadioGroupItem value="todas" /> Todas as condições
                </Label>
              </RadioGroup>
            </Sub>
            <Sub title="Toggle">
              <div className="grid gap-2">
                <Label className="font-normal">
                  <Switch defaultChecked /> Automação ligada
                </Label>
                <Label className="font-normal">
                  <Switch /> Automação desligada
                </Label>
                <Label className="font-normal">
                  <Switch disabled /> Sem permissão
                </Label>
              </div>
            </Sub>
            <Sub title="Tooltip, atalho e avatares">
              <div className="flex flex-wrap items-center gap-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="Adicionar membro">
                      <Plus aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Adicionar membro</TooltipContent>
                </Tooltip>
                <span className="flex items-center gap-1.5">
                  <Kbd>N</Kbd> novo card
                </span>
                <div className="flex -space-x-1" aria-label="Ana, Bruno e mais 2">
                  {[
                    ["AL", "purple"],
                    ["BR", "sky"],
                    ["CS", "orange"],
                  ].map(([initials, color]) => (
                    <Avatar key={initials} className="size-8 ring-2 ring-card">
                      <AvatarFallback
                        className="text-xs font-semibold"
                        style={{ background: `var(--ds-label-${color}-bold)`, color: "var(--ds-label-text-bold)" }}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  <Avatar className="size-8 ring-2 ring-card">
                    <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">+2</AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </Sub>
          </div>

          <Sub title="Abas de nível (sublinhado)">
            <Tabs defaultValue="campanhas">
              <TabsList variant="underline">
                {["Contas", "Campanhas", "Conjuntos", "Anúncios"].map((tab) => (
                  <TabsTrigger key={tab} value={tab.toLowerCase()}>
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="campanhas" className="pt-3 text-muted-foreground">
                Clicar numa campanha abre a aba Conjuntos já filtrada por ela.
              </TabsContent>
            </Tabs>
          </Sub>
        </Section>

        <Section id="etiquetas" title="Etiquetas" lead="10 cores em 3 tons. Ligue Daltônicos no topo para ver os padrões.">
          <div className="grid grid-cols-[110px_repeat(3,minmax(110px,1fr))] items-center gap-x-4 gap-y-2 overflow-x-auto">
            <span className="text-xs text-muted-foreground">cor</span>
            <span className="text-xs text-muted-foreground">sutil (_light)</span>
            <span className="text-xs text-muted-foreground">normal</span>
            <span className="text-xs text-muted-foreground">forte (_dark)</span>
            {LABEL_HUES.map((hue) => (
              <div key={hue} className="contents">
                <span className="flex items-center gap-2">
                  <LabelChip color={hue} name={LABEL_HUE_NAME[hue]} compact />
                  {LABEL_HUE_NAME[hue]}
                </span>
                <span>
                  <LabelChip color={`${hue}_light`} name="Prioridade" />
                </span>
                <span>
                  <LabelChip color={hue} name="Criativo" />
                </span>
                <span>
                  <LabelChip color={`${hue}_dark`} name="Urgente" />
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="badges" title="Badges e status">
          <Sub title="Frente do card: prazo, checklist e métrica">
            <div className="flex flex-wrap gap-2">
              <DueBadge due={new Date(now.getTime() + 8 * day)} now={now} />
              <DueBadge due={new Date(now.getTime() + 0.5 * day)} now={now} />
              <DueBadge due={new Date(now.getTime() - 2 * day)} now={now} />
              <DueBadge due={new Date(now.getTime() - 4 * day)} complete now={now} />
              <ChecklistBadge done={3} total={10} />
              <ChecklistBadge done={10} total={10} />
              <MetricBadge label="ROAS" value="2,45" trend="up" period="nos últimos 7 dias" />
              <MetricBadge label="Lucro" value="−R$ 320" trend="down" period="nos últimos 7 dias" />
              <MetricBadge label="ROAS" value={null} />
            </div>
          </Sub>
          <Sub title="Pedidos e integrações">
            <div className="flex flex-wrap gap-2">
              <StatusPill status="paid" />
              <StatusPill status="pending" />
              <StatusPill status="refused" />
              <StatusPill status="refunded" />
              <StatusPill status="chargeback" />
              <StatusPill status="test" />
              <StatusPill status="connected" />
              <StatusPill status="expiring">Expira em 5 dias</StatusPill>
              <StatusPill status="error">Token vencido</StatusPill>
            </div>
          </Sub>
        </Section>

        <Section id="sobreposicoes" title="Popover, menu, janelas e toasts">
          <OverlaysDemo />
        </Section>

        <Section id="avisos" title="Avisos, vazio, carregando e progresso">
          <div className="grid gap-3">
            <Banner variant="warning" title="Configuração incompleta" action={<Button size="sm" variant="outline">Continuar configuração</Button>}>
              Falta conectar o Google Ads.
            </Banner>
            <Banner variant="error" title="A conexão com o Meta venceu" action={<Button size="sm">Conectar de novo</Button>}>
              Os gastos pararam de atualizar às 14:10.
            </Banner>
            <Banner variant="success" title="Loja conectada">
              O primeiro pedido chegou às 09:32.
            </Banner>
            <Banner variant="info" title="Sem vendas no período">
              Escolha outro período ou confira a integração da loja.
            </Banner>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border">
              <EmptyState
                icon={FolderKanban}
                title="Nenhum quadro ainda"
                description="Crie o primeiro quadro para organizar o trabalho do time."
                action={
                  <Button>
                    <Plus aria-hidden="true" />
                    Criar quadro
                  </Button>
                }
              />
            </div>
            <div className="grid content-start gap-3 rounded-lg border p-4" aria-busy="true">
              <span className="sr-only">Carregando…</span>
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="grid content-start gap-4 rounded-lg border p-4">
              <div className="grid gap-1.5">
                <div className="flex justify-between text-xs">
                  <span>Checklist</span>
                  <span className="tabular text-muted-foreground">30%</span>
                </div>
                <Progress value={30} aria-label="Checklist" aria-valuetext="30% concluído" />
              </div>
              <div className="grid gap-1.5">
                <div className="flex justify-between text-xs">
                  <span>Meta do mês</span>
                  <span className="tabular text-muted-foreground">R$ 7.420 de R$ 10.000</span>
                </div>
                <Progress value={74} aria-label="Meta do mês" aria-valuetext="74% da meta do mês" className="h-2" />
              </div>
            </div>
          </div>
        </Section>

        <Section id="datas" title="Datas e período">
          <div className="flex flex-wrap items-start gap-6">
            <CalendarDemo />
            <Sub title="Seletor de período">
              <PeriodPickerDemo />
            </Sub>
          </div>
        </Section>

        <Section id="kanban" title="Kanban" lead="Fundo do quadro no roxo da marca; listas em muted; cards em card.">
          <div className="overflow-x-auto rounded-lg" style={{ background: "var(--ds-label-purple-bold)" }}>
            <div className="flex items-center gap-3 rounded-t-lg px-4 py-2.5 font-semibold text-white" style={{ background: "var(--ds-board-header)" }}>
              Marketing de outubro
              <span className="font-normal opacity-90">· 3 listas</span>
            </div>
            <div className="flex items-start gap-3 p-4">
              <ListColumn name="A fazer" count={3}>
                <KanbanCard
                  now={now}
                  card={{
                    title: "Gravar 3 vídeos para o anúncio de Natal",
                    cover: "orange",
                    labels: [
                      { color: "green", name: "Criativo" },
                      { color: "purple", name: "Meta" },
                    ],
                    due: { at: new Date(now.getTime() + 0.6 * day) },
                    checklist: { done: 1, total: 4 },
                    members: [{ initials: "AL", color: "purple", name: "Ana" }],
                  }}
                />
                <KanbanCard
                  now={now}
                  demoState="hover"
                  card={{ title: "Revisar textos da página do kit (hover)", due: { at: new Date(now.getTime() - 2 * day) } }}
                />
                <DropPlaceholder />
              </ListColumn>
              <ListColumn name="Em andamento" count={2}>
                <KanbanCard
                  now={now}
                  demoState="dragging"
                  compactLabels={false}
                  card={{
                    title: "Escalar campanha de remarketing (arrastando)",
                    labels: [{ color: "blue_light", name: "Meta" }],
                    metric: { label: "ROAS", value: "3,10", trend: "up" },
                    members: [{ initials: "BR", color: "sky", name: "Bruno" }],
                  }}
                />
                <KanbanCard
                  now={now}
                  demoState="focus"
                  card={{
                    title: "Ajustar orçamento do Google (foco)",
                    metric: { label: "Lucro", value: "−R$ 320", trend: "down" },
                  }}
                />
              </ListColumn>
              <ListColumn name="Feito" count={1}>
                <KanbanCard
                  now={now}
                  card={{
                    title: "Configurar parâmetros no Meta",
                    done: true,
                    due: { at: new Date(now.getTime() - 4 * day), complete: true },
                  }}
                />
              </ListColumn>
            </div>
          </div>
        </Section>

        <Section id="tracking" title="Tracking">
          <RefreshDemo />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            <KpiCard
              label="Faturamento líquido"
              formula="Vendas pagas − reembolsos − taxa do gateway"
              value="R$ 48.215,90"
              delta={{ text: "12,4%", direction: "up" }}
            />
            <KpiCard
              label="Gasto com anúncios"
              formula="Soma do gasto no Meta e no Google"
              value="R$ 16.902,10"
              delta={{ text: "8,1%", direction: "up" }}
              polarity="down-good"
            />
            <KpiCard
              label="Lucro"
              formula="Líquido − gasto − impostos − custos − taxas − despesas"
              value="−R$ 1.320,00"
              negative
              delta={{ text: "140%", direction: "down" }}
            />
            <KpiCard label="ROAS" formula="Faturamento ÷ gasto" state="loading" />
            <KpiCard label="CPA" formula="Gasto ÷ vendas pagas" state="empty" />
            <KpiRetryDemo />
          </div>
          <CampaignTableDemo />
          <div className="rounded-lg border p-4">
            <PaymentsChartDemo />
          </div>
        </Section>

        <Section id="codigo" title="Caixa de código">
          <CodeBox
            label="Parâmetros de URL para o Meta"
            value="utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&itl_c={{campaign.id}}&itl_s={{adset.id}}&itl_a={{ad.id}}&itl_p={{placement}}"
          />
          <CodeBox label="Token de exemplo" value="itl_exemplo_9f3b2c7a1d8e4f60" secret />
        </Section>
      </main>
    </div>
  );
}
