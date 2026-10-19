"use client";

import { BarChart3, Download, Info } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { HelpTip } from "@/components/ds/help-tip";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportFileName, specToCsv } from "@/lib/charts/csv";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatChange, formatMetricValue } from "@/lib/charts/format";
import { msg } from "@/lib/charts/messages";
import type { ChartHelp, ChartSpec, FunnelSpec, GanttSpec, PanelChartSpec, PieSpec, SpecCompare, TreemapNode, TreemapSpec } from "@/lib/charts/spec";
import { OUTLINE_BOX } from "@/lib/surfaces";
import { cn } from "@/lib/utils";

import { colorScale } from "./color-scale";
import { GANTT_ROW, GANTT_SPAN, ganttDate, ganttMark, ganttRows, ganttStatus, seriesColor } from "./echarts-option";
import { useChartTheme } from "./use-chart-theme";

// Moldura de um gráfico dos Painéis: título, "?" com a dica de quando usar
// aquele tipo de gráfico e a fórmula de cada métrica, o gráfico (ECharts,
// baixado só aqui) e "Ver como tabela" com os mesmos números, formatados pela
// mesma função dos cartões.

const EChartsChart = dynamic(() => import("@/components/charts/echarts-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-md" />,
});

export type { ChartHelp } from "@/lib/charts/spec";

/** Altura do gráfico: fixa nos de tempo, na pizza e no treemap; nas barras, cresce com o número de itens. */
export function chartHeight(spec: PanelChartSpec) {
  if (spec.kind === "pie") return 300;
  if (spec.kind === "treemap") return 380;
  if (spec.kind === "funnel") return Math.max(240, spec.steps.length * 60 + 16);
  if (spec.kind === "gantt") {
    const rows = spec.groups.reduce((n, g) => n + 1 + g.tasks.length, 0);
    const zoom = spec.to - spec.from > GANTT_SPAN[spec.scale];
    return Math.max(160, rows * GANTT_ROW + 36 + (zoom ? 36 : 0));
  }
  if (spec.axis === "time") return 300;
  const perItem = 14 + spec.series.length * 16;
  return Math.max(160, spec.categories.length * perItem + 48);
}

