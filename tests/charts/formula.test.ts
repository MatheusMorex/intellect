import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateFormula, FORMULA_MAX_LENGTH, parseFormula, type ParsedFormula } from "../../lib/charts/formula.ts";

const ok = (text: string) => {
  const r = parseFormula(text);
  assert.equal(r.ok, true, `${text}: ${r.ok ? "" : r.error}`);
  return r as ParsedFormula;
};
const fail = (text: string) => {
  const r = parseFormula(text);
  assert.equal(r.ok, false, text);
  return r as { ok: false; error: string; position: number };
};
// Valores de mentira para conferir a conta: lucro 700, vendas 4, gasto 300, ROAS 3.
const values: Record<string, number | null> = { profit: 700, paid: 4, spend: 300, roas: 3, gross: 1000, expenses: 50 };
const calc = (text: string) => evaluateFormula(ok(text).ast, (id) => values[id] ?? null);

test("lê métricas, números e os quatro sinais (inclusive × e ÷)", () => {
  assert.equal(calc("lucro ÷ vendas_pagas"), 175);
  assert.equal(calc("lucro / vendas_pagas"), 175);
  assert.equal(calc("gasto_anuncios × 2"), 600);
  assert.equal(calc("faturamento_bruto − despesas"), 950);
  assert.equal(calc("faturamento_bruto - despesas + 1,5"), 951.5);
  assert.equal(calc("faturamento_bruto * 0.1"), 100);
});

test("acento e maiúscula não importam", () => {
  assert.deepEqual(ok("Lucro ÷ VENDAS_PAGAS").metrics, ["profit", "paid"]);
  assert.deepEqual(ok("lúcro").metrics, ["profit"]);
});

test("multiplicação e divisão antes de soma e subtração; parênteses mudam a ordem; sinal de menos", () => {
  assert.equal(calc("faturamento_bruto - lucro / vendas_pagas"), 825);
  assert.equal(calc("(faturamento_bruto - lucro) / vendas_pagas"), 75);
  assert.equal(calc("-lucro + faturamento_bruto"), 300);
  assert.equal(calc("faturamento_bruto - -despesas"), 1050);
  assert.equal(calc("((lucro))"), 700);
});

test("divisão por zero e métrica sem dado dão 'sem dado'", () => {
  assert.equal(evaluateFormula(ok("lucro / vendas_pagas").ast, (id) => (id === "paid" ? 0 : 700)), null);
  assert.equal(evaluateFormula(ok("lucro + roas").ast, (id) => (id === "roas" ? null : 1)), null);
});

test("somável ou taxa: só soma de métricas somáveis vai para a pizza", () => {
  assert.equal(ok("lucro - despesas").kind, "sum");
  assert.equal(ok("gasto_anuncios * 1,1").kind, "sum");
  assert.equal(ok("2 * gasto_anuncios").kind, "sum");
  assert.equal(ok("faturamento_bruto / 2").kind, "sum");
  assert.equal(ok("-lucro").kind, "sum");
  assert.equal(ok("lucro / vendas_pagas").kind, "rate");
  assert.equal(ok("lucro * vendas_pagas").kind, "rate");
  assert.equal(ok("roas + 1").kind, "rate");
  assert.equal(ok("2 / lucro").kind, "rate");
});

test("erros com mensagem em português e a posição do problema", () => {
  assert.equal(fail("").error, "Escreva a fórmula.");
  assert.equal(fail("   ").error, "Escreva a fórmula.");
  assert.equal(fail("lucro ÷ pedidos").error, "“pedidos” não é uma métrica. Use os nomes da lista.");
  assert.equal(fail("lucro ÷ pedidos").position, 8);
  assert.equal(fail("(lucro + 2").error, "Falta fechar um parêntese.");
  assert.equal(fail("lucro +").error, "A fórmula terminou antes da hora: falta um número, uma métrica ou fechar um parêntese.");
  assert.equal(fail("lucro + * 2").error, "Não entendi “*” neste ponto.");
  assert.equal(fail("lucro 2").error, "Não entendi “2” neste ponto.");
  assert.equal(fail("lucro)").error, "Não entendi “)” neste ponto.");
  assert.equal(fail("lucro % 2").error, "Não entendi “%” neste ponto.");
  assert.equal(fail("2 + 3").error, "Use pelo menos uma métrica na fórmula.");
  assert.equal(fail("lucro / 0").error, "Não dá para dividir por zero.");
  assert.equal(fail("lucro / (2 - 2)").error, "Não dá para dividir por zero.");
  assert.equal(fail("lucro * 1.000,5").error, "“1.000,5” não é um número válido.");
  assert.equal(fail("x".repeat(FORMULA_MAX_LENGTH + 1)).error, `A fórmula pode ter até ${FORMULA_MAX_LENGTH} caracteres.`);
});

test("parênteses demais e fórmula longa demais são recusados", () => {
  assert.equal(fail(`${"(".repeat(11)}lucro${")".repeat(11)}`).error, "Parênteses demais, um dentro do outro.");
  assert.equal(ok(`${"(".repeat(10)}lucro${")".repeat(10)}`).kind, "sum");
  // 41 métricas e 40 sinais (81 partes) cabem nos 200 caracteres, mas passam do limite de partes.
  assert.equal(fail(Array(41).fill("cpa").join("+")).error, "A fórmula está grande demais. Divida em métricas menores.");
});

test("nada do texto vira código", () => {
  for (const attack of ["constructor", "__proto__", "process.exit()", "lucro; alert(1)", "`lucro`", "lucro.toString"]) {
    assert.equal(parseFormula(attack).ok, false, attack);
  }
});
