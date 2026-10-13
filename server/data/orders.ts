// Lista de vendas (S19): pedidos do período com a atribuição, sem dados pessoais do comprador.

import { requireDashboard, type Ctx } from "@/server/access";
import { dayKeyIn, inRange, resolvePeriod, type ResolvedPeriod } from "@/server/period";
import { readStore } from "@/server/store/db";
import type { AttributionStatus, OrderStatus, PaymentMethod } from "@/server/store/types";

export type OrderLine = {
  id: string;
  name: string;
  placedAt: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  totalCents: number;
  currency: string;
  products: string;
  isTest: boolean;
  attribution: {
    status: AttributionStatus;
    platform: "meta" | "google" | null;
    campaign: string | null;
    adSet: string | null;
    ad: string | null;
  };
  utmSource: string | null;
  landingPage: string | null;
};

export const ORDER_STATUS_FILTERS = ["todos", "pagos", "pendentes", "recusados", "reembolsados"] as const;
export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[number];

const STATUS_GROUP: Record<Exclude<OrderStatusFilter, "todos">, OrderStatus[]> = {
  pagos: ["paid"],
  pendentes: ["waiting_payment"],
  recusados: ["refused", "cancelled"],
  reembolsados: ["refunded", "chargedback"],
};

export type OrderList = {
  dashboard: { id: string; name: string; timezone: string };
  period: ResolvedPeriod;
  status: OrderStatusFilter;
  rows: OrderLine[];
  total: number;
  shown: number;
  counts: Record<OrderStatusFilter, number>;
};

export async function listOrders(
  ctx: Ctx,
  dashboardId: string,
  { period: periodId, status = "todos", limit = 100 }: { period?: string; status?: string; limit?: number },
): Promise<OrderList> {
  const { dashboard } = requireDashboard(ctx, dashboardId);
  const store = readStore();
  const storeIds = new Set(store.dashboardStores.filter((l) => l.dashboardId === dashboard.id).map((l) => l.storeId));
  const all = store.orders.filter((o) => storeIds.has(o.storeId));
  const earliest = all.reduce<string | null>((min, o) => {
    const day = dayKeyIn(o.placedAt, dashboard.timezone);
    return !min || day < min ? day : min;
  }, null);
  const period = resolvePeriod(periodId, dashboard.timezone, earliest);
  const inPeriod = all.filter((o) => inRange(dayKeyIn(o.placedAt, dashboard.timezone), period.range));

  const filter: OrderStatusFilter = (ORDER_STATUS_FILTERS as readonly string[]).includes(status)
    ? (status as OrderStatusFilter)
    : "todos";
  const counts = Object.fromEntries(
    ORDER_STATUS_FILTERS.map((f) => [f, f === "todos" ? inPeriod.length : inPeriod.filter((o) => STATUS_GROUP[f].includes(o.status)).length]),
  ) as Record<OrderStatusFilter, number>;
  const filtered = filter === "todos" ? inPeriod : inPeriod.filter((o) => STATUS_GROUP[filter].includes(o.status));
  filtered.sort((a, b) => b.placedAt.localeCompare(a.placedAt));

  const campaigns = new Map(store.campaigns.map((c) => [c.id, c.name]));
  const adSets = new Map(store.adSets.map((s) => [s.id, s.name]));
  const ads = new Map(store.ads.map((a) => [a.id, a.name]));

  const rows = filtered.slice(0, limit).map((o): OrderLine => {
    const items = store.orderItems.filter((i) => i.orderId === o.id);
    return {
      id: o.id,
      name: o.name,
      placedAt: o.placedAt,
      status: o.status,
      paymentMethod: o.paymentMethod,
      totalCents: o.totalCents,
      currency: o.currency,
      products: items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name)).join(", "),
      isTest: o.isTest,
      attribution: {
        status: o.attributionStatus,
        platform: o.attributedPlatform,
        campaign: o.campaignId ? (campaigns.get(o.campaignId) ?? null) : null,
        adSet: o.adSetId ? (adSets.get(o.adSetId) ?? null) : null,
        ad: o.adId ? (ads.get(o.adId) ?? null) : null,
      },
      utmSource: o.utmSource,
      landingPage: o.landingPage,
    };
  });

  return {
    dashboard: { id: dashboard.id, name: dashboard.name, timezone: dashboard.timezone },
    period,
    status: filter,
    rows,
    total: filtered.length,
    shown: rows.length,
    counts,
  };
}
