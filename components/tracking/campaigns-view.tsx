import { Plug, Search, X } from "lucide-react";
import Link from "next/link";

import { Banner } from "@/components/ds/banner";
import { EmptyState } from "@/components/ds/empty-state";
import { HelpTip } from "@/components/ds/help-tip";
import { KpiCard } from "@/components/ds/kpi-card";
import { AdInsightBalloons } from "@/components/tracking/ad-insights";
import { DashboardRefresh } from "@/components/shell/dashboard-refresh";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PeriodFilter } from "@/components/shell/period-filter";
import { CampaignTable } from "@/components/tracking/campaign-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decimalOrZero, integer, moneyOrZero, percentOrZero, roasOrZero } from "@/lib/format";
import { METRIC } from "@/lib/metrics-glossary";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { listWritableLists } from "@/server/data/boards";
import { getTrafficReport, isStale, type Provider, type ReportLevel, type ReportRow, type SearchParams } from "@/server/data/tracking";

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

function nounFor(level: ReportLevel, provider: Provider) {
  return { contas: "conta", campanhas: "campanha", conjuntos: provider === "google" ? "grupo" : "conjunto", anuncios: "anúncio", palavras: "palavra-chave" }[level];
}

/** Tabelinhas com os números do que está na tabela (todas as linhas filtradas, no período). */
function PeriodNumbers({ provider, totals: t, currency }: { provider: Provider; totals: ReportRow; currency: string }) {
  const m = (cents: number | null) => moneyOrZero(cents, currency);
  return (
    <section aria-labelledby="numeros-periodo" className="grid gap-2">
      <div className="flex items-center gap-1">
        <h2 id="numeros-periodo" className="text-sm font-semibold text-muted-foreground">
          Números do período
        </h2>
        <HelpTip topic="trafego-numeros" className="size-5" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        <KpiCard {...METRIC.adSpend} size="sm" value={m(t.spendCents)} />
        <KpiCard {...METRIC.adSales} size="sm" value={integer(t.sales)} />
        <KpiCard {...METRIC.adRevenue} size="sm" value={m(t.revenueCents)} />
        <KpiCard {...METRIC.adRoas} size="sm" value={roasOrZero(t.roas)} />
        <KpiCard {...METRIC.adCpa} size="sm" value={m(t.cpaCents)} />
        <KpiCard {...METRIC.cpm} size="sm" value={m(t.cpmCents)} />
        <KpiCard {...METRIC.impressions} size="sm" value={integer(t.impressions)} />
        {provider === "meta" ? (
          <>
            <KpiCard {...METRIC.reach} size="sm" value={integer(t.reach ?? 0)} />
            <KpiCard {...METRIC.frequency} size="sm" value={decimalOrZero(t.frequency)} />
            <KpiCard {...METRIC.videoViews} size="sm" value={integer(t.videoViews)} />
            <KpiCard {...METRIC.hook} size="sm" value={percentOrZero(t.hookRate)} />
            <KpiCard {...METRIC.hold} size="sm" value={percentOrZero(t.holdRate)} />
          </>
        ) : (
          <>
            <KpiCard {...METRIC.clicks} size="sm" value={integer(t.clicks)} />
            <KpiCard {...METRIC.ctr} size="sm" value={percentOrZero(t.ctr, 2)} />
            <KpiCard {...METRIC.cpc} size="sm" value={m(t.cpcCents)} />
          </>
        )}
      </div>
    </section>
  );
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
  const lists = await listWritableLists({ user });
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
        help={provider === "meta" ? "trafego-meta" : "trafego-google"}
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
      {report.fxUnavailable ? (
        <Banner variant="error" title="Não deu para buscar a cotação do dia">
          Este dashboard mostra os valores em {report.dashboard.currency}, e parte dos gastos ou das vendas está em outra moeda. Sem a cotação, os números
          ficariam errados, então eles não aparecem. Confira a internet e recarregue a página em alguns minutos.
        </Banner>
      ) : !report.connected ? (
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

          <PeriodNumbers provider={provider} totals={report.totals} currency={report.dashboard.currency} />

          <AdInsightBalloons key={`leitura-${report.level}-${provider}`} items={report.insights} noun={nounFor(report.level, provider)} />

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
