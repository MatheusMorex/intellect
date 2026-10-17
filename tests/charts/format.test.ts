import assert from "node:assert/strict";
import { test } from "node:test";

import { formatChange, formatMetricValue } from "../../lib/charts/format.ts";
import { money, percentOrZero, roasOrZero } from "../../lib/format.ts";

const NBSP = " ";
const brl = { currency: "BRL" };

test("dinheiro completo sai igual ao resto do app (lib/format.ts)", () => {
  for (const cents of [0, 1, 99, 123_456, -5_000, 987_654_321, -1]) {
    assert.equal(formatMetricValue(cents, "money", brl), money(cents, "BRL"), String(cents));
    assert.equal(formatMetricValue(cents, "money", { currency: "EUR" }), money(cents, "EUR"), String(cents));
  }
  assert.equal(formatMetricValue(123_456, "money", brl), `R$${NBSP}1.234,56`);
  assert.equal(formatMetricValue(-5_000, "money", brl), `−R$${NBSP}50,00`);
});

test("dólar, euro e libra", () => {
  assert.equal(formatMetricValue(1_234, "money", { currency: "USD" }), `US$${NBSP}12,34`);
  assert.equal(formatMetricValue(1_234, "money", { currency: "EUR" }), `€${NBSP}12,34`);
  assert.equal(formatMetricValue(1_234, "money", { currency: "GBP" }), `£${NBSP}12,34`);
});

test("abreviado: 1,2 mil e 3,4 mi; abaixo de mil fica completo", () => {
  assert.equal(formatMetricValue(123_456, "money", { ...brl, style: "compact" }), `R$${NBSP}1,2${NBSP}mil`);
  assert.equal(formatMetricValue(340_000_000, "money", { ...brl, style: "compact" }), `R$${NBSP}3,4${NBSP}mi`);
  assert.equal(formatMetricValue(95_000, "money", { ...brl, style: "compact" }), `R$${NBSP}950,00`);
  assert.equal(formatMetricValue(1_234, "number", { ...brl, style: "compact" }), `1,2${NBSP}mil`);
  assert.equal(formatMetricValue(3_400_000, "number", { ...brl, style: "compact" }), `3,4${NBSP}mi`);
  assert.equal(formatMetricValue(999, "number", { ...brl, style: "compact" }), "999");
});

test("número, percentual e multiplicador", () => {
  assert.equal(formatMetricValue(1_234_567, "number", brl), "1.234.567");
  assert.equal(formatMetricValue(0.125, "percent", brl), "12,5%");
  assert.equal(formatMetricValue(0.125, "percent", { ...brl, decimals: 2 }), "12,50%");
  assert.equal(formatMetricValue(3.2, "multiplier", brl), "3,20x");
  assert.equal(formatMetricValue(3.256, "multiplier", { ...brl, decimals: 1 }), "3,3x");
});

test("sem dado aparece zerado, como no resto do app", () => {
  assert.equal(formatMetricValue(null, "money", brl), `R$${NBSP}0,00`);
  assert.equal(formatMetricValue(null, "money", { currency: "USD" }), `US$${NBSP}0,00`);
  assert.equal(formatMetricValue(null, "multiplier", brl), "0,00x");
  assert.equal(formatMetricValue(null, "percent", brl), percentOrZero(null));
  assert.equal(formatMetricValue(null, "number", brl), "0");
  assert.equal(formatMetricValue(Number.NaN, "money", brl), `R$${NBSP}0,00`);
  assert.equal(formatMetricValue(Number.POSITIVE_INFINITY, "multiplier", brl), "0,00x");
  // O número do ROAS é o mesmo do Resumo; aqui ganha o "x".
  assert.equal(formatMetricValue(4.97, "multiplier", brl), `${roasOrZero(4.97)}x`);
});

test("casas decimais fora do intervalo voltam para o padrão ou são limitadas", () => {
  assert.equal(formatMetricValue(0.125, "percent", { ...brl, decimals: 1.5 }), "12,5%");
  assert.equal(formatMetricValue(0.125, "percent", { ...brl, decimals: 9 }), "12,5000%");
  assert.equal(formatMetricValue(0.125, "percent", { ...brl, decimals: -2 }), "13%");
});

test("variação: sinal explícito, 'Novo' e zerada", () => {
  assert.equal(formatChange({ kind: "pct", value: 0.1234, tone: "good" }), "+12,3%");
  assert.equal(formatChange({ kind: "pct", value: -0.031, tone: "bad" }), "−3,1%");
  assert.equal(formatChange({ kind: "pct", value: 0, tone: "neutral" }), "0,0%");
  assert.equal(formatChange({ kind: "pct", value: 0.00001, tone: "good" }), "0,0%");
  assert.equal(formatChange({ kind: "new", tone: "neutral" }), "Novo");
  assert.equal(formatChange({ kind: "none", tone: "neutral" }), "0,0%");
});
