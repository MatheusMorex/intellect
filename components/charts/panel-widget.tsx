import { Suspense } from "react";

import { ChartFrame } from "@/components/charts/chart-frame";
import { PanelKpi } from "@/components/charts/panel-kpi";
import { WidgetErrorBoundary } from "@/components/charts/widget-error";
import { KpiCard } from "@/components/ds/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMetric } from "@/lib/charts/catalog";
import { msg } from "@/lib/charts/messages";
import { widgetMetrics, widgetTitle, type PanelWidget } from "@/lib/charts/widgets";
import { OUTLINE_BOX } from "@/lib/surfaces";
import { cn } from "@/lib/utils";
import { buildBarChart, buildKpi, buildTimeChart } from "@/server/charts/build";
import { getPanels } from "@/server/data/panels-request";

// Um widget dos Painéis. Cada um carrega no próprio Suspense (um gráfico lento
// não segura os outros) e tem o próprio tratamento de erro, com "Tentar de novo".

async function WidgetContent({ dashboardId, queryKey, widget }: { dashboardId: string; queryKey: string; widget: PanelWidget }) {
  const { computer } = await getPanels(dashboardId, queryKey);
  if (widget.type === "kpi") return <PanelKpi view={buildKpi(computer, widget)} />;
  const spec = widget.type === "bar" ? buildBarChart(computer, widget) : buildTimeChart(computer, widget);
  return (
    <ChartFrame
      spec={spec}
      title={widgetTitle(widget)}
      subtitle={widget.subtitle || undefined}
      help={{
        type: widget.type,
        metrics: widgetMetrics(widget).map((id) => ({ label: getMetric(id).info.label, formula: getMetric(id).info.formula })),
      }}
    />
  );
}

function WidgetSkeleton({ widget }: { widget: PanelWidget }) {
  if (widget.type === "kpi") return <KpiCard label={widgetTitle(widget)} state="loading" />;
  return (
    <div className={cn("grid gap-3 p-4", OUTLINE_BOX)} aria-busy="true">
      <span className="sr-only">{msg.panel.loading}</span>
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-[300px] w-full rounded-md" />
    </div>
  );
}

export function PanelWidgetSlot({ dashboardId, queryKey, widget }: { dashboardId: string; queryKey: string; widget: PanelWidget }) {
  return (
    <WidgetErrorBoundary title={widgetTitle(widget)}>
      <Suspense fallback={<WidgetSkeleton widget={widget} />}>
        <WidgetContent dashboardId={dashboardId} queryKey={queryKey} widget={widget} />
      </Suspense>
    </WidgetErrorBoundary>
  );
}
