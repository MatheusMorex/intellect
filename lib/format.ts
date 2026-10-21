import { formatDistanceToNowStrict, format as formatDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TZDate } from "@date-fns/tz";

// Formatos pt-BR do app (replica/design/components.md, "Formato de números e datas").
// Dinheiro chega em centavos; percentual em pontos-base (1234 = 12,34%).

const MINUS = "−";

function withMinus(text: string) {
  return text.replace("-", MINUS);
}

export function money(cents: number, currency = "BRL") {
  return withMinus(
    new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100),
  );
}

/** Símbolo da moeda como aparece nos valores: "R$", "€", "£", "CHF". */
export function currencySymbol(currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
}

export function percent(basisPoints: number, digits = 1) {
  return withMinus(
    new Intl.NumberFormat("pt-BR", {
      style: "percent",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(basisPoints / 10000),
  );
}

export function roas(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function shortDate(date: Date) {
  return formatDate(date, "d 'de' MMM", { locale: ptBR });
}

export function dateTime(date: Date) {
  return formatDate(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

/** "há 5 minutos" ou, no futuro, "em 45 minutos". */
export function relative(date: Date) {
  const distance = formatDistanceToNowStrict(date, { locale: ptBR });
  return date.getTime() > Date.now() ? `em ${distance}` : `há ${distance}`;
}

export const EMPTY = "—";

/** Tamanho de arquivo: "830 KB", "1,2 MB" (base 1024, como o sistema mostra). */
export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value < 10 ? 1 : 0;
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: digits })} ${units[unit]}`;
}

/** Data e hora no fuso indicado (o do dashboard, no tracking). */
export function dateTimeIn(isoUtc: string, timezone: string, pattern = "dd/MM HH:mm") {
  return formatDate(new TZDate(new Date(isoUtc).getTime(), timezone), pattern, { locale: ptBR });
}

export function integer(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function percentOf(fraction: number | null, digits = 1) {
  if (fraction == null || !Number.isFinite(fraction)) return null;
  return withMinus(
    new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(fraction),
  );
}

// Sem número de verdade (sem venda, sem gasto), os valores do tracking aparecem
// zerados: R$ 0,00, ROAS 0,00 e 0,0%. O travessão fica só para o que não é número.

export const ZERO_RATIO = "0,00";

export function moneyOrZero(cents: number | null | undefined, currency = "BRL") {
  return money(cents ?? 0, currency);
}

export function roasOrZero(value: number | null | undefined) {
  return roas(value) ?? ZERO_RATIO;
}

export function percentOrZero(fraction: number | null | undefined, digits = 1) {
  return percentOf(fraction ?? null, digits) ?? percentOf(0, digits)!;
}

/** Número com casas decimais (frequência 3,5), zerado quando não há número. */
export function decimalOrZero(value: number | null | undefined, digits = 1) {
  const v = value == null || !Number.isFinite(value) ? 0 : value;
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}
