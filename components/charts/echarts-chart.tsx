"use client";

import { BarChart, LineChart } from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

import type { ChartSpec } from "@/lib/charts/spec";
import { useReducedMotion } from "@/lib/use-reduced-motion";

import { toEChartsOption } from "./echarts-option";
import { useChartTheme } from "./use-chart-theme";

// Desenha um gráfico com o ECharts. Só as partes usadas entram no pacote
// (import modular de echarts/core), e este arquivo só é baixado na tela de
// Painéis (components/charts/chart-frame.tsx carrega ele sob demanda).

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  AriaComponent,
  CanvasRenderer,
]);

export default function EChartsChart({ spec, height }: { spec: ChartSpec; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const theme = useChartTheme();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const instance = echarts.init(el, null, { renderer: "canvas" });
    chart.current = instance;
    // Acompanha a largura do card (menu lateral recolhido, celular, grade).
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (!theme || !chart.current) return;
    chart.current.setOption(toEChartsOption(spec, theme, { reducedMotion }), { notMerge: true });
  }, [spec, theme, reducedMotion]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
