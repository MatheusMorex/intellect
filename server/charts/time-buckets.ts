// Agrupamento por tempo dos Painéis: hora, dia, semana, quinzena, mês e ano.
//
// - As datas ficam em UTC no banco; o "dia" de cada registro é o do fuso do
//   dashboard (server/period.ts, dayKeyIn), o mesmo que o Resumo usa.
// - Todo intervalo do período vira um balde, mesmo sem dado nenhum (lacunas
//   aparecem como zero, não somem do eixo).
// - Balde do período que ainda não terminou (hoje, este mês) é marcado como
//   "parcial", para ninguém comparar um mês pela metade com um mês fechado.
// - Por hora: blocos de 1 hora no fuso do dashboard. No dia em que o relógio
//   volta (fim do horário de verão na Europa) o dia tem 25 blocos; no dia em que
//   adianta, 23. Cada bloco é sempre uma hora de verdade.

import { TZDate } from "@date-fns/tz";

import { msg } from "@/lib/charts/messages";
import { GRANULARITIES, GRANULARITY_MAX_DAYS, type Granularity, type WeekStart } from "@/lib/charts/options";
import { dayKeyIn, type DateRange } from "@/server/period";
import type { DateKey } from "@/server/store/types";
import { offsetMinutes } from "@/server/tz";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Trava de segurança: nenhum gráfico desenha mais que isso (o limite por granularidade já impede). */
const MAX_BUCKETS = 5000;

// ---- dias do calendário ("2026-10-17"), sem depender do fuso do servidor --------------------

function parts(day: DateKey): [number, number, number] {
  return [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))];
}

function utcMs(day: DateKey) {
  const [y, m, d] = parts(day);
  return Date.UTC(y, m - 1, d);
}

