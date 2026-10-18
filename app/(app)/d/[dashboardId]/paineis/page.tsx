import type { Metadata } from "next";
import Link from "next/link";

import { PanelControls } from "@/components/charts/panel-controls";
import { PanelWidgetSlot } from "@/components/charts/panel-widget";
import { Banner } from "@/components/ds/banner";
import { DashboardRefresh } from "@/components/shell/dashboard-refresh";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PeriodFilter } from "@/components/shell/period-filter";
import { FilterBar } from "@/components/tracking/filter-bar";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/charts/messages";
import { PANEL_PRESETS } from "@/lib/charts/options";
import { DEFAULT_PANEL } from "@/lib/charts/widgets";
import { TIMEZONES } from "@/lib/timezones";
import { requireUser } from "@/server/auth/session";
import { longRange } from "@/server/charts/time-buckets";
import { panelQueryKey } from "@/server/data/panels";
import { getPanels } from "@/server/data/panels-request";
import { getFilterOptions, isStale, type SearchParams } from "@/server/data/tracking";

export const metadata: Metadata = { title: "Painéis" };

const PRESETS = PANEL_PRESETS.map((id) => ({ id, label: msg.periods[id] }));

// S28 Painéis: gráficos da operação no tempo e por campanha, conta, produto e
// origem. Período, agrupamento, comparação e filtros ficam no endereço da página
// e valem só para quem está vendo. Na Fase 2 o painel é fixo (DEFAULT_PANEL);
// na Fase 5 cada dashboard terá os próprios, editáveis.
export default async function PanelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ dashboardId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { dashboardId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const queryKey = panelQueryKey(sp);
  const [panel, options] = await Promise.all([getPanels(dashboardId, queryKey), getFilterOptions({ user }, dashboardId)]);
  const { query, dashboard } = panel;
  const timezoneLabel = TIMEZONES.find(([value]) => value === dashboard.timezone)?.[1] ?? dashboard.timezone;

  const header = (
    <PageHeader
      title={msg.panel.title}
      help="paineis"
      description={dashboard.name}
      actions={
        <>
          <PeriodFilter period={query.period} presets={PRESETS} timezoneLabel={timezoneLabel} />
          <DashboardRefresh dashboardId={dashboard.id} lastSyncedAt={panel.lastSyncedAt} stale={isStale(panel.lastSyncedAt)} />
        </>
      }
    />
  );

  // Valor em outra moeda sem cotação: melhor não mostrar número nenhum do que um número errado.
  if (panel.fxUnavailable) {
    return (
      <PageBody>
        {header}
        <Banner
          variant="error"
          title={msg.panel.fx.title}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={`/d/${dashboard.id}/paineis`}>{msg.panel.fx.retry}</Link>
            </Button>
          }
        >
          {msg.panel.fx.body(dashboard.currency)}
        </Banner>
      </PageBody>
    );
  }

  const kpis = DEFAULT_PANEL.filter((w) => w.type === "kpi");
  const charts = DEFAULT_PANEL.filter((w) => w.type !== "kpi");

  return (
    <PageBody>
      {header}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterBar
          filters={[
            { name: "conta", label: msg.panel.filters.account, options: options.accounts, selected: query.filters.accounts },
            { name: "fonte", label: msg.panel.filters.source, options: options.sources, selected: query.filters.sources },
            { name: "produto", label: msg.panel.filters.product, options: options.products, selected: query.filters.products },
          ]}
        />
        <PanelControls
          granularity={query.granularity}
          granularityChosen={query.granularityChosen}
          autoGranularity={query.autoGranularity}
          allowed={query.allowedGranularities}
          compareMode={query.compareMode}
          compareRange={query.compareMode === "custom" ? query.compareRange : null}
          today={query.period.today}
        />
      </div>

      {query.granularityMessage && (
        <Banner variant="info" title={msg.panel.granularityAdjusted}>
          {query.granularityMessage}
        </Banner>
      )}
      {query.compareMessage && (
        <Banner variant="info" title={msg.panel.compareTitle}>
          {query.compareMessage}
        </Banner>
      )}
      {query.compareRange && <p className="-mt-2 text-xs text-muted-foreground">{msg.panel.compareRange(longRange(query.compareRange))}</p>}

      <section aria-label={msg.panel.sections.kpis} className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {kpis.map((w) => (
          <PanelWidgetSlot key={w.id} dashboardId={dashboard.id} queryKey={queryKey} widget={w} />
        ))}
      </section>

      <section aria-label={msg.panel.sections.charts} className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {charts.map((w) => (
          // O treemap e o Gantt precisam de largura: ocupam a linha inteira.
          <div key={w.id} className={w.type === "treemap" || w.type === "gantt" ? "grid min-w-0 xl:col-span-2" : "grid min-w-0"}>
            <PanelWidgetSlot dashboardId={dashboard.id} queryKey={queryKey} widget={w} />
          </div>
        ))}
      </section>

      <p className="text-xs text-muted-foreground">{msg.panel.footer(query.period.label, query.period.description)}</p>
    </PageBody>
  );
}
