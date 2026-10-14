// Custos que entram no lucro (architecture.md, "Custos com data" e "Despesa
// recorrente"). Funções puras; os testes ficam em tests/costs.test.ts.
//
// - imposto e custo de produto usam o valor que valia no dia da venda (valid_from);
// - taxa adicional fixa é por pedido (ou por unidade, quando é de um produto);
// - despesa recorrente repete no mesmo dia de cada mês, de `date` até `endDate`.

import type {
  AdditionalFeeRow,
  CostSettingRow,
  DateKey,
  ExpenseCategory,
  ExpenseRow,
  OrderStatus,
  PaymentMethod,
  ProductCostRow,
} from "../store/types.ts";

export type CostOrder = {
  status: OrderStatus;
  totalCents: number;
  refundedCents: number;
  interestCents: number;
  gatewayFeeCents: number | null;
  paymentMethod: PaymentMethod;
};

export type CostItem = { productId: string | null; quantity: number; totalCents: number };

export type OrderCosts = {
  salesTaxCents: number;
  extraTaxCents: number;
  productCostCents: number;
  feesCents: number;
};

const ZERO: OrderCosts = { salesTaxCents: 0, extraTaxCents: 0, productCostCents: 0, feesCents: 0 };

function latestOn<T extends { validFrom: DateKey }>(rows: T[], day: DateKey): T | null {
  let best: T | null = null;
  for (const r of rows) if (r.validFrom <= day && (!best || r.validFrom > best.validFrom)) best = r;
  return best;
}

export function settingOn(settings: CostSettingRow[], day: DateKey) {
  return latestOn(settings, day);
}

export function productCostOn(costs: ProductCostRow[], productId: string, day: DateKey) {
  return latestOn(
    costs.filter((c) => c.productId === productId),
    day,
  )?.costCents ?? 0;
}

const bp = (value: number, points: number) => Math.round((value * points) / 10000);

export function orderNetCents(order: CostOrder, includeInterest: boolean) {
  return order.totalCents - order.refundedCents - (includeInterest ? 0 : order.interestCents) - (order.gatewayFeeCents ?? 0);
}

export function feeAppliesOn(fee: AdditionalFeeRow, day: DateKey) {
  return fee.validFrom <= day && (!fee.validUntil || fee.validUntil >= day);
}

export function orderCosts(
  order: CostOrder,
  items: CostItem[],
  day: DateKey,
  ctx: {
    settings: CostSettingRow[];
    productCosts: ProductCostRow[];
    fees: AdditionalFeeRow[];
    includeInterest: boolean;
  },
): OrderCosts {
  if (order.status !== "paid") return ZERO;
  const net = orderNetCents(order, ctx.includeInterest);
  const setting = settingOn(ctx.settings, day);
  const salesTaxCents = setting ? bp(net, setting.salesTaxBp) : 0;
  const extraTaxCents = setting ? setting.extraTaxes.reduce((sum, t) => sum + bp(net, t.bp), 0) : 0;

  let productCostCents = 0;
  for (const item of items) {
    if (item.productId) productCostCents += productCostOn(ctx.productCosts, item.productId, day) * item.quantity;
  }

  let feesCents = 0;
  for (const fee of ctx.fees) {
    if (!feeAppliesOn(fee, day)) continue;
    if (fee.scope === "all") {
      feesCents += fee.kind === "fixed" ? (fee.amountCents ?? 0) : bp(order.totalCents, fee.bp ?? 0);
    } else if (fee.scope === "payment_method") {
      if (fee.paymentMethod !== order.paymentMethod) continue;
      feesCents += fee.kind === "fixed" ? (fee.amountCents ?? 0) : bp(order.totalCents, fee.bp ?? 0);
    } else {
      for (const item of items) {
        if (item.productId !== fee.productId) continue;
        feesCents += fee.kind === "fixed" ? (fee.amountCents ?? 0) * item.quantity : bp(item.totalCents, fee.bp ?? 0);
      }
    }
  }
  return { salesTaxCents, extraTaxCents, productCostCents, feesCents };
}

/** Imposto sobre o gasto do Meta: o percentual que valia em cada dia do gasto. */
export function metaAdsTaxCents(spendByDay: Map<DateKey, number>, settings: CostSettingRow[]) {
  let sum = 0;
  for (const [day, spend] of spendByDay) {
    const setting = settingOn(settings, day);
    if (setting) sum += bp(spend, setting.metaAdsTaxBp);
  }
  return sum;
}

function addMonths(day: DateKey, months: number, wantedDay: number): DateKey {
  const [y, m] = day.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = Math.min(wantedDay, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Datas em que a despesa cai dentro do período. */
export function expenseOccurrences(expense: Pick<ExpenseRow, "kind" | "date" | "endDate">, range: { from: DateKey; to: DateKey }) {
  if (expense.kind === "once") return expense.date >= range.from && expense.date <= range.to ? [expense.date] : [];
  const wanted = Number(expense.date.slice(8, 10));
  const out: DateKey[] = [];
  for (let i = 0; i < 1200; i++) {
    const day = addMonths(expense.date, i, wanted);
    if (day > range.to || (expense.endDate && day > expense.endDate)) break;
    if (day >= range.from) out.push(day);
  }
  return out;
}

/** Converte um valor para a moeda do dashboard pela cotação do dia (server/fx). */
export type ConvertCents = (amountCents: number, currency: string, day: DateKey) => number;

const sameCurrency: ConvertCents = (amount) => amount;

/** Soma das despesas no período; cada ocorrência é convertida pela cotação do dia dela. */
export function expensesInRange(expenses: ExpenseRow[], range: { from: DateKey; to: DateKey }, convert: ConvertCents = sameCurrency) {
  const byCategory: Record<ExpenseCategory, number> = { traffic: 0, tools: 0, staff: 0, accounting: 0, other: 0 };
  let totalCents = 0;
  for (const e of expenses) {
    let value = 0;
    for (const day of expenseOccurrences(e, range)) value += convert(e.amountCents, e.currency, day);
    byCategory[e.category] += value;
    totalCents += value;
  }
  return { totalCents, byCategory };
}
