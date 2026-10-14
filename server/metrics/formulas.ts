// Todas as fórmulas do tracking, num arquivo só (architecture.md, "Métricas:
// definições fixadas"). Funções puras, sem banco: os testes em
// tests/formulas.test.ts rodam com `npm test`.
//
// Dinheiro em centavos; percentuais em pontos-base (650 = 6,50%).

import type { OrderStatus } from "../store/types.ts";

export type OrderForMetrics = {
  status: OrderStatus;
  totalCents: number;
  refundedCents: number;
  interestCents: number;
  gatewayFeeCents: number | null;
};

export type CostInputs = {
  salesTaxBp: number; // imposto sobre vendas, sobre o líquido
  metaAdsTaxBp: number; // imposto sobre o gasto no Meta
  extraTaxesBp: number; // impostos extras, sobre o líquido
  productCostCents: number; // custo dos produtos vendidos no período
  additionalFeesCents: number;
  expensesCents: number;
  /** Impostos já somados dia a dia (o percentual muda com o tempo); quando vem, ignora os bp acima. */
  taxesCents?: number;
};

export const NO_COSTS: CostInputs = {
  salesTaxBp: 0,
  metaAdsTaxBp: 0,
  extraTaxesBp: 0,
  productCostCents: 0,
  additionalFeesCents: 0,
  expensesCents: 0,
};

export type Summary = {
  grossCents: number;
  netCents: number;
  baseCents: number;
  spendCents: number;
  taxesCents: number;
  profitCents: number;
  paidCount: number;
  pendingCount: number;
  refundedCount: number;
  chargebackCount: number;
  roas: number | null;
  roi: number | null;
  margin: number | null;
  cpaCents: number | null;
  averageTicketCents: number | null;
  refundRate: number | null;
  chargebackRate: number | null;
};

/** a ÷ b, ou null quando b é zero (a tela mostra zerado: 0,00 ou 0,0%). */
export function ratio(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

function bp(valueCents: number, basisPoints: number) {
  return Math.round((valueCents * basisPoints) / 10000);
}

/** Bruto = Σ pagos − reembolsos parciais − juros (se "contabilizar juros" estiver desligado). */
export function grossCents(orders: OrderForMetrics[], includeInterest: boolean) {
  let sum = 0;
  for (const o of orders) {
    if (o.status !== "paid") continue;
    sum += o.totalCents - o.refundedCents - (includeInterest ? 0 : o.interestCents);
  }
  return sum;
}

/** Líquido = bruto − taxa da plataforma de pagamento (quando a Shopify informa). */
export function netCents(orders: OrderForMetrics[], includeInterest: boolean) {
  let fees = 0;
  for (const o of orders) if (o.status === "paid") fees += o.gatewayFeeCents ?? 0;
  return grossCents(orders, includeInterest) - fees;
}

export function summarize({
  orders,
  spendCents,
  metaSpendCents = 0,
  revenueBasis,
  includeInterest,
  costs = NO_COSTS,
}: {
  orders: OrderForMetrics[];
  spendCents: number;
  metaSpendCents?: number;
  revenueBasis: "net" | "gross";
  includeInterest: boolean;
  costs?: CostInputs;
}): Summary {
  const gross = grossCents(orders, includeInterest);
  const net = netCents(orders, includeInterest);
  const base = revenueBasis === "gross" ? gross : net;
  const taxes =
    costs.taxesCents ?? bp(net, costs.salesTaxBp) + bp(metaSpendCents, costs.metaAdsTaxBp) + bp(net, costs.extraTaxesBp);
  const profit =
    net - spendCents - taxes - costs.productCostCents - costs.additionalFeesCents - costs.expensesCents;

  let paid = 0;
  let pending = 0;
  let refunded = 0;
  let chargeback = 0;
  for (const o of orders) {
    if (o.status === "paid") paid++;
    else if (o.status === "waiting_payment") pending++;
    else if (o.status === "refunded") refunded++;
    else if (o.status === "chargedback") chargeback++;
  }
  const settled = paid + refunded + chargeback;

  return {
    grossCents: gross,
    netCents: net,
    baseCents: base,
    spendCents,
    taxesCents: taxes,
    profitCents: profit,
    paidCount: paid,
    pendingCount: pending,
    refundedCount: refunded,
    chargebackCount: chargeback,
    roas: ratio(base, spendCents),
    roi: ratio(profit, spendCents),
    margin: ratio(profit, base),
    cpaCents: paid === 0 ? null : Math.round(spendCents / paid),
    averageTicketCents: paid === 0 ? null : Math.round(gross / paid),
    refundRate: ratio(refunded, settled),
    chargebackRate: ratio(chargeback, settled),
  };
}

/** Variação entre dois períodos, em fração (0,124 = +12,4%); null sem base de comparação. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
