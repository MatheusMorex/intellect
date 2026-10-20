// Dados de um gráfico em CSV ("Baixar dados"), com os mesmos números da
// tabela e da dica. Formato que o Excel em português abre sem ajuste:
// separador ";", vírgula decimal, sem separador de milhar, e o BOM do UTF-8
// para os acentos. Dinheiro vai em reais (não em centavos) e percentual em %
// (12,5 = 12,5%), com a unidade no nome da coluna.
// Função pura: os testes rodam com `npm test`.

import type { MetricFormat } from "@/lib/charts/catalog";
import { msg } from "@/lib/charts/messages";
import type { ChartSpec, FunnelSpec, GanttSpec, PanelChartSpec, PieSpec, TreemapNode, TreemapSpec } from "@/lib/charts/spec";

const BOM = "﻿";

/** Número sem unidade, com vírgula decimal: dinheiro em reais, percentual em %, multiplicador e contagem como estão. */
export function csvNumber(value: number | null | undefined, format: MetricFormat): string {
  if (value == null || !Number.isFinite(value)) return "";
  const shown = format === "money" ? value / 100 : format === "percent" ? value * 100 : value;
  const decimals = format === "number" ? (Number.isInteger(shown) ? 0 : 2) : format === "multiplier" ? 4 : 2;
  return shown.toFixed(decimals).replace(".", ",");
}

/** Nome da coluna com a unidade: "Faturamento líquido (R$)", "CTR (%)", "ROAS (x)". */
export function csvHeader(name: string, format: MetricFormat, currency = "BRL"): string {
  const unit = format === "money" ? (currency === "BRL" ? "R$" : currency) : format === "percent" ? "%" : format === "multiplier" ? "x" : "";
  return unit ? `${name} (${unit})` : name;
}

/** Campo com ; aspas ou quebra de linha vai entre aspas (aspas dentro viram duas). */
export function csvField(value: string): string {
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const toCsv = (rows: string[][]) => BOM + rows.map((row) => row.map(csvField).join(";")).join("\r\n") + "\r\n";

function axisRows(spec: ChartSpec): string[][] {
  const withCompare = spec.compareName != null && spec.series.some((s) => s.compare);
  const header = [spec.axis === "time" ? msg.panel.table.time : msg.panel.table.category];
  for (const s of spec.series) {
    if (spec.stack === "percent" && s.absolute) header.push(csvHeader(`${s.name} ${msg.panel.pie.tableShare}`, "percent"), csvHeader(s.name, s.format, spec.currency));
    else header.push(csvHeader(s.name, s.format, spec.currency));
    if (withCompare && s.compare) header.push(csvHeader(`${s.name} (${spec.compareName})`, s.format, spec.currency));
  }
  const rows = spec.categories.map((c, i) => {
    const row = [c.partial ? `${c.longLabel} (${msg.partial.label.toLowerCase()})` : c.longLabel];
    for (const s of spec.series) {
      if (spec.stack === "percent" && s.absolute) row.push(csvNumber(s.values[i], "percent"), csvNumber(s.absolute[i], s.format));
      else row.push(csvNumber(s.values[i], s.format));
      if (withCompare && s.compare) row.push(csvNumber(s.compare.values[i], s.format));
    }
    return row;
  });
  return [header, ...rows];
}

function pieRows(spec: PieSpec): string[][] {
  const header = [msg.panel.table.category, csvHeader(spec.metric.name, spec.metric.format, spec.currency), csvHeader(msg.panel.pie.tableShare, "percent")];
  const rows = spec.slices.map((s) => [s.label, csvNumber(s.value, spec.metric.format), csvNumber(s.share, "percent")]);
  return [header, ...rows, [msg.panel.pie.total, csvNumber(spec.total, spec.metric.format), csvNumber(1, "percent")]];
}

function treemapRows(spec: TreemapSpec): string[][] {
  const header = [
    ...spec.levels,
    csvHeader(spec.size.name, spec.size.format, spec.currency),
    csvHeader(msg.panel.pie.tableShare, "percent"),
    ...(spec.color ? [csvHeader(spec.color.name, spec.color.format, spec.currency)] : []),
  ];
  const rows: string[][] = [];
  const walk = (nodes: TreemapNode[]) =>
    nodes.forEach((n) => {
      // Uma coluna por nível: a linha da campanha tem a plataforma e a campanha; a do anúncio, os três.
      const path = spec.levels.map((_, i) => n.path[i] ?? "");
      rows.push([...path, csvNumber(n.size, spec.size.format), csvNumber(n.share, "percent"), ...(spec.color ? [csvNumber(n.color, spec.color.format)] : [])]);
      walk(n.children);
    });
  walk(spec.nodes);
  return [header, ...rows];
}

function funnelRows(spec: FunnelSpec): string[][] {
  const header = [msg.panel.funnel.tableStep, msg.panel.funnel.tableCount, csvHeader(msg.panel.funnel.tablePrevious, "percent"), csvHeader(msg.panel.funnel.tableTop, "percent")];
  const rows = spec.steps.map((s) => [s.label, csvNumber(s.value, "number"), csvNumber(s.fromPrevious, "percent"), csvNumber(s.fromTop, "percent")]);
  return [header, ...rows];
}

/** Data e hora no fuso do dashboard, no formato que o Excel entende (dd/mm/aaaa hh:mm). */
function csvDate(ms: number | null, timezone: string): string {
  if (ms == null) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .format(new Date(ms))
    .replace(",", "");
}

function ganttRows(spec: GanttSpec): string[][] {
  const g = msg.panel.gantt;
  const header = [g.tableTask, g.tableBoard, g.tableList, g.people, g.tableStart, g.tableDue, csvHeader(g.tableDone, "percent"), g.tableStatus];
  const rows = spec.groups.flatMap((group) =>
    group.tasks.map((t) => [
      t.label,
      t.board,
      t.list,
      t.people,
      csvDate(t.start, spec.timezone),
      csvDate(t.end, spec.timezone),
      csvNumber(t.progress, "percent"),
      t.done ? g.done : t.overdue ? g.overdue : g.onTime,
    ]),
  );
  return [header, ...rows];
}

/** O CSV de qualquer gráfico dos Painéis. */
export function specToCsv(spec: PanelChartSpec): string {
  switch (spec.kind) {
    case "pie":
      return toCsv(pieRows(spec));
    case "treemap":
      return toCsv(treemapRows(spec));
    case "funnel":
      return toCsv(funnelRows(spec));
    case "gantt":
      return toCsv(ganttRows(spec));
    default:
      return toCsv(axisRows(spec));
  }
}

/** Nome de arquivo seguro: "Faturamento líquido e ROAS - Últimos 30 dias.csv". */
export function exportFileName(title: string, extension: "csv" | "png"): string {
  const clean = title
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return `${clean || "grafico"}.${extension}`;
}
