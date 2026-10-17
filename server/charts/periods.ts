// Período e comparação dos Painéis, em dias do calendário no fuso do dashboard.
//
// Os atalhos que o Resumo também tem (Hoje, Ontem, 7 e 30 dias, Este mês, Mês
// passado, Máximo e Personalizado) usam o mesmo cálculo dele
// (server/period.ts): o mesmo período dá o mesmo número e a mesma variação.
//
// "Período anterior" = os mesmos tantos dias logo antes (últimos 30 dias contra
// os 30 dias antes deles). Mês passado e Ano passado comparam com o mês e o ano
// inteiros de antes.

import { msg } from "@/lib/charts/messages";
import { DEFAULT_PANEL_PERIOD, isPanelPeriodId, type CompareMode, type PanelPeriodId } from "@/lib/charts/options";
import { addDays, bucketStart, daysInRange, isValidDateKey, longRange, sameDayLastYear } from "@/server/charts/time-buckets";
import { dayKeyIn, resolvePeriod, type CustomRange, type DateRange } from "@/server/period";
import type { DateKey } from "@/server/store/types";

/** Primeiro dia que o calendário aceita. */
export const MIN_DAY: DateKey = "2000-01-01";

export type PanelPeriod = {
  id: PanelPeriodId;
  label: string;
  range: DateRange;
  /** O período anterior equivalente (null em "Todo o período", que não tem antes). */
  previous: DateRange | null;
  /** "1 a 17 de outubro de 2026". */
  description: string;
  /** Hoje no fuso: o calendário não deixa escolher depois disso. */
  today: DateKey;
};

const SAME_AS_RESUMO: ReadonlySet<PanelPeriodId> = new Set(["hoje", "ontem", "7d", "30d", "mes", "mes-passado", "maximo", "personalizado"]);

/** Os mesmos tantos dias, logo antes. */
function shift(range: DateRange): DateRange {
  const length = daysInRange(range);
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

/** Datas escolhidas no calendário: datas de verdade, em ordem, de 2000 até hoje (o fim é cortado em hoje). */
function validCustom(custom: CustomRange | undefined, today: DateKey): DateRange | null {
  const from = custom?.de;
  const to = custom?.ate;
  if (!isValidDateKey(from) || !isValidDateKey(to)) return null;
  if (from > to || from < MIN_DAY || from > today) return null;
  return { from, to: to > today ? today : to };
}

export function resolvePanelPeriod(
  value: string | null | undefined,
  timezone: string,
  earliest: DateKey | null,
  now = new Date(),
  custom?: CustomRange,
): PanelPeriod {
  const today = dayKeyIn(now.toISOString(), timezone);
  let id: PanelPeriodId = isPanelPeriodId(value) ? value : DEFAULT_PANEL_PERIOD;
  if (id === "personalizado" && !validCustom(custom, today)) id = DEFAULT_PANEL_PERIOD;

  let range: DateRange;
  let previous: DateRange | null;
  if (SAME_AS_RESUMO.has(id)) {
    const resolved = resolvePeriod(id, timezone, earliest, now, custom);
    range = resolved.range;
    previous = resolved.previous;
  } else {
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    switch (id) {
      case "14d":
        range = { from: addDays(today, -13), to: today };
        break;
      case "quinzena":
        range = { from: bucketStart(today, "fortnight", "monday"), to: today };
        break;
      case "trimestre": {
        const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
        range = { from: `${year}-${String(firstMonth).padStart(2, "0")}-01`, to: today };
        break;
      }
      case "ano":
        range = { from: `${year}-01-01`, to: today };
        break;
      default: // "ano-passado"
        range = { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    }
    previous = id === "ano-passado" ? { from: `${year - 2}-01-01`, to: `${year - 2}-12-31` } : shift(range);
  }

  return { id, label: msg.periods[id], range, previous, description: longRange(range), today };
}

/**
 * Período de comparação: o anterior equivalente, o mesmo do ano anterior
 * (29/02 vira 28/02) ou datas escolhidas. null quando a comparação está
 * desligada ou não existe.
 */
export function comparisonRange(period: PanelPeriod, mode: CompareMode, custom?: CustomRange): DateRange | null {
  switch (mode) {
    case "off":
      return null;
    case "previous":
      return period.previous;
    case "year":
      return { from: sameDayLastYear(period.range.from), to: sameDayLastYear(period.range.to) };
    case "custom":
      return validCustom(custom, period.today);
  }
}
