// Um widget pronto para a tela: o cartão de KPI ou o gráfico, já no formato
// próprio (lib/charts/spec.ts). A página dos Painéis e a pré-visualização do
// editor usam esta mesma função, então o que o editor mostra é o que o painel
// vai mostrar.

import { getMetric } from "@/lib/charts/catalog";
import type { ChartHelp, PanelChartSpec } from "@/lib/charts/spec";
import { widgetMetrics, widgetTitle, type PanelWidget } from "@/lib/charts/widgets";
import {
  buildBarChart,
  buildFunnel,
  buildGantt,
  buildKpi,
  buildPieChart,
  buildTimeChart,
  buildTreemap,
  type KpiView,
  type PanelComputer,
} from "@/server/charts/build";

export type RenderedWidget =
  | { kind: "kpi"; view: KpiView }
  | { kind: "chart"; spec: PanelChartSpec; title: string; subtitle: string; help: ChartHelp };

export function renderWidget(pc: PanelComputer, widget: PanelWidget): RenderedWidget {
  if (widget.type === "kpi") {
    return { kind: "kpi", view: { ...buildKpi(pc, widget), display: { numbers: widget.display.numbers, decimals: widget.display.decimals } } };
  }
  const spec =
    widget.type === "bar"
      ? buildBarChart(pc, widget)
      : widget.type === "pie" || widget.type === "donut"
        ? buildPieChart(pc, widget)
        : widget.type === "treemap"
          ? buildTreemap(pc, widget)
          : widget.type === "funnel"
            ? buildFunnel(pc, widget)
            : widget.type === "gantt"
              ? buildGantt(pc, widget)
              : buildTimeChart(pc, widget);
  return {
    kind: "chart",
    spec: { ...spec, display: widget.display },
    title: widgetTitle(widget),
    subtitle: widget.subtitle,
    help: {
      type: widget.type,
      metrics: widgetMetrics(widget).map((id) => ({ label: getMetric(id).info.label, formula: getMetric(id).info.formula })),
    },
  };
}
