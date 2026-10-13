import assert from "node:assert/strict";
import { test } from "node:test";

import {
  expenseOccurrences,
  expensesInRange,
  metaAdsTaxCents,
  orderCosts,
  productCostOn,
  settingOn,
  type CostOrder,
} from "../server/metrics/costs.ts";
import type { AdditionalFeeRow, CostSettingRow, ExpenseRow, ProductCostRow } from "../server/store/types.ts";

const setting = (validFrom: string, salesTaxBp: number, metaAdsTaxBp = 0): CostSettingRow => ({
  id: validFrom,
  dashboardId: "d",
  validFrom,
  salesTaxBp,
  metaAdsTaxBp,
  extraTaxes: [],
  createdBy: null,
  createdAt: "",
});

const order = (over: Partial<CostOrder> = {}): CostOrder => ({
  status: "paid",
  totalCents: 10_000,
  refundedCents: 0,
  interestCents: 0,
  gatewayFeeCents: 400,
  paymentMethod: "pix",
  ...over,
});

const fee = (over: Partial<AdditionalFeeRow>): AdditionalFeeRow => ({
  id: "f",
  dashboardId: "d",
  name: "taxa",
  kind: "fixed",
  amountCents: 100,
  bp: null,
  scope: "all",
  productId: null,
  paymentMethod: null,
  validFrom: "2026-01-01",
  validUntil: null,
  createdBy: null,
  createdAt: "",
  ...over,
});

test("o imposto que vale é o do dia da venda", () => {
  const settings = [setting("2026-01-01", 600), setting("2026-06-01", 800)];
  assert.equal(settingOn(settings, "2026-05-31")?.salesTaxBp, 600);
  assert.equal(settingOn(settings, "2026-06-01")?.salesTaxBp, 800);
  assert.equal(settingOn(settings, "2025-12-31"), null);
});

test("custo do produto muda no meio do mês sem refazer o passado", () => {
  const costs: ProductCostRow[] = [
    { id: "1", productId: "p", costCents: 5_000, currency: "BRL", validFrom: "2026-01-01", createdBy: null, createdAt: "" },
    { id: "2", productId: "p", costCents: 6_000, currency: "BRL", validFrom: "2026-10-15", createdBy: null, createdAt: "" },
  ];
  assert.equal(productCostOn(costs, "p", "2026-10-14"), 5_000);
  assert.equal(productCostOn(costs, "p", "2026-10-15"), 6_000);
  assert.equal(productCostOn(costs, "outro", "2026-10-15"), 0);
});

test("custos de um pedido: imposto sobre o líquido, custo por unidade e taxas por alcance", () => {
  const costs = orderCosts(
    order(),
    [{ productId: "p", quantity: 2, totalCents: 10_000 }],
    "2026-10-12",
    {
      settings: [setting("2026-01-01", 600)],
      productCosts: [{ id: "1", productId: "p", costCents: 1_500, currency: "BRL", validFrom: "2026-01-01", createdBy: null, createdAt: "" }],
      fees: [
        fee({ scope: "all", kind: "percent", bp: 100, amountCents: null }),
        fee({ scope: "payment_method", paymentMethod: "pix", amountCents: 50 }),
        fee({ scope: "payment_method", paymentMethod: "boleto", amountCents: 999 }),
        fee({ scope: "product", productId: "p", amountCents: 30 }),
        fee({ validUntil: "2026-10-01" }),
      ],
      includeInterest: false,
    },
  );
  assert.equal(costs.salesTaxCents, 576); // 6% de 9.600
  assert.equal(costs.productCostCents, 3_000);
  assert.equal(costs.feesCents, 100 + 50 + 60);
});

test("pedido não pago não tem custo", () => {
  const costs = orderCosts(order({ status: "refunded" }), [], "2026-10-12", {
    settings: [setting("2026-01-01", 600)],
    productCosts: [],
    fees: [fee({})],
    includeInterest: false,
  });
  assert.deepEqual(costs, { salesTaxCents: 0, extraTaxCents: 0, productCostCents: 0, feesCents: 0 });
});

test("imposto do Meta por dia do gasto", () => {
  const spend = new Map([
    ["2026-05-31", 10_000],
    ["2026-06-01", 10_000],
  ]);
  assert.equal(metaAdsTaxCents(spend, [setting("2026-01-01", 0, 1_000), setting("2026-06-01", 0, 1_215)]), 1_000 + 1_215);
});

test("despesa recorrente cai no mesmo dia de cada mês; dia 31 vira o último dia", () => {
  const e = { kind: "recurring" as const, date: "2026-01-31", endDate: null };
  assert.deepEqual(expenseOccurrences(e, { from: "2026-02-01", to: "2026-04-30" }), ["2026-02-28", "2026-03-31", "2026-04-30"]);
  assert.deepEqual(expenseOccurrences({ ...e, endDate: "2026-03-15" }, { from: "2026-01-01", to: "2026-12-31" }), [
    "2026-01-31",
    "2026-02-28",
  ]);
});

test("despesa única só no dia dela; total por categoria", () => {
  const rows: ExpenseRow[] = [
    { id: "1", dashboardId: "d", kind: "once", category: "tools", description: "x", amountCents: 1_000, currency: "BRL", date: "2026-10-05", endDate: null, createdBy: null, createdAt: "" },
    { id: "2", dashboardId: "d", kind: "recurring", category: "staff", description: "y", amountCents: 500, currency: "BRL", date: "2026-08-10", endDate: null, createdBy: null, createdAt: "" },
  ];
  const result = expensesInRange(rows, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(result.totalCents, 1_500);
  assert.equal(result.byCategory.tools, 1_000);
  assert.equal(result.byCategory.staff, 500);
});
