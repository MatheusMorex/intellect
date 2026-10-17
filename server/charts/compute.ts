// Serviço único de cálculo dos Painéis. Todo número que aparece num cartão,
// gráfico, dica ou tabela sai daqui, para ser sempre o mesmo.
//
// Regras:
// - soma-se só as "peças" (centavos e contagens; lib/charts/catalog.ts, COMPONENTS);
// - taxas (ROAS, CPA, margem...) são refeitas com as peças já somadas: o ROAS do
//   mês é o faturamento do mês ÷ o gasto do mês, nunca a média dos ROAS diários;
// - divisão por zero dá null ("sem dado"), nunca Infinity, NaN ou zero;
// - peça null = não existe dado dela (gasto por hora, por exemplo): toda métrica
//   que depende dela também fica sem dado.

import { COMPONENTS, getMetric, type ComponentId, type Linear, type MetricDef, type MetricDirection, type MetricFormat, type MetricId } from "@/lib/charts/catalog";
import type { Change, Tone } from "@/lib/charts/format";
import { evaluateFormula, type ParsedFormula } from "@/lib/charts/formula";
import { msg } from "@/lib/charts/messages";
import { change as relativeChange } from "@/server/metrics/formulas";

/** Valor de cada peça num balde (um dia, uma campanha...). null = sem dado dessa peça. */
export type Components = Record<ComponentId, number | null>;

export function zeroComponents(): Components {
  return Object.fromEntries(COMPONENTS.map((c) => [c, 0])) as Components;
}

/** Soma `source` em `target`. Peça que falta em `source` não soma nada; null de qualquer lado vira null. */
export function addComponents(target: Components, source: Partial<Components>): Components {
  for (const c of COMPONENTS) {
    const v = source[c];
    if (v === undefined) continue;
    const t = target[c];
    target[c] = t == null || v == null ? null : t + v;
  }
  return target;
}

export function sumComponents(list: Partial<Components>[]): Components {
  const total = zeroComponents();
  for (const item of list) addComponents(total, item);
  return total;
}

/** Marca peças como "sem dado" (por exemplo, o gasto quando o gráfico é por hora). */
export function markUnavailable(target: Components, ids: readonly ComponentId[]): Components {
  for (const c of ids) target[c] = null;
  return target;
}

function linear(l: Linear, c: Components): number | null {
  let sum = 0;
  for (const id of l.plus) {
    const v = c[id];
    if (v == null) return null;
    sum += v;
  }
  for (const id of l.minus ?? []) {
    const v = c[id];
    if (v == null) return null;
    sum -= v;
  }
  return sum;
}

/**
 * Valor de uma métrica a partir das peças. Dinheiro em centavos (as taxas em
 * dinheiro, como CPA e ticket médio, arredondadas para o centavo, como no Resumo);
 * percentual em fração; multiplicador como número (3,2).
 */
export function metricValue(metric: MetricDef | MetricId, c: Components): number | null {
  const def = typeof metric === "string" ? getMetric(metric) : metric;
  if (def.kind === "sum") return linear(def.value, c);
  const numerator = linear(def.numerator, c);
  const denominator = linear(def.denominator, c);
  if (numerator == null || denominator == null || denominator === 0) return null;
  const value = (numerator / denominator) * (def.scale ?? 1);
  if (!Number.isFinite(value)) return null;
  return def.format === "money" ? Math.round(value) : value;
}

export type BucketComponents = { key: string; components: Components };

/** A métrica em cada balde, na ordem dos baldes. */
export function metricSeries(rows: BucketComponents[], metric: MetricDef | MetricId): (number | null)[] {
  return rows.map((r) => metricValue(metric, r.components));
}

/** Total do período: soma as peças de todos os baldes (as taxas saem refeitas desse total). */
export function totalComponents(rows: BucketComponents[]): Components {
  return sumComponents(rows.map((r) => r.components));
}

// ---- ranking (Top N + "Outros") ----------------------------------------------------------------

export type Row = { key: string; label: string; components: Components };
export const OTHERS_KEY = "__outros__";

/**
 * As N maiores (ou menores) linhas pela métrica; o resto vira "Outros", com as
 * peças somadas e as taxas refeitas (o ROAS de "Outros" é o faturamento deles ÷
 * o gasto deles). Linhas sem dado na métrica vão para o fim.
 */
export function topN(rows: Row[], metric: MetricDef | MetricId, n: number, order: "desc" | "asc" = "desc"): Row[] {
  const limit = Math.min(50, Math.max(1, Math.floor(n)));
  const scored = rows.map((row) => ({ row, value: metricValue(metric, row.components) }));
  scored.sort((a, b) => {
    if (a.value == null && b.value == null) return a.row.label.localeCompare(b.row.label, msg.locale);
    if (a.value == null) return 1;
    if (b.value == null) return -1;
    if (a.value !== b.value) return order === "desc" ? b.value - a.value : a.value - b.value;
    return a.row.label.localeCompare(b.row.label, msg.locale);
  });
  const top = scored.slice(0, limit).map((s) => s.row);
  const rest = scored.slice(limit).map((s) => s.row);
  if (rest.length === 0) return top;
  return [...top, { key: OTHERS_KEY, label: msg.others, components: sumComponents(rest.map((r) => r.components)) }];
}

// ---- comparação --------------------------------------------------------------------------------

function toneFor(sign: number, direction: MetricDirection): Tone {
  if (sign === 0 || direction === "neutral") return "neutral";
  const better = direction === "up" ? sign > 0 : sign < 0;
  return better ? "good" : "bad";
}

/**
 * Variação contra o período de comparação: (atual − anterior) ÷ |anterior|
 * (server/metrics/formulas.ts, a mesma conta do Resumo). Anterior zero e atual
 * não: "Novo". A cor segue o sentido da métrica: CPA caindo é verde.
 */
export function compareValues(current: number | null, previous: number | null, direction: MetricDirection): Change {
  if (current == null || previous == null) return { kind: "none", tone: "neutral" };
  if (previous === 0) return current === 0 ? { kind: "none", tone: "neutral" } : { kind: "new", tone: "neutral" };
  const value = relativeChange(current, previous);
  if (value == null || !Number.isFinite(value)) return { kind: "none", tone: "neutral" };
  return { kind: "pct", value, tone: toneFor(Math.sign(value), direction) };
}

// ---- métricas personalizadas -------------------------------------------------------------------

/**
 * Valor de uma métrica personalizada nas peças de um balde. As métricas da
 * fórmula entram já refeitas a partir das peças; dinheiro entra na unidade da
 * moeda (reais) e o resultado volta para centavos quando o formato é dinheiro.
 */
export function customMetricValue(formula: ParsedFormula, format: MetricFormat, c: Components): number | null {
  const result = evaluateFormula(formula.ast, (id) => {
    const def = getMetric(id);
    const v = metricValue(def, c);
    if (v == null) return null;
    return def.format === "money" ? v / 100 : v;
  });
  if (result == null) return null;
  return format === "money" ? Math.round(result * 100) : result;
}
