import assert from "node:assert/strict";
import { test } from "node:test";

import { identityConverter, LOOKBACK_DAYS, makeConverter, shiftDay } from "../server/fx/convert.ts";
import { expensesInRange } from "../server/metrics/costs.ts";
import type { ExpenseRow, FxRateRow } from "../server/store/types.ts";
import { currencySymbol, money, moneyOrZero, percentOrZero, roasOrZero } from "../lib/format.ts";

// 1 BRL = rate unidades da moeda. Sexta 2026-10-09; sábado e domingo sem cotação.
const rates: FxRateRow[] = [
  { date: "2026-10-08", quote: "EUR", rate: 0.2 },
  { date: "2026-10-09", quote: "EUR", rate: 0.16 },
  { date: "2026-10-12", quote: "EUR", rate: 0.25 },
  { date: "2026-10-09", quote: "USD", rate: 0.2 },
];

test("mesma moeda não converte nem conta falta", () => {
  const fx = makeConverter(rates, "BRL");
  assert.equal(fx.cents(12_345, "BRL", "2026-10-09"), 12_345);
  assert.equal(fx.misses(), 0);
});

test("real para euro e euro para real pela cotação do dia", () => {
  const toEur = makeConverter(rates, "EUR");
  assert.equal(toEur.cents(10_000, "BRL", "2026-10-09"), 1_600); // R$ 100 × 0,16
  const toBrl = makeConverter(rates, "BRL");
  assert.equal(toBrl.cents(1_600, "EUR", "2026-10-09"), 10_000);
});

test("dólar para euro passa pelo real (cotação cruzada)", () => {
  const fx = makeConverter(rates, "EUR");
  // US$ 10 = R$ 50 (10 ÷ 0,2) = € 8 (50 × 0,16)
  assert.equal(fx.cents(1_000, "USD", "2026-10-09"), 800);
});

test("fim de semana usa a cotação do último dia útil", () => {
  const fx = makeConverter(rates, "EUR");
  assert.equal(fx.cents(10_000, "BRL", "2026-10-11"), 1_600); // domingo → sexta
  assert.equal(fx.cents(10_000, "BRL", "2026-10-12"), 2_500); // segunda tem a própria
  assert.equal(fx.misses(), 0);
});

test("sem cotação recente, a conversão falha e é contada", () => {
  const fx = makeConverter(rates, "EUR");
  assert.equal(fx.cents(10_000, "BRL", shiftDay("2026-10-12", LOOKBACK_DAYS + 1)), null);
  assert.equal(fx.cents(10_000, "BRL", "2026-10-01"), null); // antes da primeira cotação
  assert.equal(fx.cents(10_000, "GBP", "2026-10-09"), null); // moeda sem cotação
  assert.equal(fx.misses(), 3);
});

test("conversor sem cotações não aceita outra moeda", () => {
  const fx = identityConverter("BRL");
  assert.equal(fx.cents(500, "BRL", "2026-10-09"), 500);
  assert.equal(fx.cents(500, "USD", "2026-10-09"), null);
  assert.equal(fx.misses(), 1);
});

test("despesa mensal em outra moeda: cada ocorrência pela cotação do dia dela", () => {
  const fx = makeConverter(rates, "BRL");
  const expense: ExpenseRow = {
    id: "e",
    dashboardId: "d",
    kind: "recurring",
    category: "tools",
    description: "Ferramenta em euro",
    amountCents: 1_000,
    currency: "EUR",
    date: "2026-09-08",
    endDate: null,
    createdBy: null,
    createdAt: "",
  };
  // Só a ocorrência de 08/10 cai no período: € 10 ÷ 0,2 = R$ 50.
  const result = expensesInRange([expense], { from: "2026-10-01", to: "2026-10-12" }, (a, c, d) => fx.cents(a, c, d) ?? 0);
  assert.equal(result.totalCents, 5_000);
  assert.equal(result.byCategory.tools, 5_000);
});

test("sem número de verdade, os valores aparecem zerados", () => {
  assert.equal(moneyOrZero(null, "BRL"), money(0, "BRL"));
  assert.equal(moneyOrZero(undefined, "EUR"), money(0, "EUR"));
  assert.equal(roasOrZero(null), "0,00");
  assert.equal(roasOrZero(3.456), "3,46");
  assert.equal(percentOrZero(null), "0,0%");
  assert.match(money(0, "BRL"), /^R\$\s0,00$/);
});

test("símbolo das moedas do dashboard", () => {
  assert.equal(currencySymbol("BRL"), "R$");
  assert.equal(currencySymbol("EUR"), "€");
  assert.equal(currencySymbol("GBP"), "£");
  assert.equal(currencySymbol("CHF"), "CHF");
});
