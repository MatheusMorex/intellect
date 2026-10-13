import { Plug, Search, X } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ds/empty-state";
import { DashboardRefresh } from "@/components/shell/dashboard-refresh";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PeriodFilter } from "@/components/shell/period-filter";
import { CampaignTable } from "@/components/tracking/campaign-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { listWritableLists } from "@/server/data/boards";
import { getTrafficReport, isStale, type Provider, type ReportLevel, type SearchParams } from "@/server/data/tracking";

const NAMES: Record<Provider, string> = { meta: "Meta", google: "Google" };

export function levelLabel(level: ReportLevel, provider: Provider) {
  return {
    contas: "Contas",
    campanhas: "Campanhas",
    conjuntos: provider === "google" ? "Grupos" : "Conjuntos",
    anuncios: "Anúncios",
    palavras: "Palavras-chave",
  }[level];
}

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "ativos", label: "Ativos" },
  { value: "pausados", label: "Pausados" },
  { value: "restricoes", label: "Com restrições" },
];

// S18 Tráfego (Meta / Google): abas por nível, filtros, tabela e ações.
export async function CampaignsView({ dashboardId, provider, sp }: { dashboardId: string; provider: Provider; sp: SearchParams }) {
  const user = await requireUser();
  const report = await getTrafficReport({ user }, dashboardId, provider, sp);
  const lists = listWritableLists({ user });
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const base = `/d/${report.dashboard.id}/${provider}`;

  const hrefWith = (update: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const k of ["periodo", "de", "ate", "nivel", "campanha", "conjunto", "conta", "q", "status"]) {
      const v = one(sp[k]);
      if (v) q.set(k, v);
    }
    for (const [k, v] of Object.entries(update)) {
      if (v == null || v === "") q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <PageBody>
      <PageHeader
        title={NAMES[provider]}
        description={report.dashboard.name}
        actions={
          report.connected ? (
            <>
              <PeriodFilter period={report.period} />
              <DashboardRefresh dashboardId={report.dashboard.id} lastSyncedAt={report.lastSyncedAt} stale={isStale(report.lastSyncedAt)} />
            </>
          ) : undefined
        }
      />
      {!report.connected ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={Plug}
            title={`Nenhuma conta do ${NAMES[provider]} neste dashboard`}
            description="Conecte uma conta de anúncios para ver gasto, vendas e ROAS por campanha."
            action={
              <Button asChild>
                <Link href={`/d/${report.dashboard.id}/integrations`}>Ir para Integrações</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <nav aria-label="Nível" className="flex flex-wrap items-end gap-1 border-b">
            {report.levels.map((level) => {
              const active = level === report.level;
              return (
                <Link
                  key={level}
                  href={hrefWith({ nivel: level, campanha: null, conjunto: null, conta: null })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px border-b-2 border-transparent px-3 pb-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    active && "border-primary font-semibold text-foreground",
                  )}
                >
                  {levelLabel(level, provider)}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            {report.parentFilter && (
              <span className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-subtle pr-1 pl-3 text-sm text-primary">
                {levelLabel(report.parentFilter.level, provider).replace(/s$/, "")}: <strong className="max-w-64 truncate font-semibold">{report.parentFilter.name}</strong>
                <Link
                  href={hrefWith({ campanha: null, conjunto: null, conta: null })}
                  aria-label="Tirar este filtro"
                  className="grid size-6 place-items-center rounded-full outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </Link>
              </span>
            )}
            <form action={base} className="relative" role="search">
              {["periodo", "de", "ate", "nivel", "campanha", "conjunto", "conta", "status"].map((k) =>
                one(sp[k]) ? <input key={k} type="hidden" name={k} value={one(sp[k])} /> : null,
              )}
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                name="q"
                defaultValue={one(sp.q) ?? ""}
                placeholder={`Buscar ${levelLabel(report.level, provider).toLowerCase()}…`}
                aria-label="Buscar pelo nome"
                className="w-64 pl-8"
              />
            </form>
            {report.level !== "contas" && (
              <div className="flex flex-wrap gap-1 rounded-md bg-muted p-1" role="group" aria-label="Status">
                {STATUS_OPTIONS.map((o) => {
                  const active = (one(sp.status) ?? "") === o.value;
                  return (
                    <Link
                      key={o.value || "todos"}
                      href={hrefWith({ status: o.value || null })}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex h-7 items-center rounded-sm px-2.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                        active && "bg-card font-semibold text-foreground shadow-card",
                      )}
                    >
                      {o.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <CampaignTable
            key={`${report.level}-${provider}`}
            report={{
              dashboardId: report.dashboard.id,
              currency: report.dashboard.currency,
              provider,
              level: report.level,
              periodLabel: `${report.period.label}, ${report.period.description}`,
              rows: report.rows,
              totals: report.totals,
              canManage: report.canManage,
              drillHref: Object.fromEntries(
                report.rows.map((r) => [
                  r.id,
                  report.level === "contas"
                    ? hrefWith({ nivel: "campanhas", conta: r.id, campanha: null, conjunto: null, q: null, status: null })
                    : report.level === "campanhas"
                      ? hrefWith({ nivel: "conjuntos", campanha: r.id, conjunto: null, conta: null, q: null, status: null })
                      : report.level === "conjuntos"
                        ? hrefWith({ nivel: provider === "google" ? "palavras" : "anuncios", conjunto: r.id, campanha: null, conta: null, q: null, status: null })
                        : "",
                ]),
              ),
            }}
            lists={lists}
          />
        </>
      )}
    </PageBody>
  );
}