function AxisTable({ spec }: { spec: ChartSpec }) {
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

/** Valor de antes e a variação, em cinza (a mesma informação da dica). */
function CompareCell({ compare, format, currency }: { compare: SpecCompare | null; format: Parameters<typeof formatMetricValue>[1]; currency: string }) {
  if (!compare) return null;
  return (
    <TableCell className="text-right text-xs text-muted-foreground">
      {formatMetricValue(compare.value, format, { currency })}
      {compare.change.kind !== "none" && ` · ${formatChange(compare.change)}`}
    </TableCell>
  );
}

function PieTable({ spec }: { spec: PieSpec }) {
  const fmt = (value: number | null) => formatMetricValue(value, spec.metric.format, { currency: spec.currency });
  const share = (value: number) => formatMetricValue(value, "percent", { currency: spec.currency });
  const withCompare = spec.compareName != null && spec.compareTotal != null;
  return (
    <div className="max-h-96 overflow-auto rounded-md">
      <Table className="tabular">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{msg.panel.table.category}</TableHead>
            <TableHead className="text-right">{spec.metric.name}</TableHead>
            <TableHead className="text-right">{msg.panel.pie.tableShare}</TableHead>
            {withCompare && <TableHead className="text-right">{spec.compareName}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {spec.slices.map((slice) => (
            <TableRow key={slice.key}>
              <TableCell className="max-w-64 truncate" title={slice.label}>
                {slice.label}
              </TableCell>
              <TableCell className="text-right">{fmt(slice.value)}</TableCell>
              <TableCell className="text-right">{share(slice.share)}</TableCell>
              {withCompare && <CompareCell compare={slice.compare} format={spec.metric.format} currency={spec.currency} />}
            </TableRow>
          ))}
          <TableRow className="font-semibold hover:bg-transparent">
            <TableCell>{msg.panel.pie.total}</TableCell>
            <TableCell className="text-right">{fmt(spec.total)}</TableCell>
            <TableCell className="text-right">{share(1)}</TableCell>
            {withCompare && <CompareCell compare={spec.compareTotal} format={spec.metric.format} currency={spec.currency} />}
          </TableRow>
        </TableBody>
      </Table>
      {withCompare && <p className="px-2 pt-2 text-xs text-muted-foreground">{msg.panel.table.compareNote(spec.compareName!)}</p>}
    </div>
  );
}

/** O treemap em tabela: cada nível com recuo, na mesma ordem dos retângulos. */
function TreemapTable({ spec }: { spec: TreemapSpec }) {
  const fmt = (value: number | null, format: Parameters<typeof formatMetricValue>[1]) => formatMetricValue(value, format, { currency: spec.currency });
  const withCompare = spec.compareName != null && spec.nodes.some((n) => n.compare);
  const rows: { node: TreemapNode; depth: number }[] = [];
  const walk = (nodes: TreemapNode[], depth: number) => nodes.forEach((node) => (rows.push({ node, depth }), walk(node.children, depth + 1)));
  walk(spec.nodes, 0);
  return (
    <div className="max-h-96 overflow-auto rounded-md">
      <Table className="tabular">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{spec.levels.join(" › ")}</TableHead>
            <TableHead className="text-right">{spec.size.name}</TableHead>
            <TableHead className="text-right">{msg.panel.pie.tableShare}</TableHead>
            {withCompare && <TableHead className="text-right">{spec.compareName}</TableHead>}
            {spec.color && <TableHead className="text-right">{spec.color.name}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ node, depth }) => (
            <TableRow key={node.key} className={depth === 0 ? "font-semibold" : undefined}>
              <TableCell className="max-w-72 truncate" title={node.path.join(" › ")} style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}>
                {node.label}
              </TableCell>
              <TableCell className="text-right">{fmt(node.size, spec.size.format)}</TableCell>
              <TableCell className="text-right">{fmt(node.share, "percent")}</TableCell>
              {withCompare && <CompareCell compare={node.compare?.size ?? null} format={spec.size.format} currency={spec.currency} />}
              {spec.color && <TableCell className="text-right">{fmt(node.color, spec.color.format)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {withCompare && <p className="px-2 pt-2 text-xs text-muted-foreground">{msg.panel.table.compareNote(spec.compareName!)}</p>}
    </div>
  );
}

function FunnelTable({ spec }: { spec: FunnelSpec }) {
  const count = (value: number | null) => formatMetricValue(value, "number", { currency: spec.currency });
  const pct = (value: number | null) => (value == null ? "" : formatMetricValue(value, "percent", { currency: spec.currency }));
  const withCompare = spec.compareName != null && spec.steps.some((s) => s.compare);
  return (
    <div className="max-h-96 overflow-auto rounded-md">
      <Table className="tabular">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{msg.panel.funnel.tableStep}</TableHead>
            <TableHead className="text-right">{msg.panel.funnel.tableCount}</TableHead>
            <TableHead className="text-right">{msg.panel.funnel.tablePrevious}</TableHead>
            <TableHead className="text-right">{msg.panel.funnel.tableTop}</TableHead>
            {withCompare && <TableHead className="text-right">{spec.compareName}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {spec.steps.map((step) => (
            <TableRow key={step.key} className={step.biggestLoss ? "font-semibold" : undefined}>
              <TableCell>
                {step.label}
                {step.biggestLoss && <span className="ml-2 text-xs text-danger">▼ {msg.panel.funnel.biggestLoss}</span>}
              </TableCell>
              <TableCell className="text-right">{count(step.value)}</TableCell>
              <TableCell className="text-right">{pct(step.fromPrevious)}</TableCell>
              <TableCell className="text-right">{pct(step.fromTop)}</TableCell>
              {withCompare && (
                <CompareCell compare={step.compare} format="number" currency={spec.currency} />
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {withCompare && <p className="px-2 pt-2 text-xs text-muted-foreground">{msg.panel.table.compareNote(spec.compareName!)}</p>}
    </div>
  );
}

function GanttTable({ spec }: { spec: GanttSpec }) {
  const date = (ms: number | null) => (ms == null ? "" : ganttDate(ms, spec.timezone, "long"));
  const pct = (value: number) => formatMetricValue(value, "percent", { currency: "BRL", decimals: 0 });
  return (
    <div className="max-h-96 overflow-auto rounded-md">
      <Table className="tabular">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{msg.panel.gantt.tableTask}</TableHead>
            <TableHead>{msg.panel.gantt.people}</TableHead>
            <TableHead>{msg.panel.gantt.tableStart}</TableHead>
            <TableHead>{msg.panel.gantt.tableDue}</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead>{msg.panel.gantt.tableStatus}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ganttRows(spec).map((row, i) =>
            row.kind === "group" ? (
              <TableRow key={`g-${i}`} className="hover:bg-transparent">
                <TableCell colSpan={6} className="font-semibold">
                  {row.label}
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={row.task.key}>
                <TableCell className="max-w-72 truncate pl-5" title={row.task.label}>
                  <Link href={row.task.href} className="hover:underline">
                    {row.task.label}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">{row.task.people}</TableCell>
                <TableCell className="whitespace-nowrap">{date(row.task.start)}</TableCell>
                <TableCell className="whitespace-nowrap">{date(row.task.end)}</TableCell>
                <TableCell className="text-right">{pct(row.task.progress)}</TableCell>
                <TableCell className={cn("whitespace-nowrap", row.task.overdue && "font-semibold text-danger")}>
                  {ganttMark(row.task)}
                  {ganttStatus(row.task)}
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ChartTable({ spec }: { spec: PanelChartSpec }) {
  if (spec.kind === "pie") return <PieTable spec={spec} />;
  if (spec.kind === "treemap") return <TreemapTable spec={spec} />;
  if (spec.kind === "funnel") return <FunnelTable spec={spec} />;
  if (spec.kind === "gantt") return <GanttTable spec={spec} />;
  return <AxisTable spec={spec} />;
}

/** Legenda do Gantt: o que cada cor é, e as marcas de barra, marco, atraso e concluída. */
function GanttLegend({ spec }: { spec: GanttSpec }) {
  const theme = useChartTheme();
  if (!theme) return null;
  const color = (index: number | null) => (index == null ? theme.muted : seriesColor(index, theme, spec.display));
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{spec.legendTitle}</span>
        {spec.legend.map((item) => (
          <span key={`${item.color}-${item.label}`} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-sm" style={{ background: color(item.color) }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>▬ {msg.panel.gantt.tableStart} → {msg.panel.gantt.tableDue.toLowerCase()}</span>
        <span>◆ {msg.panel.gantt.milestone}</span>
        <span>⚠ {msg.panel.gantt.overdue}</span>
        <span>✓ {msg.panel.gantt.done}</span>
      </div>
    </div>
  );
}

/** Título e texto do estado vazio, pelo motivo. */
function emptyText(spec: PanelChartSpec) {
  if (spec.emptyReason === "daily-only") return msg.panel.emptyDailyOnly;
  if (spec.emptyReason === "no-board") return msg.panel.emptyNoBoard;
  if (spec.emptyReason === "no-tasks") return msg.panel.emptyNoTasks;
  return msg.panel.empty;
}

/** Legenda da cor do treemap: a escala, do menor ao maior valor do gráfico. */
function ColorLegend({ spec }: { spec: TreemapSpec }) {
  const theme = useChartTheme();
  const color = spec.color;
  if (!color || !theme) return null;
  const scale = colorScale(theme, color.direction);
  const gradient = `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => scale(t)).join(", ")})`;
  const fmt = (value: number) => formatMetricValue(value, color.format, { currency: spec.currency });
  const hasMissing = (function missing(nodes: TreemapNode[]): boolean {
    return nodes.some((n) => n.color == null || missing(n.children));
  })(spec.nodes);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>{msg.panel.treemap.color(color.name)}</span>
      <span className="flex items-center gap-1.5 tabular-nums">
        {fmt(color.min)}
        <span aria-hidden="true" className="h-2 w-24 rounded-full" style={{ background: gradient }} />
        {fmt(color.max)}
      </span>
      <span className="tabular-nums">({msg.panel.treemap.middle(fmt(color.mid))})</span>
      {hasMissing && (
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ background: theme.muted }} />
          {msg.panel.treemap.noColor}
        </span>
      )}
    </div>
  );
}

/** Baixa um arquivo no navegador (imagem do gráfico ou CSV dos dados). */
function download(name: string, href: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** "Exportar": a imagem do gráfico (PNG) e os dados (CSV), com os mesmos números da tabela. */
function ExportMenu({ spec, title, image }: { spec: PanelChartSpec; title: string; image: (() => string | null) | null }) {
  const csv = () => {
    const url = URL.createObjectURL(new Blob([specToCsv(spec)], { type: "text/csv;charset=utf-8" }));
    download(exportFileName(title, "csv"), url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const png = () => {
    const url = image?.();
    if (url) download(exportFileName(title, "png"), url);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={msg.panels.export.menu}>
          <Download aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only">{msg.panels.export.menu}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={png} disabled={!image}>
          {image ? msg.panels.export.png : msg.panels.export.pngNeedsChart}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={csv}>{msg.panels.export.csv}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * fill: o gráfico ocupa a altura da célula da grade (painéis salvos); sem ele,
 * a altura sai do tipo de gráfico (pré-visualização do editor).
 * scope: aviso de que o gráfico usa período ou filtros diferentes dos do painel.
 */
export function ChartFrame({
  spec,
  title,
  subtitle,
  help,
  scope,
  fill = false,
}: {
  spec: PanelChartSpec;
  title: string;
  subtitle?: string;
  help: ChartHelp;
  scope?: string;
  fill?: boolean;
}) {
  const [asTable, setAsTable] = useState(false);
  const [image, setImage] = useState<(() => string | null) | null>(null);
  const imageRef = useRef<(() => string | null) | null>(null);
  const type = msg.widgetType[help.type];
  const height = chartHeight(spec);
  const onExport = (fn: (() => string | null) | null) => {
    if (imageRef.current === fn) return;
    imageRef.current = fn;
    setImage(() => fn);
  };

  return (
    <figure
      className={cn(
        "min-w-0 gap-3 p-4 text-foreground",
        fill ? "flex h-full min-h-0 flex-col overflow-hidden" : "grid content-start",
        OUTLINE_BOX,
      )}
    >
      <figcaption className="flex shrink-0 items-start justify-between gap-2">
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
          {scope && <p className="text-xs font-medium text-primary">{scope}</p>}
        </div>
        {!spec.empty && (
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
              {asTable ? msg.panel.table.hide : msg.panel.table.show}
            </Button>
            <ExportMenu spec={spec} title={title} image={asTable ? null : image} />
          </div>
        )}
      </figcaption>

      {spec.empty ? (
        <EmptyState
          icon={BarChart3}
          title={emptyText(spec).title}
          description={emptyText(spec).description}
          className={fill ? "min-h-0 flex-1 py-4" : "py-8"}
        />
      ) : asTable ? (
        <div className={fill ? "min-h-0 flex-1 overflow-auto [&>div]:max-h-none" : undefined}>
          <ChartTable spec={spec} />
        </div>
      ) : fill ? (
        // O gráfico é desenho; os números ficam na tabela e na dica (leitor de tela usa "Ver como tabela").
        <div aria-hidden="true" className="relative min-h-[120px] flex-1">
          <EChartsChart spec={spec} height="100%" onExport={onExport} />
        </div>
      ) : (
        <div aria-hidden="true" style={{ height }}>
          <EChartsChart spec={spec} height={height} onExport={onExport} />
        </div>
      )}

      {spec.kind === "treemap" && !spec.empty && !asTable && <ColorLegend spec={spec} />}
      {spec.kind === "gantt" && !spec.empty && !asTable && <GanttLegend spec={spec} />}
      {spec.kind === "funnel" && spec.board && (
        <Link href={spec.board.href} className="w-fit text-xs font-medium text-primary hover:underline">
          {msg.panel.funnel.openBoard} “{spec.board.name}”
        </Link>
      )}

      {spec.notes.length > 0 && (
        <ul className="grid shrink-0 gap-1 text-xs text-muted-foreground">
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
