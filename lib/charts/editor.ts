// Funções do editor de gráfico (Fase 5), sem tela: trocar o tipo sem perder a
// configuração, o gráfico novo de cada tipo e a conversão entre o que a pessoa
// digita (reais, %) e o que o gráfico guarda (centavos, fração).
// Função pura: os testes rodam com `npm test`.

import {
  getMetric,
  metricCanBeNegative,
  metricSupportsDimension,
  type Dimension,
  type MetricDef,
  type MetricFormat,
  type MetricId,
} from "@/lib/charts/catalog";
import { msg } from "@/lib/charts/messages";
import { PANEL_WIDGET, widgetMetrics, type PanelWidget, type PanelWidgetInput, type WidgetType } from "@/lib/charts/widgets";

/** Id novo de gráfico (letras minúsculas, números e hífen, como PANEL_WIDGET pede). */
export function newWidgetId(random: () => number = Math.random): string {
  let id = "g-";
  for (let i = 0; i < 10; i++) id += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
  return id;
}

/** O gráfico de cada tipo quando ele nasce no editor. */
export function defaultWidget(type: WidgetType, id: string): PanelWidget {
  const inputs: Record<WidgetType, PanelWidgetInput> = {
    kpi: { id, type: "kpi", metric: "net" },
    line: { id, type: "line", series: [{ metric: "net", axis: "left" }] },
    column: { id, type: "column", series: [{ metric: "net" }] },
    bar: { id, type: "bar", dimension: "campaign", metrics: ["net"] },
    pie: { id, type: "pie", dimension: "platform", metric: "net" },
    donut: { id, type: "donut", dimension: "platform", metric: "net" },
    treemap: { id, type: "treemap", levels: ["platform", "campaign"], size: "spend", color: "roas" },
    funnel: { id, type: "funnel", source: { kind: "sales" } },
    gantt: { id, type: "gantt" },
  };
  return PANEL_WIDGET.parse(inputs[type]);
}

const isPart = (def: MetricDef) => def.kind === "sum" && !metricCanBeNegative(def);

/** Dimensão do gráfico, se ele tiver uma (a primeira do treemap). */
function dimensionOf(w: PanelWidget): Dimension | null {
  if (w.type === "bar" || w.type === "pie" || w.type === "donut") return w.dimension;
  if (w.type === "treemap") return w.levels[0];
  return null;
}

/**
 * Troca o tipo do gráfico aproveitando o que dá: as métricas, a dimensão, o
 * título, os filtros e a aparência. O que não serve no tipo novo (taxa numa
 * pizza, lucro num treemap, duas unidades no mesmo eixo) fica de fora. Se nada
 * servir, o tipo novo começa com o padrão dele, mas o título e a aparência ficam.
 */
