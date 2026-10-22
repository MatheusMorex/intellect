// Campos personalizados do quadro (S07/F04): texto, número, data, caixa de seleção
// e lista de opções. O campo é do quadro; cada card guarda o valor dele. Serve,
// por exemplo, para guardar a verba ou o ID de uma campanha no card.
//
// No banco: custom_fields (o campo) e custom_field_values (o valor de cada card,
// em jsonb: texto, número, "AAAA-MM-DD", true ou o id da opção).

import type { CustomFieldRow } from "@/server/store/types";

export const FIELD_TYPES = ["text", "number", "date", "checkbox", "list"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Texto",
  number: "Número",
  date: "Data",
  checkbox: "Caixa de seleção",
  list: "Lista de opções",
};

export const MAX_FIELDS_PER_BOARD = 50;
export const MAX_OPTIONS = 50;
export const MAX_TEXT = 1000;

/** O valor guardado: texto, número, data (AAAA-MM-DD), marcado (true) ou o id da opção da lista. */
export type FieldValue = string | number | boolean;

type Parsed = { ok: true; value: FieldValue | null } | { ok: false; error: string };
const valid = (value: FieldValue | null): Parsed => ({ ok: true, value });
const invalid = (error: string): Parsed => ({ ok: false, error });

/** Número em pt-BR: "1.234,56", "1234,56" ou "1234.56" (ponto com até 2 casas é decimal). */
export function parseDecimal(input: string): number | null {
  const clean = input.replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(clean)) return null;
  let normalized: string;
  if (clean.includes(",")) normalized = clean.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{1,2}$/.test(clean) && clean.split(".").length === 2) normalized = clean;
  else normalized = clean.replace(/\./g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function isDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Confere o valor que a pessoa digitou para o tipo do campo. Vazio (ou caixa
 * desmarcada) vira null: o card fica sem valor nesse campo.
 */
export function parseFieldValue(field: Pick<CustomFieldRow, "type" | "options" | "name">, input: unknown): Parsed {
  const empty = input == null || (typeof input === "string" && input.trim() === "");
  switch (field.type) {
    case "text": {
      if (empty) return valid(null);
      if (typeof input !== "string") return invalid("Valor inválido.");
      const text = input.replace(/\s+/g, " ").trim();
      if (text.length > MAX_TEXT) return invalid(`${field.name} pode ter até ${MAX_TEXT.toLocaleString("pt-BR")} caracteres.`);
      return valid(text);
    }
    case "number": {
      if (empty) return valid(null);
      const value = typeof input === "number" ? input : typeof input === "string" ? parseDecimal(input) : null;
      if (value == null || !Number.isFinite(value) || Math.abs(value) >= 1e13) return invalid(`Use um número em ${field.name}, como 1.234,56.`);
      return valid(Math.round(value * 1e6) / 1e6);
    }
    case "date": {
      if (empty) return valid(null);
      if (typeof input !== "string" || !isDateKey(input)) return invalid(`Escolha uma data válida em ${field.name}.`);
      return valid(input);
    }
    case "checkbox":
      if (input === true) return valid(true);
      if (input === false || empty) return valid(null);
      return invalid("Valor inválido.");
    case "list": {
      if (empty) return valid(null);
      if (typeof input !== "string" || !field.options.some((o) => o.id === input)) return invalid(`Essa opção não existe mais em ${field.name}. Recarregue a página.`);
      return valid(input);
    }
  }
}

/** O valor como a pessoa lê: "1.234,56", "21/10/2026", "Sim" ou o nome da opção. */
export function displayFieldValue(field: Pick<CustomFieldRow, "type" | "options">, value: FieldValue): string {
  switch (field.type) {
    case "number":
      return typeof value === "number" ? value.toLocaleString("pt-BR", { maximumFractionDigits: 6 }) : String(value);
    case "date": {
      const [y, m, d] = String(value).split("-");
      return d && m && y ? `${d}/${m}/${y}` : String(value);
    }
    case "checkbox":
      return value === true ? "Sim" : "Não";
    case "list":
      return field.options.find((o) => o.id === value)?.label ?? "Opção apagada";
    default:
      return String(value);
  }
}

/** Opções da lista: nomes sem espaço sobrando, sem repetir, até MAX_OPTIONS. */
export function cleanOptions(options: { id?: string; label: string; color?: string | null }[], makeId: () => string): CustomFieldRow["options"] | string {
  const seen = new Set<string>();
  const out: CustomFieldRow["options"] = [];
  for (const o of options) {
    const label = o.label.replace(/\s+/g, " ").trim();
    if (!label) continue;
    if (label.length > 100) return "Cada opção pode ter até 100 caracteres.";
    const key = label.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) return `A opção “${label}” aparece duas vezes.`;
    seen.add(key);
    out.push({ id: o.id || makeId(), label, color: o.color ?? null });
  }
  if (out.length > MAX_OPTIONS) return `Uma lista pode ter até ${MAX_OPTIONS} opções.`;
  return out;
}
