import assert from "node:assert/strict";
import { test } from "node:test";

import { change, grossCents, netCents, ratio, summarize, type OrderForMetrics } from "../server/metrics/formulas.ts";

const order = (over: Partial<OrderForMetrics> = {}): OrderForMetrics => ({
  status: "paid",
  totalCents: 10_000,
  refundedCents: 0,
  interestCents: 0,
  gatewayFeeCents: null,
  ...over,
});

test("bruto soma só os pagos e desconta reembolso parcial", () => {
  const orders = [order(), order({ refundedCents: 2_000 }), order({ status: "waiting_payment" }), order({ status: "refunded" })];
  assert.equal(grossCents(orders, false), 18_000);
});

test("juros saem do bruto quando 'contabilizar juros' está desligado", () => {
  const orders = [order({ interestCents: 500 })];
  assert.equal(grossCents(orders, false), 9_500);
  assert.equal(grossCents(orders, true), 10_000);
});

test("líquido desconta a taxa da plataforma de pagamento", () => {
  assert.equal(netCents([order({ gatewayFeeCents: 399 }), order()], false), 19_601);
});

test("ROAS, ROI, margem e CPA", () => {
  const s = summarize({ orders: [order(), order()], spendCents: 5_000, revenueBasis: "net", includeInterest: false });
  assert.equal(s.netCents, 20_000);
  assert.equal(s.profitCents, 15_000);
  assert.equal(s.roas, 4);
  assert.equal(s.roi, 3);
  assert.equal(s.margin, 0.75);
  assert.equal(s.cpaCents, 2_500);
  assert.equal(s.averageTicketCents, 10_000);
});

test("sem gasto o ROAS fica vazio (a tela mostra —), não infinito", () => {
  const s = summarize({ orders: [order()], spendCents: 0, revenueBasis: "net", includeInterest: false });
  assert.equal(s.roas, null);
  assert.equal(s.roi, null);
});

test("sem venda o CPA e a margem ficam vazios", () => {
  const s = summarize({ orders: [], spendCents: 3_000, revenueBasis: "net", includeInterest: false });
  assert.equal(s.cpaCents, null);
  assert.equal(s.margin, null);
  assert.equal(s.profitCents, -3_000);
});

test("impostos e custos entram no lucro", () => {
  const s = summarize({
    orders: [order()],
    spendCents: 2_000,
    metaSpendCents: 2_000,
    revenueBasis: "net",
    includeInterest: false,
    costs: {
      salesTaxBp: 600,
      metaAdsTaxBp: 1_215,
      extraTaxesBp: 0,
      productCostCents: 3_000,
      additionalFeesCents: 100,
      expensesCents: 400,
    },
  });
  // 10.000 − 2.000 − (600 + 243) − 3.000 − 100 − 400
  assert.equal(s.taxesCents, 843);
  assert.equal(s.profitCents, 3_657);
});

test("base bruta usa o bruto no ROAS", () => {
  const s = summarize({
    orders: [order({ gatewayFeeCents: 1_000 })],
    spendCents: 5_000,
    revenueBasis: "gross",
    includeInterest: false,
  });
  assert.equal(s.roas, 2);
});

test("taxas de reembolso e chargeback contam sobre pedidos liquidados", () => {
  const s = summarize({
    orders: [order(), order(), order({ status: "refunded" }), order({ status: "chargedback" }), order({ status: "refused" })],
    spendCents: 0,
    revenueBasis: "net",
    includeInterest: false,
  });
  assert.equal(s.refundRate, 0.25);
  assert.equal(s.chargebackRate, 0.25);
});

test("ratio e change", () => {
  assert.equal(ratio(1, 0), null);
  assert.equal(change(110, 100), 0.1);
  assert.equal(change(5, 0), null);
  assert.equal(change(-50, -100), 0.5);
});
