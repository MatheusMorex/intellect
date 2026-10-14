// Conversão de moeda pela cotação de referência do Banco Central Europeu.
// Função pura (os testes ficam em tests/fx.test.ts); a busca das cotações
// fica em server/fx/rates.ts.
//
// As cotações são guardadas com o real como base: 1 BRL = rate unidades da
// moeda. Converter de A para B no dia d: valor ÷ rate(A, d) × rate(B, d).
// Fim de semana e feriado não têm cotação: vale a do último dia útil antes,
// até LOOKBACK_DAYS para trás.

import type { DateKey, FxRateRow } from "../store/types.ts";

export const BASE_CURRENCY = "BRL";
export const LOOKBACK_DAYS = 10;

export type Converter = {
  /** Moeda de destino (a do dashboard). */
  currency: string;
  /** Centavos de `from` em centavos da moeda de destino, pela cotação de `day`. null quando falta a cotação. */
  cents(amount: number, from: string, day: DateKey): number | null;
  /** Quantas conversões ficaram sem cotação desde que o conversor foi criado. */
  misses(): number;
};

export function shiftDay(day: DateKey, days: number): DateKey {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function makeConverter(rates: FxRateRow[], to: string): Converter {
  const byQuote = new Map<string, { date: DateKey; rate: number }[]>();
  for (const r of rates) {
    const list = byQuote.get(r.quote);
    if (list) list.push({ date: r.date, rate: r.rate });
    else byQuote.set(r.quote, [{ date: r.date, rate: r.rate }]);
  }
  for (const list of byQuote.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  function rateOn(quote: string, day: DateKey): number | null {
    if (quote === BASE_CURRENCY) return 1;
    const list = byQuote.get(quote);
    if (!list?.length) return null;
    // Busca binária: a última cotação com data <= day.
    let lo = 0;
    let hi = list.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].date <= day) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0 || list[found].date < shiftDay(day, -LOOKBACK_DAYS)) return null;
    return list[found].rate;
  }

  let missed = 0;
  return {
    currency: to,
    cents(amount, from, day) {
      if (from === to || amount === 0) return amount;
      const rateFrom = rateOn(from, day);
      const rateTo = rateOn(to, day);
      if (rateFrom == null || rateTo == null) {
        missed++;
        return null;
      }
      return Math.round((amount / rateFrom) * rateTo);
    },
    misses: () => missed,
  };
}

/** Conversor que não converte nada: todos os valores já estão na moeda de destino. */
export function identityConverter(currency: string): Converter {
  let missed = 0;
  return {
    currency,
    cents(amount, from) {
      if (from === currency) return amount;
      missed++;
      return null;
    },
    misses: () => missed,
  };
}
