"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

// Gráfico (components.md): Recharts com as cores chart-1 a chart-8 dos tokens.
// Cada chave do config vira --color-<chave> dentro do gráfico.

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart precisa estar dentro de <ChartContainer />");
  return context;
}

function ChartContainer({
  className,
  children,
  config,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  const colors = Object.fromEntries(
    Object.entries(config)
      .filter(([, item]) => item.color)
      .map(([key, item]) => [`--color-${key}`, item.color]),
  );

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        style={{ ...colors, ...style } as React.CSSProperties}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipItem = {
  name?: string | number;
  value?: number | string | (number | string)[];
  dataKey?: string | number;
  color?: string;
  payload?: Record<string, unknown>;
};

function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  nameKey,
  formatter,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: React.ReactNode;
  hideLabel?: boolean;
  nameKey?: string;
  formatter?: (value: number | string) => React.ReactNode;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  return (
    <div className="grid min-w-32 gap-1.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-pop">
      {!hideLabel && label != null && <div className="font-semibold">{label}</div>}
      {payload.map((item, index) => {
        const key = String((nameKey && item.payload?.[nameKey]) ?? item.dataKey ?? item.name ?? index);
        const entry = config[key];
        const raw = Array.isArray(item.value) ? item.value.join(" – ") : (item.value ?? "");
        return (
          <div key={key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: entry?.color ?? item.color }}
            />
            <span className="text-muted-foreground">{entry?.label ?? item.name}</span>
            <span className="ml-auto font-semibold tabular">{formatter ? formatter(raw) : raw}</span>
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };
