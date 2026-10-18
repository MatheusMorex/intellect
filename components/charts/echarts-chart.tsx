"use client";

import { BarChart, CustomChart, FunnelChart, LineChart, PieChart, TreemapChart } from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { LabelLayout } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import type { PanelChartSpec } from "@/lib/charts/spec";
import { useReducedMotion } from "@/lib/use-reduced-motion";

import { toEChartsOption } from "./echarts-option";
import { useChartTheme } from "./use-chart-theme";

// Desenha um gráfico com o ECharts. Só as partes usadas entram no pacote
// (import modular de echarts/core), e este arquivo só é baixado na tela de
// Painéis (components/charts/chart-frame.tsx carrega ele sob demanda).

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  TreemapChart,
  FunnelChart,
  CustomChart,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  AriaComponent,
  // labelLayout das séries (rótulos do funil numa coluna, rótulos que se cobrem somem nas colunas):
  // sem isto o ECharts ignora a opção em silêncio.
  LabelLayout,
  CanvasRenderer,
]);

export default function EChartsChart({ spec, height }: { spec: PanelChartSpec; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const theme = useChartTheme();
  const reducedMotion = useReducedMotion();
  const router = useRouter();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const instance = echarts.init(el, null, { renderer: "canvas" });
    chart.current = instance;
    // Item com link (a tarefa do Gantt): o clique abre o card.
    instance.on("click", (params) => {
      const href = (params.data as { href?: unknown } | undefined)?.href;
      if (typeof href === "string" && href.startsWith("/")) router.push(href);
    });
    // Acompanha a largura do card (menu lateral recolhido, celular, grade).
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, [router]);

  useEffect(() => {
    if (!theme || !chart.current) return;
    chart.current.setOption(toEChartsOption(spec, theme, { reducedMotion }), { notMerge: true });
  }, [spec, theme, reducedMotion]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
