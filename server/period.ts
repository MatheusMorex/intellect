// Períodos em dias do calendário, no fuso do dashboard (architecture.md, "As
// partes que mordem": o "Hoje" do pedido, do gasto e da tela é o mesmo dia).

import { TZDate } from "@date-fns/tz";
import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

import { DATE_KEY, DEFAULT_PERIOD, isPeriodId, periodLabel, type PeriodId } from "@/lib/periods";
import type { DateKey } from "@/server/store/types";
import { dayKeyAt } from "@/server/tz";

export type DateRange = { from: DateKey; to: DateKey };

export type ResolvedPeriod = {
  id: PeriodId;
  label: string;
  range: DateRange;
  previous: DateRange | null;
  /** "6 a 12 de out." */
  description: string;
  /** Hoje no fuso (yyyy-MM-dd): o calendário não deixa escolher depois disso. */
  today: DateKey;
};

const key = (date: Date) => format(date, "yyyy-MM-dd");

export function todayIn(timezone: string, now = new Date()) {
  return new TZDate(now.getTime(), timezone);
}

/** O dia (aaaa-mm-dd) do instante no fuso. Rápido: chamado para cada pedido (server/tz.ts). */
export function dayKeyIn(isoUtc: string, timezone: string): DateKey {
  return dayKeyAt(Date.parse(isoUtc), timezone);
}

export function inRange(day: DateKey, range: DateRange) {
  return day >= range.from && day <= range.to;
}

function describe(range: DateRange) {
  const from = parseISO(range.from);
  const to = parseISO(range.to);
  if (range.from === range.to) return format(from, "d 'de' MMM", { locale: ptBR });
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${format(from, "d")} a ${format(to, "d 'de' MMM", { locale: ptBR })}`;
  }
  return `${format(from, "d 'de' MMM", { locale: ptBR })} a ${format(to, "d 'de' MMM", { locale: ptBR })}`;
}

function shift(range: DateRange): DateRange {
  const from = parseISO(range.from);
  const to = parseISO(range.to);
  const length = differenceInCalendarDays(to, from) + 1;
  return { from: key(addDays(from, -length)), to: key(addDays(from, -1)) };
}

export type CustomRange = { de?: string | null; ate?: string | null };

export function resolvePeriod(
  value: string | null | undefined,
  timezone: string,
  earliest: DateKey | null,
  now = new Date(),
  custom?: CustomRange,
): ResolvedPeriod {
  let id: PeriodId = isPeriodId(value) ? value : DEFAULT_PERIOD;
  const today = todayIn(timezone, now);
  const t = key(today);
  const from = custom?.de && DATE_KEY.test(custom.de) ? custom.de : null;
  const to = custom?.ate && DATE_KEY.test(custom.ate) ? custom.ate : null;
  if (id === "personalizado" && (!from || !to || from > to)) id = DEFAULT_PERIOD;
  let range: DateRange;
  switch (id) {
    case "personalizado":
      range = { from: from!, to: to! > t ? t : to! };
      break;
    case "hoje":
      range = { from: t, to: t };
      break;
    case "ontem": {
      const y = key(addDays(today, -1));
      range = { from: y, to: y };
      break;
    }
    case "7d":
      range = { from: key(addDays(today, -6)), to: t };
      break;
    case "30d":
      range = { from: key(addDays(today, -29)), to: t };
      break;
    case "mes":
      range = { from: key(startOfMonth(today)), to: t };
      break;
    case "mes-passado": {
      const last = subMonths(today, 1);
      range = { from: key(startOfMonth(last)), to: key(endOfMonth(last)) };
      break;
    }
    case "maximo":
      range = { from: earliest && earliest < t ? earliest : t, to: t };
      break;
  }
  let previous: DateRange | null = id === "maximo" ? null : shift(range);
  if (id === "mes-passado") {
    const before = subMonths(today, 2);
    previous = { from: key(startOfMonth(before)), to: key(endOfMonth(before)) };
  }
  return { id, label: periodLabel(id), range, previous, description: describe(range), today: t };
}
