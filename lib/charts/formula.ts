// Métricas personalizadas: o administrador escreve uma fórmula simples com as
// métricas do catálogo, como "lucro ÷ vendas_pagas". Este arquivo lê a fórmula
// sem eval (nada do texto vira código) e calcula o valor.
//
// Aceita: números (1,5 ou 1.5), nomes das métricas (lib/charts/catalog.ts, campo
// slug; acento e maiúscula não importam), + − × ÷ (ou * e /) e parênteses.
// O servidor valida de novo antes de salvar; a tela usa a mesma função para
// mostrar o erro enquanto a pessoa digita.
//
// Dentro da fórmula, dinheiro vale na unidade da moeda (lucro − 1000 tira
// R$ 1.000,00, não 1000 centavos) e percentual vale em fração (12,5% = 0,125).
// A conversão fica em server/charts/compute.ts (customMetricValue).

import { getMetric, metricBySlug, type MetricId, type MetricKind } from "@/lib/charts/catalog";
import { msg } from "@/lib/charts/messages";

export const FORMULA_MAX_LENGTH = 200;
const MAX_TOKENS = 80;
const MAX_DEPTH = 10;

export type FormulaNode =
  | { type: "number"; value: number }
  | { type: "metric"; id: MetricId }
  | { type: "negate"; arg: FormulaNode }
  | { type: "binary"; op: "+" | "-" | "*" | "/"; left: FormulaNode; right: FormulaNode };

export type ParsedFormula = {
  ok: true;
  ast: FormulaNode;
  /** Métricas usadas, sem repetir. */
  metrics: MetricId[];
  /** "sum" só quando a fórmula é uma soma de métricas somáveis (pode ir na pizza); senão "rate". */
  kind: MetricKind;
};
export type FormulaError = { ok: false; error: string; /** posição (0 = primeiro caractere) */ position: number };

type Token =
  | { kind: "number"; value: number; text: string; pos: number }
  | { kind: "name"; text: string; pos: number }
  | { kind: "op"; op: "+" | "-" | "*" | "/"; text: string; pos: number }
  | { kind: "paren"; open: boolean; text: string; pos: number };

class FormulaSyntaxError extends Error {
  position: number;
  constructor(message: string, position: number) {
    super(message);
    this.position = position;
  }
}

const OPS: Record<string, "+" | "-" | "*" | "/"> = {
  "+": "+",
  "-": "-",
  "−": "-",
  "*": "*",
  "×": "*",
  "/": "/",
  "÷": "/",
};

/** Sem acento e em minúsculas: "Lucro" e "lucro" são a mesma métrica. */
function normalizeName(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (OPS[ch]) {
      tokens.push({ kind: "op", op: OPS[ch], text: ch, pos: i });
      i++;
    } else if (ch === "(" || ch === ")") {
      tokens.push({ kind: "paren", open: ch === "(", text: ch, pos: i });
      i++;
    } else if (/[0-9]/.test(ch)) {
      const start = i;
      while (i < source.length && /[0-9.,]/.test(source[i])) i++;
      const text = source.slice(start, i);
      // Um separador decimal só (vírgula ou ponto); "1.000" ou "1,5,2" é ambíguo e é recusado.
      if (!/^\d+([.,]\d+)?$/.test(text)) throw new FormulaSyntaxError(msg.formula.badNumber(text), start);
      tokens.push({ kind: "number", value: Number(text.replace(",", ".")), text, pos: start });
    } else if (/[\p{L}_]/u.test(ch)) {
      const start = i;
      while (i < source.length && /[\p{L}\p{M}0-9_]/u.test(source[i])) i++;
      tokens.push({ kind: "name", text: source.slice(start, i), pos: start });
    } else {
      throw new FormulaSyntaxError(msg.formula.unexpected(ch), i);
    }
    if (tokens.length > MAX_TOKENS) throw new FormulaSyntaxError(msg.formula.tooManyParts, i);
  }
  return tokens;
}

// Gramática (do mais fraco para o mais forte):
//   soma    := produto (("+" | "-") produto)*
//   produto := sinal (("*" | "/") sinal)*
//   sinal   := "-" sinal | átomo
//   átomo   := número | métrica | "(" soma ")"
function parseTokens(tokens: Token[], sourceLength: number): FormulaNode {
  let index = 0;
  const peek = () => tokens[index];

  function expect(): Token {
    const t = tokens[index];
    if (!t) throw new FormulaSyntaxError(msg.formula.unexpectedEnd, sourceLength);
    return t;
  }

  function sum(depth: number): FormulaNode {
    let left = product(depth);
    for (let t = peek(); t && t.kind === "op" && (t.op === "+" || t.op === "-"); t = peek()) {
      index++;
      left = { type: "binary", op: t.op, left, right: product(depth) };
    }
    return left;
  }

  function product(depth: number): FormulaNode {
    let left = signed(depth);
    for (let t = peek(); t && t.kind === "op" && (t.op === "*" || t.op === "/"); t = peek()) {
      index++;
      left = { type: "binary", op: t.op, left, right: signed(depth) };
    }
    return left;
  }

  function signed(depth: number): FormulaNode {
    const t = expect();
    if (t.kind === "op" && t.op === "-") {
      index++;
      return { type: "negate", arg: signed(depth) };
    }
    return atom(depth);
  }

  function atom(depth: number): FormulaNode {
    const t = expect();
    index++;
    if (t.kind === "number") return { type: "number", value: t.value };
    if (t.kind === "name") {
      const def = metricBySlug(normalizeName(t.text));
      if (!def) throw new FormulaSyntaxError(msg.formula.unknownMetric(t.text), t.pos);
      return { type: "metric", id: def.id };
    }
    if (t.kind === "paren" && t.open) {
      if (depth + 1 > MAX_DEPTH) throw new FormulaSyntaxError(msg.formula.tooDeep, t.pos);
      const inner = sum(depth + 1);
      const close = peek();
      if (!close || close.kind !== "paren" || close.open) {
        throw new FormulaSyntaxError(close ? msg.formula.unexpected(close.text) : msg.formula.unclosed, close ? close.pos : sourceLength);
      }
      index++;
      return inner;
    }
    throw new FormulaSyntaxError(msg.formula.unexpected(t.text), t.pos);
  }

  const ast = sum(0);
  const rest = peek();
  if (rest) throw new FormulaSyntaxError(msg.formula.unexpected(rest.text), rest.pos);
  return ast;
}

