// S27 Relatório por UTM: as vendas do período agrupadas por um parâmetro de
// rastreio do link (utm_source, utm_medium, utm_campaign, utm_content, utm_term,
// src ou sck), inclusive as que chegaram sem ele (orgânico, direto, link sem UTM).
// Mesmas regras do Resumo e do Meta/Google: período no fuso do dashboard, pedidos
// de teste fora, faturamento na base do dashboard (líquido ou bruto) e os custos
// de cada pedido (produto, taxas e impostos sobre a venda). O gasto com anúncios
// não entra: ele é por campanha, não por parâmetro do link.

import { requireDashboard, type Ctx } from "@/server/access";
import { prepareDashboardFx } from "@/server/fx/rates";
import { ratio } from "@/server/metrics/formulas";
import { dayKeyIn, inRange, type ResolvedPeriod } from "@/server/period";
import { withLiveRead } from "@/server/live/scope";
import type { OrderRow } from "@/server/store/types";

import { buildScope, hasFilters, orderBase, parseFilters, resolveDashboardPeriod, type SearchParams, type TrackingFilters } from "./tracking";

export const UTM_PARAMS = ["source", "medium", "campaign", "content", "term", "src", "sck"] as const;
export type UtmParam = (typeof UTM_PARAMS)[number];

/** O nome do parâmetro como aparece no link. */
export const UTM_NAME: Record<UtmParam, string> = {
  source: "utm_source",
  medium: "utm_medium",
  campaign: "utm_campaign",
  content: "utm_content",
  term: "utm_term",
  src: "src",
  sck: "sck",
};

const FIELD: Record<UtmParam, keyof Pick<OrderRow, "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm" | "src" | "sck">> = {
  source: "utmSource",
  medium: "utmMedium",
  campaign: "utmCampaign",
  content: "utmContent",
  term: "utmTerm",
  src: "src",
  sck: "sck",
};

export type UtmRow = {
  /** O valor do parâmetro; null = vendas que chegaram sem ele. */
  value: string | null;
  /** Pedidos de qualquer situação. */
  orders: number;
  /** Vendas pagas. */
  sales: number;
  revenueCents: number;
  /** Faturamento ÷ vendas pagas. */
  ticketCents: number | null;
  /** Parte do faturamento total do período. */
  share: number | null;
  pendingCents: number;
  refundedCents: number;
  /** Custo dos produtos, taxas e impostos sobre a venda. */
  costsCents: number;
  /** Faturamento − custos, antes do gasto com anúncios. */
  profitCents: number;
  /** Aprovados (pagos, inclusive os reembolsados depois) ÷ pedidos que já se resolveram, como no Resumo. */
  approval: number | null;
};

export type UtmReport = {
  dashboard: { id: string; name: string; currency: string };
  period: ResolvedPeriod;
  param: UtmParam;
  filters: TrackingFilters;
  q: string;
  rows: UtmRow[];
  totals: UtmRow;
  fxUnavailable: boolean;
};

type Acc = Omit<UtmRow, "ticketCents" | "share" | "profitCents" | "approval"> & { approved: number; settled: number };

const empty = (value: string | null): Acc => ({ value, orders: 0, sales: 0, revenueCents: 0, pendingCents: 0, refundedCents: 0, costsCents: 0, approved: 0, settled: 0 });

function finish(a: Acc, totalRevenue: number): UtmRow {
  const { approved, settled, ...rest } = a;
  return {
    ...rest,
    ticketCents: a.sales ? Math.round(a.revenueCents / a.sales) : null,
    share: ratio(a.revenueCents, totalRevenue),
    profitCents: a.revenueCents - a.costsCents,
    approval: ratio(approved, settled),
  };
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function parseUtmParam(value: string | string[] | undefined): UtmParam {
  const one = Array.isArray(value) ? value[0] : value;
  return UTM_PARAMS.includes(one as UtmParam) ? (one as UtmParam) : "campaign";
}

async function getUtmReportImpl(ctx: Ctx, dashboardId: string, sp: SearchParams = {}): Promise<UtmReport> {
  const { dashboard } = requireDashboard(ctx, dashboardId);
  const fx = await prepareDashboardFx(dashboard);
  const store = fx.store;
  const filters = parseFilters(sp);
  const period = resolveDashboardPeriod(store, dashboard, sp);
  const scope = buildScope(store, dashboard, filters, fx.converter);
  const param = parseUtmParam(sp.por);
  const field = FIELD[param];
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? "";

  const groups = new Map<string, Acc>();
  const total = empty(null);
  for (const o of store.orders) {
    if (!scope.orderMatches(o) || !inRange(dayKeyIn(o.placedAt, dashboard.timezone), period.range)) continue;
    // Valor vazio ou só espaços conta como sem o parâmetro; maiúsculas e minúsculas ficam como vieram.
    const value = o[field]?.trim() || null;
    const key = value ?? "";
    let g = groups.get(key);
    if (!g) groups.set(key, (g = empty(value)));
    for (const acc of [g, total]) {
      acc.orders += 1;
      if (o.status === "paid") {
        const c = scope.costsOf(o);
        acc.sales += 1;
        acc.revenueCents += orderBase(o, dashboard);
        acc.costsCents += c.salesTaxCents + c.extraTaxCents + c.productCostCents + c.feesCents;
        acc.refundedCents += o.refundedCents;
      } else if (o.status === "waiting_payment") acc.pendingCents += o.totalCents;
      else if (o.status === "refunded" || o.status === "chargedback") acc.refundedCents += o.totalCents;
      if (o.status !== "waiting_payment" && o.status !== "cancelled") acc.settled += 1;
      if (o.status === "paid" || o.status === "refunded" || o.status === "chargedback") acc.approved += 1;
    }
  }

  const term = normalize(q);
  const rows = [...groups.values()]
    .filter((g) => !term || (g.value !== null && normalize(g.value).includes(term)))
    .map((g) => finish(g, total.revenueCents))
    .sort((a, b) => b.revenueCents - a.revenueCents || b.orders - a.orders || (a.value ?? "").localeCompare(b.value ?? "", "pt-BR"));
  // Com busca, o total é o das linhas que aparecem.
  const shown = term
    ? rows.reduce<Acc>(
        (acc, r) => {
          const g = groups.get(r.value ?? "")!;
          for (const k of ["orders", "sales", "revenueCents", "pendingCents", "refundedCents", "costsCents", "approved", "settled"] as const) acc[k] += g[k];
          return acc;
        },
        empty(null),
      )
    : total;

  return {
    dashboard: { id: dashboard.id, name: dashboard.name, currency: dashboard.currency },
    period,
    param,
    filters,
    q,
    rows,
    totals: finish(shown, total.revenueCents),
    fxUnavailable: fx.converter.misses() > 0,
  };
}

/** Algum filtro de conta, fonte, produto ou campanha escolhido. */
export const utmFiltered = (r: UtmReport) => hasFilters(r.filters);

// ---- modo real (AUTH_MODE=live): a leitura roda sobre o retrato do Supabase, com vendas e anúncios (server/live/scope.ts) ----

export async function getUtmReport(...args: Parameters<typeof getUtmReportImpl>): ReturnType<typeof getUtmReportImpl> {
  return withLiveRead(args[0].user.id, () => getUtmReportImpl(...args), { tracking: true });
}
