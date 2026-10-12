import { formatDistanceToNowStrict, format as formatDate } from "date-fns";
import { ptBR } from "date-fns/locale";

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

export function relative(date: Date) {
  return `há ${formatDistanceToNowStrict(date, { locale: ptBR })}`;
}

export const EMPTY = "—";
