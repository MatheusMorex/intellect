import { ArrowLeft, BarChart3, CalendarClock, Clock, History, LayoutGrid, MousePointerClick, Plus, Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AutomationMenu, AutomationToggle } from "@/components/automation/directory-client";
import { StatusPill } from "@/components/ds/badges";
import { Banner } from "@/components/ds/banner";
import { EmptyState } from "@/components/ds/empty-state";
import { HelpTip } from "@/components/ds/help-tip";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TYPE_INFO } from "@/lib/automation/describe";
import type { AutomationType } from "@/lib/automation/schema";
import { dateTime, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getAutomationDirectory, getAutomationRuns } from "@/server/data/automation";

export const metadata: Metadata = { title: "Automação" };

const TABS: { id: string; type: AutomationType | null; label: string; icon: React.ElementType }[] = [
  { id: "regras", type: "rule", label: "Regras", icon: Workflow },
  { id: "metricas", type: "metric", label: "Por métrica", icon: BarChart3 },
  { id: "agendadas", type: "scheduled", label: "Programadas", icon: Clock },
  { id: "prazos", type: "due_date", label: "Por data de entrega", icon: CalendarClock },
  { id: "botoes-card", type: "card_button", label: "Botões do card", icon: MousePointerClick },
  { id: "botoes-quadro", type: "board_button", label: "Botões do quadro", icon: LayoutGrid },
  { id: "historico", type: null, label: "Histórico", icon: History },
];

const EMPTY: Record<AutomationType, string> = {
  rule: "Ex.: quando um card for para Feito, marcar o prazo como concluído e comentar.",
  metric: "Ex.: quando o ROAS de uma campanha ficar abaixo de 1,5 nos últimos 7 dias, colocar a etiqueta Urgente no card dela.",
  scheduled: "Ex.: toda segunda às 9h, criar o card “Revisão semanal das campanhas”.",
  due_date: "Ex.: 1 dia antes do prazo, colocar a pessoa responsável no card.",
  card_button: "Ex.: um botão “Pedir revisão” que coloca alguém no card e move para Em andamento.",
  board_button: "Ex.: um botão “Limpar Feito” que arquiva todos os cards da lista Feito.",
};

const RUN_STATUS = {
  success: { status: "paid", label: "Sucesso" },
  error: { status: "chargeback", label: "Erro" },
  skipped: { status: "refused", label: "Não rodou" },
} as const;

type SP = { aba?: string; automacao?: string; status?: string };

