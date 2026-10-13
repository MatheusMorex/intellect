// Leituras do tracking (S17 Resumo, S18 Meta/Google, S25 badge do card).
// Mesmas assinaturas que a versão com banco vai ter: (ctx, ids, filtros) → dados prontos para a tela.

import { requireDashboard, type Ctx } from "@/server/access";
import { summarize, change, ratio, type Summary } from "@/server/metrics/formulas";
import { dayKeyIn, inRange, resolvePeriod, type DateRange, type ResolvedPeriod } from "@/server/period";
import { readStore } from "@/server/store/db";
import type { AdStatus, DashboardRow, OrderRow, Store } from "@/server/store/types";

export type Provider = "meta" | "google";

function dashboardScope(store: Store, dashboard: DashboardRow) {
  const accountIds = new Set(
    store.dashboardAdAccounts.filter((l) => l.dashboardId === dashboard.id).map((l) => l.adAccountId),
  );
  const storeIds = new Set(store.dashboardStores.filter((l) => l.dashboardId === dashboard.id).map((l) => l.storeId));
  const accounts = store.adAccounts.filter((a) => accountIds.has(a.id));
  return { accountIds, storeIds, accounts };
}

function earliestDay(store: Store, dashboard: DashboardRow): string | null {
  const { accountIds, storeIds } = dashboardScope(store, dashboard);
  let earliest: string | null = null;
  for (const i of store.adInsightsDaily) {
    if (accountIds.has(i.adAccountId) && (!earliest || i.date < earliest)) earliest = i.date;
  }
  for (const o of store.orders) {
    if (!storeIds.has(o.storeId)) continue;
    const day = dayKeyIn(o.placedAt, dashboard.timezone);
    if (!earliest || day < earliest) earliest = day;
  }
  return earliest;
}

function ordersIn(store: Store, dashboard: DashboardRow, range: DateRange) {
  const { storeIds } = dashboardScope(store, dashboard);
  return store.orders.filter(
    (o) => storeIds.has(o.storeId) && !o.isTest && inRange(dayKeyIn(o.placedAt, dashboard.timezone), range),
  );
}

function spendIn(store: Store, dashboard: DashboardRow, range: DateRange, provider?: Provider) {
  const { accounts } = dashboardScope(store, dashboard);
  const ids = new Set(accounts.filter((a) => !provider || a.provider === provider).map((a) => a.id));
  let spend = 0;
  for (const i of store.adInsightsDaily) if (ids.has(i.adAccountId) && inRange(i.date, range)) spend += i.spendCents;
  return spend;
}

function summaryFor(store: Store, dashboard: DashboardRow, range: DateRange): Summary {
  return summarize({
    orders: ordersIn(store, dashboard, range),
    spendCents: spendIn(store, dashboard, range),
    metaSpendCents: spendIn(store, dashboard, range, "meta"),
    revenueBasis: dashboard.revenueBasis,
    includeInterest: dashboard.includeInterest,
  });
}

export function lastSyncedAt(store: Store, dashboard: DashboardRow): string | null {
  const { accounts } = dashboardScope(store, dashboard);
  const times = accounts.map((a) => a.lastSyncedAt).filter((t): t is string => !!t);
  return times.length ? times.sort()[0] : null; // o mais antigo: é o que pode estar atrasado
}

export type DashboardSummary = {
  dashboard: { id: string; name: string; currency: string; timezone: string };
  period: ResolvedPeriod;
  current: Summary;
  previous: Summary | null;
  changes: { net: number | null; spend: number | null; roas: number | null; profit: number | null };
  lastSyncedAt: string | null;
};

export async function getDashboardSummary(ctx: Ctx, dashboardId: string, periodId?: string): Promise<DashboardSummary> {
  const { dashboard } = requireDashboard(ctx, dashboardId);
  const store = readStore();
  const period = resolvePeriod(periodId, dashboard.timezone, earliestDay(store, dashboard));
  const current = summaryFor(store, dashboard, period.range);
  const previous = period.previous ? summaryFor(store, dashboard, period.previous) : null;
  return {
    dashboard: { id: dashboard.id, name: dashboard.name, currency: dashboard.currency, timezone: dashboard.timezone },
    period,
    current,
    previous,
    changes: {
      net: previous ? change(current.netCents, previous.netCents) : null,
      spend: previous ? change(current.spendCents, previous.spendCents) : null,
      roas: previous && current.roas != null && previous.roas != null ? change(current.roas, previous.roas) : null,
      profit: previous ? change(current.profitCents, previous.profitCents) : null,
    },
    lastSyncedAt: lastSyncedAt(store, dashboard),
  };
}

