import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PanelControls } from "@/components/charts/panel-controls";
import { PanelGrid } from "@/components/charts/panel-grid";
import { PanelTabs } from "@/components/charts/panel-tabs";
import { PanelWidgetSlot } from "@/components/charts/panel-widget";
import { Banner } from "@/components/ds/banner";
import { EmptyState } from "@/components/ds/empty-state";
import { DashboardRefresh } from "@/components/shell/dashboard-refresh";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PeriodFilter } from "@/components/shell/period-filter";
import { FilterBar } from "@/components/tracking/filter-bar";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/charts/messages";
import { PANEL_PRESETS } from "@/lib/charts/options";
import { TIMEZONES } from "@/lib/timezones";
import { requireUser } from "@/server/auth/session";
import { longRange } from "@/server/charts/time-buckets";
import { loadPanelConfig, loadPanelEditorData } from "@/server/data/panel-config";
import { panelQueryKey } from "@/server/data/panels";
import { getPanels } from "@/server/data/panels-request";
import { getFilterOptions, isStale, type SearchParams } from "@/server/data/tracking";

export const metadata: Metadata = { title: "Painéis" };

const PRESETS = PANEL_PRESETS.map((id) => ({ id, label: msg.periods[id] }));
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// S28 Painéis: os painéis salvos de cada dashboard, em abas. Cada painel tem os
// próprios gráficos numa grade de 12 colunas, os filtros com que abre e quem
// pode ver. O admin do workspace cria, edita (?editar=1: arrastar, redimensionar
// e o editor de gráfico) e apaga; o membro vê os liberados e, se o painel
// deixar, muda período e filtros só para a própria tela (no endereço).
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
  const config = loadPanelConfig({ user }, dashboardId, sp);
  const queryKey = panelQueryKey(config.params);
  const [panel, options] = await Promise.all([
    getPanels(dashboardId, queryKey),
    config.canFilter ? getFilterOptions({ user }, dashboardId) : Promise.resolve(null),
  ]);
  const { query, dashboard } = panel;
  const editorData = config.canEdit ? loadPanelEditorData({ user }, dashboardId) : null;
  const editing = config.canEdit && config.panel != null && one(sp.editar) === "1";
  const timezoneLabel = TIMEZONES.find(([value]) => value === dashboard.timezone)?.[1] ?? dashboard.timezone;

  const header = (
    <PageHeader
      title={msg.panel.title}
      help="paineis"
      description={dashboard.name}
      actions={
        <>
          {config.canFilter && <PeriodFilter period={query.period} presets={PRESETS} timezoneLabel={timezoneLabel} />}
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

  const tabs = (
    <PanelTabs
      dashboardId={dashboard.id}
      panels={config.panels}
      panel={config.panel}
      canEdit={config.canEdit}
      editing={editing}
      members={editorData?.members ?? []}
      params={config.params}
    />
  );

  if (!config.panel) {
    return (
      <PageBody>
        {header}
        {tabs}
        <EmptyState icon={LayoutDashboard} title={msg.panels.noPanels.title} description={msg.panels.noPanels.description} className="py-16" />
      </PageBody>
    );
  }

  const open = config.panel;
  // Cada gráfico renderizado no servidor, no próprio Suspense; a grade (cliente) só posiciona.
  const slots = Object.fromEntries(open.widgets.map((w) => [w.id, <PanelWidgetSlot key={w.id} dashboardId={dashboard.id} params={config.params} widget={w} />]));

  return (
    <PageBody>
      {header}
      {tabs}

      {config.requestedMissing && (
        <Banner variant="info" title={msg.panel.title}>
          {msg.panels.requestedMissing}
        </Banner>
      )}
      {open.invalid > 0 && (
        <Banner variant="info" title={open.name}>
          {msg.panels.invalidWidgets(open.invalid)}
        </Banner>
      )}

      {config.canFilter && options ? (
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
      ) : (
        <p className="text-sm text-muted-foreground">{msg.panels.filtersLocked(`${query.period.label}, ${query.period.description}`)}</p>
      )}

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

      <PanelGrid
        dashboardId={dashboard.id}
        panelId={open.id}
        editing={editing}
        canEdit={config.canEdit}
        layout={open.layout}
        widgets={open.widgets}
        slots={slots}
        params={config.params}
        editorData={editorData}
      />

      <p className="text-xs text-muted-foreground">{msg.panel.footer(query.period.label, query.period.description)}</p>
    </PageBody>
  );
}
