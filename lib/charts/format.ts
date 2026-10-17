// Como os números dos Painéis aparecem na tela. O mesmo número tem que sair
// igual no cartão, no gráfico, na dica e na tabela: tudo passa por aqui.
//
// Sem número de verdade (sem venda, sem gasto), o valor aparece zerado, como
// no resto do app: R$ 0,00, 0,00x, 0,0%. O cálculo continua sabendo que é
// "sem dado" (null) e nunca trata isso como um zero de verdade.

import type { MetricFormat } from "@/lib/charts/catalog";
import { msg } from "@/lib/charts/messages";
import type { NumberStyle } from "@/lib/charts/options";

const MINUS = "−";

/** Troca o hífen pelo sinal de menos tipográfico, como lib/format.ts. */
function withMinus(text: string) {
  return text.replace("-", MINUS);
}

export type FormatOptions = {
  /** Moeda do dashboard (BRL, EUR, USD...). */
  currency: string;
  /** Completo (R$ 1.234,56) ou abreviado (R$ 1,2 mil). Padrão: completo. */
  style?: NumberStyle;
  /** Casas decimais. Padrão: 2 no dinheiro e no multiplicador, 1 no percentual, 0 no número. */
  decimals?: number;
  locale?: string;
};

const DEFAULT_DECIMALS: Record<MetricFormat, number> = { money: 2, number: 0, percent: 1, multiplier: 2 };

/** Abaixo de mil, o abreviado fica igual ao completo (R$ 950,00, não "R$ 950"). */
const COMPACT_FROM = 1000;

function clampDecimals(value: number | undefined, fallback: number) {
  if (value == null || !Number.isInteger(value)) return fallback;
  return Math.min(4, Math.max(0, value));
}

/**
 * Valor de uma métrica pronto para a tela.
 * - money: centavos; number: contagem; percent: fração (0,125 = 12,5%); multiplier: 3,2 = "3,20x".
 */
export function formatMetricValue(value: number | null | undefined, format: MetricFormat, options: FormatOptions): string {
  const v = value == null || !Number.isFinite(value) ? 0 : value;
  const locale = options.locale ?? msg.locale;
  const decimals = clampDecimals(options.decimals, DEFAULT_DECIMALS[format]);
  const compact = options.style === "compact";

  switch (format) {
    case "money": {
      const units = v / 100;
      if (compact && Math.abs(units) >= COMPACT_FROM) {
        return withMinus(
          new Intl.NumberFormat(locale, { style: "currency", currency: options.currency, notation: "compact", maximumFractionDigits: 1 }).format(units),
        );
      }
      return withMinus(
        new Intl.NumberFormat(locale, {
          style: "currency",
          currency: options.currency,
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(units),
      );
    }
    case "number": {
      if (compact && Math.abs(v) >= COMPACT_FROM) {
        return withMinus(new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(v));
      }
      return withMinus(new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v));
    }
    case "percent":
      return withMinus(
        new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v),
      );
    case "multiplier":
      return `${withMinus(new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v))}x`;
  }
}

// ---- variação entre períodos -------------------------------------------------------------------

/**
 * Variação contra o período de comparação (server/charts/compute.ts, compareValues).
 * - pct: (atual − anterior) ÷ |anterior|, em fração;
 * - new: o anterior era zero e o atual não ("Novo": um percentual não faria sentido);
 * - none: sem dado de um dos lados, ou os dois zerados (aparece 0,0%).
 * tone: good (verde), bad (vermelho) ou neutral, conforme a métrica (CPA caindo é bom).
 */
export type Tone = "good" | "bad" | "neutral";
export type Change = { kind: "pct"; value: number; tone: Tone } | { kind: "new"; tone: Tone } | { kind: "none"; tone: "neutral" };

export function formatChange(change: Change, decimals = 1, locale: string = msg.locale): string {
  if (change.kind === "new") return msg.changeNew;
  const value = change.kind === "pct" ? change.value : 0;
  return withMinus(
    new Intl.NumberFormat(locale, {
      style: "percent",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      signDisplay: "exceptZero",
    }).format(value),
  );
}