/** Receita de um pedido na base escolhida no dashboard (líquido ou bruto). */
function orderBase(o: OrderRow, dashboard: DashboardRow) {
  if (o.status !== "paid") return 0;
  const gross = o.totalCents - o.refundedCents - (dashboard.includeInterest ? 0 : o.interestCents);
  return dashboard.revenueBasis === "gross" ? gross : gross - (o.gatewayFeeCents ?? 0);
}

export type CampaignLine = {
  id: string;
  name: string;
  status: AdStatus;
  channelType: string | null;
  accountName: string;
  dailyBudgetCents: number | null;
  spendCents: number;
  impressions: number;
  clicks: number;
  addToCarts: number;
  sales: number;
  revenueCents: number;
  profitCents: number;
  roas: number | null;
  cpaCents: number | null;
  ctr: number | null;
  cpcCents: number | null;
  cpmCents: number | null;
};

export type CampaignReport = {
  dashboard: { id: string; name: string; currency: string; adPlatforms: Provider[] };
  provider: Provider;
  connected: boolean;
  period: ResolvedPeriod;
  rows: CampaignLine[];
  totals: Omit<CampaignLine, "id" | "name" | "status" | "channelType" | "accountName" | "dailyBudgetCents">;
  lastSyncedAt: string | null;
};

function line(spend: number, impressions: number, clicks: number, sales: number, revenue: number) {
  return {
    roas: ratio(revenue, spend),
    cpaCents: sales ? Math.round(spend / sales) : null,
    ctr: ratio(clicks, impressions),
    cpcCents: clicks ? Math.round(spend / clicks) : null,
    cpmCents: impressions ? Math.round((spend / impressions) * 1000) : null,
  };
}

export async function getCampaignReport(
  ctx: Ctx,
  dashboardId: string,
  provider: Provider,
  periodId?: string,
): Promise<CampaignReport> {
  const { dashboard } = requireDashboard(ctx, dashboardId);
  const store = readStore();
  const period = resolvePeriod(periodId, dashboard.timezone, earliestDay(store, dashboard));
  const { accounts } = dashboardScope(store, dashboard);
  const providerAccounts = accounts.filter((a) => a.provider === provider);
  const accountIds = new Set(providerAccounts.map((a) => a.id));

  const byCampaign = new Map<string, { spend: number; impressions: number; clicks: number; atc: number; sales: number; revenue: number }>();
  const bucket = (id: string) => {
    let b = byCampaign.get(id);
    if (!b) byCampaign.set(id, (b = { spend: 0, impressions: 0, clicks: 0, atc: 0, sales: 0, revenue: 0 }));
    return b;
  };
  for (const i of store.adInsightsDaily) {
    if (!accountIds.has(i.adAccountId) || !inRange(i.date, period.range)) continue;
    const b = bucket(i.campaignId);
    b.spend += i.spendCents;
    b.impressions += i.impressions;
    b.clicks += i.clicks;
    b.atc += i.addToCarts;
  }
  for (const o of ordersIn(store, dashboard, period.range)) {
    if (o.attributedPlatform !== provider || !o.campaignId || o.status !== "paid") continue;
    const b = bucket(o.campaignId);
    b.sales += 1;
    b.revenue += orderBase(o, dashboard);
  }

  const rows: CampaignLine[] = store.campaigns
    .filter((c) => accountIds.has(c.adAccountId))
    .map((c) => {
      const b = byCampaign.get(c.id) ?? { spend: 0, impressions: 0, clicks: 0, atc: 0, sales: 0, revenue: 0 };
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        channelType: c.channelType,
        accountName: providerAccounts.find((a) => a.id === c.adAccountId)?.name ?? "",
        dailyBudgetCents: c.dailyBudgetCents,
        spendCents: b.spend,
        impressions: b.impressions,
        clicks: b.clicks,
        addToCarts: b.atc,
        sales: b.sales,
        revenueCents: b.revenue,
        profitCents: b.revenue - b.spend,
        ...line(b.spend, b.impressions, b.clicks, b.sales, b.revenue),
      };
    })
    .sort((a, b) => b.spendCents - a.spendCents || a.name.localeCompare(b.name, "pt-BR"));

  const sum = rows.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spendCents,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      atc: acc.atc + r.addToCarts,
      sales: acc.sales + r.sales,
      revenue: acc.revenue + r.revenueCents,
    }),
    { spend: 0, impressions: 0, clicks: 0, atc: 0, sales: 0, revenue: 0 },
  );

  return {
    dashboard: { id: dashboard.id, name: dashboard.name, currency: dashboard.currency, adPlatforms: dashboard.adPlatforms },
    provider,
    connected: providerAccounts.length > 0,
    period,
    rows,
    totals: {
      spendCents: sum.spend,
      impressions: sum.impressions,
      clicks: sum.clicks,
      addToCarts: sum.atc,
      sales: sum.sales,
      revenueCents: sum.revenue,
      profitCents: sum.revenue - sum.spend,
      ...line(sum.spend, sum.impressions, sum.clicks, sum.sales, sum.revenue),
    },
    lastSyncedAt: providerAccounts.map((a) => a.lastSyncedAt).filter((t): t is string => !!t).sort()[0] ?? null,
  };
}