// S14 Diretório de automação, com o S16 (Histórico) numa das abas.
export default async function AutomationPage({ params, searchParams }: { params: Promise<{ boardId: string }>; searchParams: Promise<SP> }) {
  const { boardId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const data = await getAutomationDirectory({ user }, boardId);
  const tab = TABS.find((t) => t.id === sp.aba) ?? TABS[0];
  const count = (type: AutomationType | null) => (type ? data.automations.filter((a) => a.type === type).length : null);

  return (
    <PageBody wide>
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/b/${boardId}`}>
            <ArrowLeft aria-hidden="true" />
            {data.board.name}
          </Link>
        </Button>
      </div>
      <PageHeader
        title="Automação"
        help="automacao"
        description={`Regras, botões e checagens de métrica do quadro ${data.board.name}.`}
        actions={
          data.canEdit &&
          tab.type && (
            <Button asChild>
              <Link href={`/b/${boardId}/automation/new?tipo=${tab.type}`}>
                <Plus aria-hidden="true" />
                {TYPE_INFO[tab.type].create}
              </Link>
            </Button>
          )
        }
      />
      {!data.canEdit && <p className="text-sm text-muted-foreground">{data.board.closed ? "O quadro está fechado: as automações estão paradas." : "Você pode ver as automações, mas só membros do quadro mudam."}</p>}

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Tipos de automação" className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {TABS.map((t) => {
            const active = t.id === tab.id;
            const n = count(t.type);
            return (
              <Link
                key={t.id}
                href={`/b/${boardId}/automation?aba=${t.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-primary-subtle font-semibold text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <t.icon aria-hidden="true" className="size-4" />
                <span className="flex-1">{t.label}</span>
                {n != null && n > 0 && <span className="text-xs tabular-nums">{n}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0">{tab.type ? <AutomationList data={data} type={tab.type} /> : <RunHistory boardId={boardId} sp={sp} automations={data.automations} />}</div>
      </div>
    </PageBody>
  );
}

function AutomationList({ data, type }: { data: Awaited<ReturnType<typeof getAutomationDirectory>>; type: AutomationType }) {
  const items = data.automations.filter((a) => a.type === type);
  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={Workflow}
          title={TYPE_INFO[type].empty}
          description={`${TYPE_INFO[type].hint} ${EMPTY[type]}`}
          action={
            data.canEdit && (
              <Button asChild>
                <Link href={`/b/${data.board.id}/automation/new?tipo=${type}`}>
                  <Plus aria-hidden="true" />
                  {TYPE_INFO[type].create}
                </Link>
              </Button>
            )
          }
        />
      </div>
    );
  }
  return (
    <ul className="grid gap-3">
      {items.map((a) => (
        <li key={a.id} className={cn("grid gap-2 rounded-lg border bg-card p-4", !a.enabled && "bg-muted/40")}>
          <div className="flex items-start gap-3">
            <AutomationToggle id={a.id} name={a.name} enabled={a.enabled} disabled={!data.canEdit} />
            <div className="grid min-w-0 flex-1 gap-1">
              <h3 className="text-sm font-semibold break-words">{a.name}</h3>
              <p className="text-sm break-words text-muted-foreground">{a.description}</p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {a.lastRun ? (
                  <span className="inline-flex items-center gap-1.5">
                    <StatusPill status={RUN_STATUS[a.lastRun.status].status}>{RUN_STATUS[a.lastRun.status].label}</StatusPill>
                    <span title={dateTime(new Date(a.lastRun.at))}>última vez {relative(new Date(a.lastRun.at))}</span>
                  </span>
                ) : (
                  <span>Ainda não rodou.</span>
                )}
                {a.runs > 0 && (
                  <span>
                    {a.runs} {a.runs === 1 ? "execução" : "execuções"}
                    {a.errors > 0 && `, ${a.errors} com erro`}
                  </span>
                )}
                {a.enabled && a.nextRunAt && (a.type === "scheduled" || a.type === "metric") && <span title={dateTime(new Date(a.nextRunAt))}>próxima {relative(new Date(a.nextRunAt))}</span>}
              </p>
            </div>
            <AutomationMenu id={a.id} name={a.name} boardId={data.board.id} type={a.type} canEdit={data.canEdit} />
          </div>
          {a.disabledReason && (
            <Banner variant="error" title="Desligada por erro">
              {a.disabledReason} Corrija a automação e ligue de novo.
            </Banner>
          )}
        </li>
      ))}
    </ul>
  );
}

async function RunHistory({ boardId, sp, automations }: { boardId: string; sp: SP; automations: { id: string; name: string }[] }) {
  const user = await requireUser();
  const status = sp.status === "success" || sp.status === "error" || sp.status === "skipped" ? sp.status : undefined;
  const runs = await getAutomationRuns({ user }, boardId, { automationId: sp.automacao, status });
  const filtered = automations.find((a) => a.id === sp.automacao);
  const link = (patch: Partial<SP>) => {
    const q = new URLSearchParams({ aba: "historico", ...(sp.automacao ? { automacao: sp.automacao } : {}), ...(status ? { status } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    return `/b/${boardId}/automation?${q.toString()}`;
  };
  const chip = (label: string, value: string | undefined) => (
    <Link
      href={link({ status: value })}
      aria-current={status === value ? "page" : undefined}
      className={cn("rounded-full border px-3 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring", status === value ? "border-primary bg-primary-subtle font-semibold text-primary" : "hover:bg-accent")}
    >
      {label}
    </Link>
  );
  return (
    <section aria-labelledby="historico" className="grid gap-3">
      <div className="flex items-center gap-1">
        <h2 id="historico" className="text-base font-semibold">
          Histórico de execuções{filtered ? `: ${filtered.name}` : ""}
        </h2>
        <HelpTip topic="automacao-historico" className="size-5" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {chip("Todas", undefined)}
        {chip("Sucesso", "success")}
        {chip("Erro", "error")}
        {chip("Não rodou", "skipped")}
        {filtered && (
          <Link href={link({ automacao: undefined })} className="text-xs text-primary hover:underline">
            Ver de todas as automações
          </Link>
        )}
      </div>
      {runs.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState icon={History} title="Nada rodou ainda" description="Cada vez que uma automação rodar, aparece aqui: quando, em qual card, se deu certo e o motivo quando não deu." />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Automação</TableHead>
                <TableHead>Card</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Mensagem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap" title={dateTime(new Date(r.at))}>
                    {relative(new Date(r.at))}
                  </TableCell>
                  <TableCell className="max-w-56">
                    <Link href={link({ automacao: r.automationId })} className="line-clamp-2 hover:underline">
                      {r.automationName}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-56">
                    {r.cardId ? (
                      <Link href={`/b/${boardId}?card=${r.cardId}`} className="line-clamp-2 text-primary hover:underline">
                        {r.cardName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{r.cardName ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={RUN_STATUS[r.status].status}>{RUN_STATUS[r.status].label}</StatusPill>
                    {r.depth > 0 && <span className="ml-2 text-xs text-muted-foreground">em sequência ({r.depth})</span>}
                  </TableCell>
                  <TableCell className="min-w-56 text-sm text-muted-foreground">{r.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
