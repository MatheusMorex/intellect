"use client";

import { BarChart3, Info } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { HelpTip } from "@/components/ds/help-tip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatChange, formatMetricValue } from "@/lib/charts/format";
import { msg } from "@/lib/charts/messages";
import type { ChartSpec } from "@/lib/charts/spec";
import type { WidgetType } from "@/lib/charts/widgets";
import { OUTLINE_BOX } from "@/lib/surfaces";
import { cn } from "@/lib/utils";

// Moldura de um gráfico dos Painéis: título, "?" com a dica de quando usar
// aquele tipo de gráfico e a fórmula de cada métrica, o gráfico (ECharts,
// baixado só aqui) e "Ver como tabela" com os mesmos números, formatados pela
// mesma função dos cartões.

const EChartsChart = dynamic(() => import("@/components/charts/echarts-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-md" />,
});

export type ChartHelp = { type: WidgetType; metrics: { label: string; formula: string }[] };

/** Altura do gráfico: fixa nos de tempo; nas barras, cresce com o número de itens. */
export function chartHeight(spec: ChartSpec) {
  if (spec.axis === "time") return 300;
  const perItem = 14 + spec.series.length * 16;
  return Math.max(160, spec.categories.length * perItem + 48);
}

function ChartTable({ spec }: { spec: ChartSpec }) {
  const fmt = (value: number | null | undefined, format: Parameters<typeof formatMetricValue>[1]) =>
    formatMetricValue(value, format, { currency: spec.currency });
  const withCompare = spec.compareName != null && spec.series.some((s) => s.compare);
  return (
    <div className="max-h-96 overflow-auto rounded-md">
      <Table className="tabular">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{spec.axis === "time" ? msg.panel.table.time : msg.panel.table.category}</TableHead>
            {spec.series.map((s) => (
              <TableHead key={s.id} className="text-right" colSpan={withCompare && s.compare ? 2 : 1}>
                {s.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {spec.categories.map((c, i) => (
            <TableRow key={c.key}>
              <TableCell className="max-w-64 truncate" title={c.longLabel}>
                {c.label}
                {c.partial && <span className="ml-1 text-xs text-muted-foreground">({msg.partial.label.toLowerCase()})</span>}
              </TableCell>
              {spec.series.map((s) => {
                const value =
                  spec.stack === "percent" && s.absolute
                    ? `${fmt(s.values[i], "percent")} (${fmt(s.absolute[i], s.format)})`
                    : fmt(s.values[i], s.format);
                return [
                  <TableCell key={s.id} className="text-right">
                    {value}
                  </TableCell>,
                  withCompare && s.compare ? (
                    <TableCell key={`${s.id}-compare`} className="text-right text-xs text-muted-foreground">
                      {fmt(s.compare.values[i], s.format)}
                      {s.compare.changes[i].kind !== "none" && ` · ${formatChange(s.compare.changes[i])}`}
                    </TableCell>
                  ) : null,
                ];
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {withCompare && <p className="px-2 pt-2 text-xs text-muted-foreground">{msg.panel.table.compareNote(spec.compareName!)}</p>}
    </div>
  );
}

export function ChartFrame({ spec, title, subtitle, help }: { spec: ChartSpec; title: string; subtitle?: string; help: ChartHelp }) {
  const [asTable, setAsTable] = useState(false);
  const type = msg.widgetType[help.type];
  const height = chartHeight(spec);

  return (
    <figure className={cn("grid min-w-0 content-start gap-3 p-4 text-foreground", OUTLINE_BOX)}>
      <figcaption className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-semibold">{title}</span>
            <HelpTip title={type.label} className="size-5">
              <p>
                <span className="font-semibold text-foreground">Quando usar:</span> {type.whenToUse}
              </p>
              {help.metrics.map((m) => (
                <p key={m.label}>
                  <span className="font-semibold text-foreground">{m.label}:</span> {m.formula}.
                </p>
              ))}
            </HelpTip>
          </div>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {!spec.empty && (
          <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? msg.panel.table.hide : msg.panel.table.show}
          </Button>
        )}
      </figcaption>

      {spec.empty ? (
        <EmptyState
          icon={BarChart3}
          title={spec.emptyReason === "daily-only" ? msg.panel.emptyDailyOnly.title : msg.panel.empty.title}
          description={spec.emptyReason === "daily-only" ? msg.panel.emptyDailyOnly.description : msg.panel.empty.description}
          className="py-8"
        />
      ) : asTable ? (
        <ChartTable spec={spec} />
      ) : (
        // O gráfico é desenho; os números ficam na tabela e na dica (leitor de tela usa "Ver como tabela").
        <div aria-hidden="true" style={{ height }}>
          <EChartsChart spec={spec} height={height} />
        </div>
      )}

      {spec.notes.length > 0 && (
        <ul className="grid gap-1 text-xs text-muted-foreground">
          {spec.notes.map((n) => (
            <li key={n} className="flex items-start gap-1.5">
              <Info aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
              {n}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