export type CardMetric = {
  label: "ROAS";
  value: number | null;
  trend: "up" | "down" | null;
  targetName: string;
  dashboardId: string;
  provider: Provider | null;
};

/** Badge do card ligado a uma campanha (S25): ROAS dos últimos 7 dias no fuso do dashboard. */
export function getCardMetrics(ctx: Ctx, cardIds: string[]): Map<string, CardMetric> {
  const store = readStore();
  const result = new Map<string, CardMetric>();
  for (const link of store.cardLinks) {
    if (!cardIds.includes(link.cardId) || link.targetType !== "campaign" || !link.campaignId) continue;
    const dashboard = store.dashboards.find((d) => d.id === link.dashboardId);
    if (!dashboard) continue;
    // Quem não é do workspace do dashboard não vê os números (o card continua visível).
    if (!store.workspaceMembers.some((m) => m.workspaceId === dashboard.workspaceId && m.userId === ctx.user.id)) continue;
    const campaign = store.campaigns.find((c) => c.id === link.campaignId);
    if (!campaign) continue;
    const account = store.adAccounts.find((a) => a.id === campaign.adAccountId);
    const period = resolvePeriod("7d", dashboard.timezone, null);
    let spend = 0;
    for (const i of store.adInsightsDaily) {
      if (i.campaignId === campaign.id && inRange(i.date, period.range)) spend += i.spendCents;
    }
    let revenue = 0;
    for (const o of ordersIn(store, dashboard, period.range)) if (o.campaignId === campaign.id) revenue += orderBase(o, dashboard);
    const roas = ratio(revenue, spend);
    result.set(link.cardId, {
      label: "ROAS",
      value: roas,
      trend: roas == null ? null : roas >= 1 ? "up" : "down",
      targetName: campaign.name,
      dashboardId: dashboard.id,
      provider: account?.provider ?? null,
    });
  }
  return result;
}

export function listDashboardsFor(ctx: Ctx) {
  const store = readStore();
  const workspaceIds = new Set(store.workspaceMembers.filter((m) => m.userId === ctx.user.id).map((m) => m.workspaceId));
  return store.dashboards
    .filter((d) => workspaceIds.has(d.workspaceId))
    .map((d) => ({ id: d.id, name: d.name, workspaceId: d.workspaceId, adPlatforms: d.adPlatforms }));
}

/** O sync roda a cada 15 min; passados 2 ciclos sem atualizar, os dados podem estar atrasados. */
export function isStale(lastSynced: string | null, now = Date.now()) {
  return !lastSynced || now - new Date(lastSynced).getTime() > 30 * 60 * 1000;
}
