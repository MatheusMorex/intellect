import { Suspense } from "react";

import { ChartFrame } from "@/components/charts/chart-frame";
import { PanelKpi } from "@/components/charts/panel-kpi";
import { WidgetErrorBoundary } from "@/components/charts/widget-error";
import { KpiCard } from "@/components/ds/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { msg } from "@/lib/charts/messages";
import { scopeNote } from "@/lib/charts/editor";
import { widgetTitle, type PanelWidget } from "@/lib/charts/widgets";
import { OUTLINE_BOX } from "@/lib/surfaces";
import { cn } from "@/lib/utils";
import { renderWidget } from "@/server/charts/render";
import { widgetParams } from "@/server/data/panel-config";
import { panelQueryKey } from "@/server/data/panels";
import { getPanels } from "@/server/data/panels-request";

// Um widget dos Painéis. Cada um carrega no próprio Suspense (um gráfico lento
// não segura os outros) e tem o próprio tratamento de erro, com "Tentar de novo".
// O gráfico com período ou filtros próprios faz as contas com eles (e avisa).

async function WidgetContent({ dashboardId, params, widget }: { dashboardId: string; params: Record<string, string>; widget: PanelWidget }) {
  const { computer } = await getPanels(dashboardId, panelQueryKey(widgetParams(params, widget)));
  const rendered = renderWidget(computer, widget);
  if (rendered.kind === "kpi") {
    return (
      <div className="h-full [&>*]:h-full">
        <PanelKpi view={rendered.view} />
      </div>
    );
  }
  return <ChartFrame spec={rendered.spec} title={rendered.title} subtitle={rendered.subtitle || undefined} help={rendered.help} scope={scopeNote(widget)} fill />;
}

function WidgetSkeleton({ widget }: { widget: PanelWidget }) {
  if (widget.type === "kpi") {
    return (
      <div className="h-full [&>*]:h-full">
        <KpiCard label={widgetTitle(widget)} state="loading" />
      </div>
    );
  }
  return (
    <div className={cn("flex h-full flex-col gap-3 p-4", OUTLINE_BOX)} aria-busy="true">
      <span className="sr-only">{msg.panel.loading}</span>
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="w-full flex-1 rounded-md" />
    </div>
  );
}

export function PanelWidgetSlot({ dashboardId, params, widget }: { dashboardId: string; params: Record<string, string>; widget: PanelWidget }) {
  return (
    <WidgetErrorBoundary title={widgetTitle(widget)}>
      <Suspense fallback={<WidgetSkeleton widget={widget} />}>
        <WidgetContent dashboardId={dashboardId} params={params} widget={widget} />
      </Suspense>
    </WidgetErrorBoundary>
  );
}