export function switchWidgetType(w: PanelWidget, type: WidgetType): PanelWidget {
  if (w.type === type) return w;
  const base = { id: w.id, title: w.title, subtitle: w.subtitle, ignoreFilters: w.ignoreFilters, overrides: w.overrides, display: w.display };
  const metrics = widgetMetrics(w);
  const defs = metrics.map((id) => getMetric(id));
  const firstFormat: MetricFormat | undefined = defs[0]?.format;
  const sameUnit = defs.filter((d) => d.format === firstFormat).map((d) => d.id);
  const dimension = dimensionOf(w) ?? "campaign";
  const parts = defs.filter(isPart).map((d) => d.id);
  const fallback = defaultWidget(type, w.id);

  let input: PanelWidgetInput;
  switch (type) {
    case "kpi":
      input = { ...base, type, metric: metrics[0] ?? "net" };
      break;
    case "line": {
      // Até duas unidades: a primeira no eixo esquerdo, a segunda no direito.
      const units = [...new Set(defs.map((d) => d.format))].slice(0, 2);
      const series = defs
        .filter((d) => units.includes(d.format))
        .slice(0, 4)
        .map((d) => ({ metric: d.id, axis: d.format === units[0] ? ("left" as const) : ("right" as const) }));
      input = { ...base, type, series: series.length ? series : [{ metric: "net", axis: "left" }] };
      break;
    }
    case "column": {
      // Colunas + linha: a primeira unidade nas colunas e uma métrica de outra unidade como linha.
      const other = defs.find((d) => d.format !== firstFormat);
      input = {
        ...base,
        type,
        series: (sameUnit.length ? sameUnit : ["net" as MetricId]).slice(0, 4).map((metric) => ({ metric })),
        line: other ? { metric: other.id } : null,
      };
      break;
    }
    case "bar": {
      const ok = sameUnit.filter((id) => metricSupportsDimension(getMetric(id), dimension)).slice(0, 3);
      input = { ...base, type, dimension, metrics: ok.length ? ok : ["net"] };
      break;
    }
    case "pie":
    case "donut": {
      const ok = parts.find((id) => metricSupportsDimension(getMetric(id), dimension));
      input = w.type === "pie" || w.type === "donut" ? { ...w, type } : { ...base, type, dimension, metric: ok ?? "net" };
      break;
    }
    case "treemap": {
      const size = parts.find((id) => metricSupportsDimension(getMetric(id), dimension)) ?? "spend";
      const color = defs.find((d) => d.kind === "rate" && metricSupportsDimension(d, dimension))?.id ?? null;
      input = { ...base, type, levels: [dimension], size, color };
      break;
    }
    case "funnel": {
      // Funil de vendas com as contagens que o gráfico já tinha (pelo menos duas), senão o padrão.
      const counts = defs.filter((d) => d.kind === "sum" && d.format === "number").map((d) => d.id);
      input = counts.length >= 2 ? { ...base, type, source: { kind: "sales", steps: counts.slice(0, 6) } } : { ...base, type, source: { kind: "sales" } };
      break;
    }
    case "gantt":
      input = { ...base, type };
      break;
  }
  const parsed = PANEL_WIDGET.safeParse(input);
  return parsed.success ? parsed.data : { ...fallback, ...base };
}

// ---- unidades do editor ------------------------------------------------------------------------

/** Valor guardado → texto do campo: centavos viram reais e fração vira % (com vírgula). */
export function toInputValue(value: number | null | undefined, format: MetricFormat): string {
  if (value == null || !Number.isFinite(value)) return "";
  const shown = format === "money" ? value / 100 : format === "percent" ? value * 100 : value;
  return String(Math.round(shown * 10_000) / 10_000).replace(".", ",");
}

/** Texto do campo → valor guardado ("1.234,5" em reais vira 123450 centavos). null = vazio ou inválido. */
export function fromInputValue(text: string, format: MetricFormat): number | null {
  const clean = text.trim().replace(/\s|R\$|%|x$/gi, "");
  if (!clean) return null;
  // "1.234,56" e "1.500" (pt-BR: ponto de milhar) ou "1234.56": com vírgula, ela é a casa decimal.
  const thousands = /^-?\d{1,3}(\.\d{3})+$/.test(clean);
  const normalized = clean.includes(",") || thousands ? clean.replace(/\./g, "").replace(",", ".") : clean;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return format === "money" ? Math.round(n * 100) : format === "percent" ? n / 100 : n;
}

/** Como o campo mostra a unidade ("R$", "%", "x" ou nada). */
export function inputUnit(format: MetricFormat): string {
  return format === "money" ? "R$" : format === "percent" ? "%" : format === "multiplier" ? "x" : "";
}

/** "Período próprio: Últimos 7 dias · sem os filtros do painel", ou nada se o gráfico segue o painel. */
export function scopeNote(widget: PanelWidget): string | undefined {
  const { periodo, agrupar, comparar } = widget.overrides;
  const s = msg.panels.scope;
  const parts = [
    periodo ? s.period(msg.periods[periodo]) : null,
    agrupar ? s.granularity(msg.granularity[agrupar]) : null,
    comparar ? s.compare(msg.compare[comparar]) : null,
    widget.ignoreFilters ? s.noFilters : null,
  ].filter((p): p is string => p != null);
  if (!parts.length) return undefined;
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Nome do tipo de gráfico para a lista do editor. */
export const typeLabel = (type: WidgetType) => msg.widgetType[type].label;