function keyOf(y: number, m: number, d: number): DateKey {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function keyFromMs(ms: number): DateKey {
  const date = new Date(ms);
  return keyOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** "2026-02-30" e "2026-13-01" não são datas. */
export function isValidDateKey(text: string | null | undefined): text is DateKey {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  return keyFromMs(utcMs(text)) === text;
}

export function addDays(day: DateKey, days: number): DateKey {
  return keyFromMs(utcMs(day) + days * DAY_MS);
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Quantos dias o período tem, contando o primeiro e o último. */
export function daysInRange(range: DateRange): number {
  return Math.round((utcMs(range.to) - utcMs(range.from)) / DAY_MS) + 1;
}

/** Mesmo dia no ano anterior; 29 de fevereiro vira 28. */
export function sameDayLastYear(day: DateKey): DateKey {
  const [y, m, d] = parts(day);
  return keyOf(y - 1, m, Math.min(d, lastDayOfMonth(y - 1, m)));
}

/** Instante (ms UTC) da meia-noite daquele dia no fuso. */
export function localMidnightUtc(day: DateKey, timezone: string): number {
  const [y, m, d] = parts(day);
  return new TZDate(y, m - 1, d, timezone).getTime();
}

/** Início (ms UTC) da hora do fuso em que o instante cai. */
export function floorToLocalHour(ms: number, timezone: string): number {
  const offset = offsetMinutes(ms, timezone) * 60_000;
  const local = ms + offset;
  return local - (local % HOUR_MS) - offset;
}

// ---- início e fim de cada balde (de "dia" para cima) ------------------------------------------

type DayGranularity = Exclude<Granularity, "hour">;

/** Primeiro dia do balde em que o dia cai. */
export function bucketStart(day: DateKey, granularity: DayGranularity, weekStart: WeekStart): DateKey {
  const [y, m, d] = parts(day);
  switch (granularity) {
    case "day":
      return day;
    case "week": {
      const weekday = new Date(utcMs(day)).getUTCDay(); // 0 = domingo
      const first = weekStart === "monday" ? 1 : 0;
      return addDays(day, -((weekday - first + 7) % 7));
    }
    case "fortnight":
      return keyOf(y, m, d <= 15 ? 1 : 16);
    case "month":
      return keyOf(y, m, 1);
    case "year":
      return keyOf(y, 1, 1);
  }
}

/** Último dia do balde que começa em `start`. */
export function bucketEnd(start: DateKey, granularity: DayGranularity): DateKey {
  const [y, m, d] = parts(start);
  switch (granularity) {
    case "day":
      return start;
    case "week":
      return addDays(start, 6);
    case "fortnight":
      return d === 1 ? keyOf(y, m, 15) : keyOf(y, m, lastDayOfMonth(y, m));
    case "month":
      return keyOf(y, m, lastDayOfMonth(y, m));
    case "year":
      return keyOf(y, 12, 31);
  }
}

// ---- textos -----------------------------------------------------------------------------------

const intl = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(msg.locale, { ...options, timeZone: "UTC" });
const MONTH_LONG = intl({ month: "long" });
const MONTH_SHORT = intl({ month: "short" });
const WEEKDAY_LONG = intl({ weekday: "long" });

const monthLong = (day: DateKey) => MONTH_LONG.format(utcMs(day));
const monthShort = (day: DateKey) => MONTH_SHORT.format(utcMs(day)).replace(".", "");
const dd = (n: number) => String(n).padStart(2, "0");
const yy = (y: number) => String(y % 100).padStart(2, "0");

/** "17 de outubro de 2026". */
export function longDate(day: DateKey): string {
  const [y, , d] = parts(day);
  return `${d} de ${monthLong(day)} de ${y}`;
}

/** "12 a 18 de outubro de 2026", "28 de setembro a 4 de outubro de 2026" ou, entre anos, com os dois anos. */
export function longRange(range: DateRange): string {
  if (range.from === range.to) return longDate(range.from);
  const [y1, m1, d1] = parts(range.from);
  const [y2, m2] = parts(range.to);
  if (y1 !== y2) return `${longDate(range.from)} a ${longDate(range.to)}`;
  if (m1 !== m2) return `${d1} de ${monthLong(range.from)} a ${longDate(range.to)}`;
  return `${d1} a ${longDate(range.to)}`;
}

/** "12 a 18/10" ou "28/09 a 04/10" (com o ano quando o gráfico cruza anos). */
function shortRange(from: DateKey, to: DateKey, withYear: boolean) {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  const tail = withYear ? `/${yy(y2)}` : "";
  if (y1 === y2 && m1 === m2) return `${d1} a ${dd(d2)}/${dd(m2)}${tail}`;
  return `${dd(d1)}/${dd(m1)}${withYear ? `/${yy(y1)}` : ""} a ${dd(d2)}/${dd(m2)}${tail}`;
}

function dayLabels(granularity: DayGranularity, naturalFrom: DateKey, naturalTo: DateKey, withYear: boolean) {
  const [y, m, d] = parts(naturalFrom);
  const yearTail = withYear ? `/${yy(y)}` : "";
  switch (granularity) {
    case "day":
      return { label: `${dd(d)}/${dd(m)}${yearTail}`, longLabel: `${WEEKDAY_LONG.format(utcMs(naturalFrom))}, ${longDate(naturalFrom)}` };
    case "week":
      return { label: shortRange(naturalFrom, naturalTo, withYear), longLabel: msg.weekOf(longRange({ from: naturalFrom, to: naturalTo })) };
    case "fortnight": {
      const first = d === 1;
      return {
        label: `${first ? msg.fortnight.firstShort : msg.fortnight.secondShort} ${monthShort(naturalFrom)}${yearTail}`,
        longLabel: `${first ? msg.fortnight.first : msg.fortnight.second} de ${monthLong(naturalFrom)} de ${y}`,
      };
    }
    case "month":
      return { label: `${monthShort(naturalFrom)}${yearTail}`, longLabel: `${monthLong(naturalFrom)} de ${y}` };
    case "year":
      return { label: String(y), longLabel: String(y) };
  }
}

// ---- baldes -----------------------------------------------------------------------------------

export type Bucket = {
  /** Identificador estável: o primeiro dia do balde ("2026-10-12") ou, por hora, o instante UTC em que a hora começa. */
  key: string;
  /** Dias do fuso cobertos por este balde dentro do período (já cortados pelo período escolhido). */
  from: DateKey;
  to: DateKey;
  /** O balde inteiro (a semana toda, o mês todo), mesmo que o período cubra só uma parte. */
  naturalFrom: DateKey;
  naturalTo: DateKey;
  /** Instantes em UTC do que o balde cobre: começo incluído, fim excluído. */
  startUtc: string;
  endUtc: string;
  /** Texto curto, para o eixo ("17/10", "out", "14h"). */
  label: string;
  /** Texto por extenso, para a dica ("sábado, 17 de outubro de 2026"). */
  longLabel: string;
  /** ongoing: ainda em andamento (inclui agora); clipped: o período cobre só uma parte; null: completo. */
  partial: "ongoing" | "clipped" | null;
};

export type BucketOptions = {
  timezone: string;
  weekStart: WeekStart;
  /** "Agora", para saber o que já aconteceu e o que está em andamento. Padrão: o relógio. */
  now?: Date;
};

export type GranularityCheck =
  | { ok: true; granularity: Granularity }
  | { ok: false; requested: Granularity; granularity: Granularity; message: string };

/**
 * A granularidade cabe no período? Se não couber (por hora em 3 meses, por
 * exemplo), sugere a mais fina que cabe, com uma mensagem para a tela.
 */
export function checkGranularity(range: DateRange, requested: Granularity): GranularityCheck {
  const days = daysInRange(range);
  const fits = (g: Granularity) => {
    const max = GRANULARITY_MAX_DAYS[g];
    return max == null || days <= max;
  };
  if (fits(requested)) return { ok: true, granularity: requested };
  const coarser = GRANULARITIES.slice(GRANULARITIES.indexOf(requested) + 1);
  const suggested = coarser.find(fits) ?? "year";
  return {
    ok: false,
    requested,
    granularity: suggested,
    message: `${msg.granularityLimit[requested]} ${msg.granularitySuggestion(msg.granularity[suggested])}`,
  };
}

/**
 * Granularidade automática pelo tamanho do período, quando a pessoa não
 * escolheu: Hoje e Ontem por hora; até 45 dias por dia; até ~6 meses por
 * semana; até 10 anos por mês; mais que isso, por ano.
 */
export function autoGranularity(range: DateRange): Granularity {
  const days = daysInRange(range);
  if (days <= 2) return "hour";
  if (days <= 45) return "day";
  if (days <= 200) return "week";
  if (days <= 3660) return "month";
  return "year";
}

/**
 * Todos os baldes do período, em ordem, inclusive os sem dado. Não inclui o
 * que ainda não aconteceu (as horas depois de agora). Quem chama deve passar
 * uma granularidade aprovada por checkGranularity.
 */
export function listBuckets(range: DateRange, granularity: Granularity, options: BucketOptions): Bucket[] {
  const now = options.now ?? new Date();
  const tz = options.timezone;
  if (range.from > range.to) return [];
  const buckets: Bucket[] = [];
  const push = (b: Bucket) => {
    buckets.push(b);
    if (buckets.length > MAX_BUCKETS) throw new Error(`Período grande demais para ${granularity}: mais de ${MAX_BUCKETS} pontos.`);
  };

  if (granularity === "hour") {
    const end = localMidnightUtc(addDays(range.to, 1), tz);
    const nowMs = now.getTime();
    // Em mais de um dia, o eixo precisa dizer de que dia é cada hora ("17/10 14h").
    const multiDay = range.from !== range.to;
    const seen = new Set<string>();
    for (let t = localMidnightUtc(range.from, tz); t < end; t += HOUR_MS) {
      if (t > nowMs) break;
      const day = dayKeyIn(new Date(t).toISOString(), tz);
      const hour = new Date(t + offsetMinutes(t, tz) * 60_000).getUTCHours();
      const base = `${hour}h`;
      const repeated = seen.has(`${day} ${base}`) ? msg.repeatedHour(base) : base;
      seen.add(`${day} ${base}`);
      const [, m, d] = parts(day);
      const label = multiDay ? `${dd(d)}/${dd(m)} ${repeated}` : repeated;
      push({
        key: new Date(t).toISOString(),
        from: day,
        to: day,
        naturalFrom: day,
        naturalTo: day,
        startUtc: new Date(t).toISOString(),
        endUtc: new Date(t + HOUR_MS).toISOString(),
        label,
        longLabel: `${longDate(day)}, ${repeated}`,
        partial: t + HOUR_MS > nowMs ? "ongoing" : null,
      });
    }
    return buckets;
  }

  const today = dayKeyIn(now.toISOString(), tz);
  const withYear = range.from.slice(0, 4) !== range.to.slice(0, 4);
  for (let cursor = bucketStart(range.from, granularity, options.weekStart); cursor <= range.to; ) {
    const naturalTo = bucketEnd(cursor, granularity);
    const from = cursor < range.from ? range.from : cursor;
    const to = naturalTo > range.to ? range.to : naturalTo;
    if (from > today) break;
    const partial = to >= today ? "ongoing" : from > cursor || to < naturalTo ? "clipped" : null;
    push({
      key: cursor,
      from,
      to,
      naturalFrom: cursor,
      naturalTo,
      startUtc: new Date(localMidnightUtc(from, tz)).toISOString(),
      endUtc: new Date(localMidnightUtc(addDays(to, 1), tz)).toISOString(),
      ...dayLabels(granularity, cursor, naturalTo, withYear),
      partial,
    });
    cursor = addDays(naturalTo, 1);
  }
  return buckets;
}

/**
 * Diz em que balde cai cada registro: pelo instante (pedido) ou pelo dia
 * (gasto do dia, que vem por dia da plataforma). Fora do período, null.
 * Por hora, um dado que só existe por dia não cabe em hora nenhuma (null):
 * quem chama marca a peça como "sem dado" nessa granularidade.
 */
export type Locator = {
  /** Balde do instante (pedido), ou null fora do período. */
  byInstant(isoUtc: string): string | null;
  /** Balde do dia (gasto do dia), ou null fora do período ou quando o gráfico é por hora. */
  byDay(day: DateKey): string | null;
};

export function makeLocator(buckets: Bucket[], granularity: Granularity, options: BucketOptions): Locator {
  const tz = options.timezone;
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  if (granularity === "hour") {
    return {
      byInstant(isoUtc: string) {
        const key = new Date(floorToLocalHour(Date.parse(isoUtc), tz)).toISOString();
        return byKey.has(key) ? key : null;
      },
      byDay: () => null,
    };
  }
  const byDay = (day: DateKey): string | null => {
    const key = bucketStart(day, granularity, options.weekStart);
    const bucket = byKey.get(key);
    return bucket && day >= bucket.from && day <= bucket.to ? key : null;
  };
  return {
    byInstant: (isoUtc: string) => byDay(dayKeyIn(isoUtc, tz)),
    byDay,
  };
}