/** Valor da parte da fórmula que não depende de métrica nenhuma (null se depende). */
function constantValue(node: FormulaNode): number | null {
  switch (node.type) {
    case "number":
      return node.value;
    case "metric":
      return null;
    case "negate": {
      const v = constantValue(node.arg);
      return v == null ? null : -v;
    }
    case "binary": {
      const l = constantValue(node.left);
      const r = constantValue(node.right);
      if (l == null || r == null) return null;
      return applyOp(node.op, l, r);
    }
  }
}

function applyOp(op: "+" | "-" | "*" | "/", l: number, r: number): number | null {
  if (op === "+") return l + r;
  if (op === "-") return l - r;
  if (op === "*") return l * r;
  return r === 0 ? null : l / r;
}

/** Procura uma divisão por um valor fixo igual a zero ("lucro ÷ 0" ou "lucro ÷ (2 − 2)"). */
function findZeroDivision(node: FormulaNode): boolean {
  if (node.type === "negate") return findZeroDivision(node.arg);
  if (node.type !== "binary") return false;
  if (node.op === "/" && constantValue(node.right) === 0) return true;
  return findZeroDivision(node.left) || findZeroDivision(node.right);
}

/**
 * É uma soma de métricas somáveis? (lucro − despesas, gasto × 1,1...). Aí a
 * métrica nova também é somável. Qualquer divisão por métrica, multiplicação
 * entre métricas ou uso de uma taxa a torna uma taxa.
 */
function isLinear(node: FormulaNode): boolean {
  switch (node.type) {
    case "number":
      return true;
    case "metric":
      return getMetric(node.id).kind === "sum";
    case "negate":
      return isLinear(node.arg);
    case "binary":
      if (node.op === "+" || node.op === "-") return isLinear(node.left) && isLinear(node.right);
      if (node.op === "*") {
        return (constantValue(node.left) != null && isLinear(node.right)) || (constantValue(node.right) != null && isLinear(node.left));
      }
      return constantValue(node.right) != null && isLinear(node.left);
  }
}

function collectMetrics(node: FormulaNode, out: Set<MetricId>) {
  if (node.type === "metric") out.add(node.id);
  else if (node.type === "negate") collectMetrics(node.arg, out);
  else if (node.type === "binary") {
    collectMetrics(node.left, out);
    collectMetrics(node.right, out);
  }
}

export function parseFormula(source: string): ParsedFormula | FormulaError {
  const text = source ?? "";
  if (!text.trim()) return { ok: false, error: msg.formula.empty, position: 0 };
  if (text.length > FORMULA_MAX_LENGTH) return { ok: false, error: msg.formula.tooLong(FORMULA_MAX_LENGTH), position: FORMULA_MAX_LENGTH };
  try {
    const ast = parseTokens(tokenize(text), text.length);
    const metrics = new Set<MetricId>();
    collectMetrics(ast, metrics);
    if (metrics.size === 0) return { ok: false, error: msg.formula.noMetric, position: 0 };
    if (findZeroDivision(ast)) return { ok: false, error: msg.formula.divideByZero, position: 0 };
    return { ok: true, ast, metrics: [...metrics], kind: isLinear(ast) ? "sum" : "rate" };
  } catch (error) {
    if (error instanceof FormulaSyntaxError) return { ok: false, error: error.message, position: error.position };
    throw error;
  }
}

/**
 * Calcula a fórmula com o valor de cada métrica no período (já refeitas a partir
 * dos totais). Divisão por zero ou métrica sem dado dá null ("sem dado").
 */
export function evaluateFormula(node: FormulaNode, valueOf: (id: MetricId) => number | null): number | null {
  switch (node.type) {
    case "number":
      return node.value;
    case "metric": {
      const v = valueOf(node.id);
      return v == null || !Number.isFinite(v) ? null : v;
    }
    case "negate": {
      const v = evaluateFormula(node.arg, valueOf);
      return v == null ? null : -v;
    }
    case "binary": {
      const l = evaluateFormula(node.left, valueOf);
      const r = evaluateFormula(node.right, valueOf);
      if (l == null || r == null) return null;
      const out = applyOp(node.op, l, r);
      return out == null || !Number.isFinite(out) ? null : out;
    }
  }
}
