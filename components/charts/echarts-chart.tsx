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

/**
 * height: em pixels, ou "100%" para ocupar a célula da grade dos painéis.
 * onExport: recebe a função que tira a imagem do gráfico (PNG), para o menu "Exportar".
 */
export default function EChartsChart({
  spec,
  height,
  onExport,
}: {
  spec: PanelChartSpec;
  height: number | "100%";
  onExport?: (image: (() => string | null) | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const theme = useChartTheme();
  const themeRef = useRef(theme);
  const reducedMotion = useReducedMotion();
  const router = useRouter();

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

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
    // Acompanha a largura e a altura do card (menu lateral recolhido, celular, grade redimensionada).
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(el);
    // A imagem sai com o fundo do card (sem fundo, o PNG ficaria transparente).
    onExport?.(() => instance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: themeRef.current?.surface ?? "#ffffff" }));
    return () => {
      onExport?.(null);
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
    // onExport muda a cada render do pai; a função guardada continua valendo para esta instância.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!theme || !chart.current) return;
    chart.current.setOption(toEChartsOption(spec, theme, { reducedMotion }), { notMerge: true });
  }, [spec, theme, reducedMotion]);

  return <div ref={ref} className={height === "100%" ? "absolute inset-0" : "w-full"} style={height === "100%" ? undefined : { height }} />;
}
