// Leituras do tracking: S17 Resumo, S18 Meta/Google, S25 badge do card.
// Assinaturas pensadas para a versão com banco: (ctx, ids, filtros) → dados prontos para a tela.

import { requireDashboard, type Ctx } from "@/server/access";
import { expensesInRange, metaAdsTaxCents, orderCosts, type OrderCosts } from "@/server/metrics/costs";
import { change, ratio, summarize, type Summary } from "@/server/metrics/formulas";
import { dayKeyIn, inRange, resolvePeriod, type DateRange, type ResolvedPeriod } from "@/server/period";
import { readStore } from "@/server/store/db";
import type {
  AdStatus,
  DashboardRow,
  ExpenseCategory,
  OrderItemRow,
  OrderRow,
  PaymentMethod,
  Store,
} from "@/server/store/types";

export type Provider = "meta" | "google";
export type Source = "meta" | "google" | "other" | "untracked";

// ---- filtros --------------------------------------------------------------------------

export type TrackingFilters = { accounts: string[]; products: string[]; sources: Source[] };
export type SearchParams = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : (v ?? ""))
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function parseFilters(sp: SearchParams): TrackingFilters {
  const sources = list(sp.fonte).filter((s): s is Source => ["meta", "google", "other", "untracked"].includes(s));
  return { accounts: list(sp.conta), products: list(sp.produto), sources };
}

export function periodParams(sp: SearchParams) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return { periodo: one(sp.periodo), de: one(sp.de), ate: one(sp.ate) };
}

export function sourceOf(o: Pick<OrderRow, "attributionStatus" | "attributedPlatform">): Source {
  if (o.attributionStatus === "tracked" && o.attributedPlatform) return o.attributedPlatform;
  if (o.attributionStatus === "other_source") return "other";
  return "untracked";
}

// ---- contexto de cálculo (índices para não varrer tudo a cada linha) ---------------------

type Scope = ReturnType<typeof buildScope>;

function buildScope(store: Store, dashboard: DashboardRow, filters: TrackingFilters) {
  const linkedAccounts = new Set(
    store.dashboardAdAccounts.filter((l) => l.dashboardId === dashboard.id).map((l) => l.adAccountId),
  );
  const accounts = store.adAccounts.filter((a) => linkedAccounts.has(a.id));
  const storeIds = new Set(store.dashboardStores.filter((l) => l.dashboardId === dashboard.id).map((l) => l.storeId));
  const campaignAccount = new Map(store.campaigns.map((c) => [c.id, c.adAccountId]));
  const accountProvider = new Map(accounts.map((a) => [a.id, a.provider]));
  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const i of store.orderItems) {
    const arr = itemsByOrder.get(i.orderId);
    if (arr) arr.push(i);
    else itemsByOrder.set(i.orderId, [i]);
  }

  // Contas que entram no gasto: as escolhidas, e só das plataformas da fonte escolhida.
  const spendAccounts = new Set(
    accounts
      .filter((a) => filters.accounts.length === 0 || filters.accounts.includes(a.id))
      .filter((a) => filters.sources.length === 0 || filters.sources.includes(a.provider))
      .map((a) => a.id),
  );

  const orderMatches = (o: OrderRow) => {
    if (!storeIds.has(o.storeId) || o.isTest) return false;
    if (filters.sources.length && !filters.sources.includes(sourceOf(o))) return false;
    if (filters.accounts.length) {
      const account = o.campaignId ? campaignAccount.get(o.campaignId) : undefined;
      if (!account || !filters.accounts.includes(account)) return false;
    }
    if (filters.products.length) {
      const items = itemsByOrder.get(o.id) ?? [];
      if (!items.some((i) => i.productId && filters.products.includes(i.productId))) return false;
    }
    return true;
  };

  const costCtx = {
    settings: store.costSettings.filter((c) => c.dashboardId === dashboard.id),
    productCosts: store.productCosts,
    fees: store.additionalFees.filter((f) => f.dashboardId === dashboard.id),
    includeInterest: dashboard.includeInterest,
  };

  const costsOf = (o: OrderRow): OrderCosts =>
    orderCosts(
      o,
      (itemsByOrder.get(o.id) ?? []).map((i) => ({ productId: i.productId, quantity: i.quantity, totalCents: i.totalCents })),
      dayKeyIn(o.placedAt, dashboard.timezone),
      costCtx,
    );

  return { accounts, storeIds, campaignAccount, accountProvider, itemsByOrder, spendAccounts, orderMatches, costCtx, costsOf };
}

function earliestDay(store: Store, dashboard: DashboardRow): string | null {
  const scope = buildScope(store, dashboard, { accounts: [], products: [], sources: [] });
  let earliest: string | null = null;
  for (const i of store.adInsightsDaily) {
    if (scope.spendAccounts.has(i.adAccountId) && (!earliest || i.date < earliest)) earliest = i.date;
  }
  for (const o of store.orders) {
    if (!scope.storeIds.has(o.storeId)) continue;
    const day = dayKeyIn(o.placedAt, dashboard.timezone);
    if (!earliest || day < earliest) earliest = day;
  }
  return earliest;
}

function resolve(store: Store, dashboard: DashboardRow, sp: SearchParams) {
  const p = periodParams(sp);
  return resolvePeriod(p.periodo, dashboard.timezone, earliestDay(store, dashboard), new Date(), { de: p.de, ate: p.ate });
}

/** Receita de um pedido na base do dashboard (líquido ou bruto). */
function orderBase(o: OrderRow, dashboard: DashboardRow) {
  if (o.status !== "paid") return 0;
  const gross = o.totalCents - o.refundedCents - (dashboard.includeInterest ? 0 : o.interestCents);
  return dashboard.revenueBasis === "gross" ? gross : gross - (o.gatewayFeeCents ?? 0);
}

// ---- Resumo (S17) --------------------------------------------------------------------------

type Totals = Summary & {
  spendMetaCents: number;
  spendGoogleCents: number;
  salesTaxCents: number;
  extraTaxCents: number;
  metaAdsTaxCents: number;
  productCostCents: number;
  feesCents: number;
  expensesCents: number;
  pendingValueCents: number;
  expensesByCategory: Record<ExpenseCategory, number>;
};

function totalsFor(store: Store, dashboard: DashboardRow, scope: Scope, range: DateRange, filtered: boolean): Totals {
  const orders = store.orders.filter(
    (o) => scope.orderMatches(o) && inRange(dayKeyIn(o.placedAt, dashboard.timezone), range),
  );
  let spendMeta = 0;
  let spendGoogle = 0;
  const metaByDay = new Map<string, number>();
  for (const i of store.adInsightsDaily) {
    if (!scope.spendAccounts.has(i.adAccountId) || !inRange(i.date, range)) continue;
    if (scope.accountProvider.get(i.adAccountId) === "meta") {
      spendMeta += i.spendCents;
      metaByDay.set(i.date, (metaByDay.get(i.date) ?? 0) + i.spendCents);
    } else spendGoogle += i.spendCents;
  }
  let salesTax = 0;
  let extraTax = 0;
  let productCost = 0;
  let fees = 0;
  let pendingValue = 0;
  for (const o of orders) {
    const c = scope.costsOf(o);
    salesTax += c.salesTaxCents;
    extraTax += c.extraTaxCents;
    productCost += c.productCostCents;
    fees += c.feesCents;
    if (o.status === "waiting_payment") pendingValue += o.totalCents;
  }
  const metaTax = metaAdsTaxCents(metaByDay, scope.costCtx.settings);
  // Despesas só entram no Resumo sem filtro de produto, conta ou fonte (não dá para dividir uma conta de luz).
  const expenses = expensesInRange(
    store.expenses.filter((e) => e.dashboardId === dashboard.id),
    range,
  );
  const expensesCents = filtered ? 0 : expenses.totalCents;

  const summary = summarize({
    orders,
    spendCents: spendMeta + spendGoogle,
    metaSpendCents: spendMeta,
    revenueBasis: dashboard.revenueBasis,
    includeInterest: dashboard.includeInterest,
    costs: {
      salesTaxBp: 0,
      metaAdsTaxBp: 0,
      extraTaxesBp: 0,
      taxesCents: salesTax + extraTax + metaTax,
      productCostCents: productCost,
      additionalFeesCents: fees,
      expensesCents,
    },
  });
  return {
    ...summary,
    spendMetaCents: spendMeta,
    spendGoogleCents: spendGoogle,
    salesTaxCents: salesTax,
    extraTaxCents: extraTax,
    metaAdsTaxCents: metaTax,
    productCostCents: productCost,
    feesCents: fees,
    expensesCents,
    pendingValueCents: pendingValue,
    expensesByCategory: expenses.byCategory,
  };
}

export type ChartPoint = { key: string; label: string; valueCents: number; count: number };
export type ApprovalPoint = { key: PaymentMethod; label: string; approved: number; total: number; rate: number | null };

const METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  credit_card: "Cartão",
  boleto: "Boleto",
  paypal: "PayPal",
  other: "Outros",
};
const SOURCE_LABEL: Record<Source, string> = { meta: "Meta", google: "Google", other: "Outras fontes", untracked: "Não rastreadas" };

function charts(store: Store, dashboard: DashboardRow, scope: Scope, range: DateRange) {
  const orders = store.orders.filter(
    (o) => scope.orderMatches(o) && inRange(dayKeyIn(o.placedAt, dashboard.timezone), range),
  );
  const paid = orders.filter((o) => o.status === "paid");
  const products = new Map(store.products.map((p) => [p.id, p.name]));

  const byProduct = new Map<string, ChartPoint>();
  for (const o of paid) {
    for (const i of scope.itemsByOrder.get(o.id) ?? []) {
      const key = i.productId ?? i.name;
      const point = byProduct.get(key) ?? { key, label: (i.productId && products.get(i.productId)) || i.name, valueCents: 0, count: 0 };
      point.valueCents += i.totalCents;
      point.count += i.quantity;
      byProduct.set(key, point);
    }
  }

  const methods: PaymentMethod[] = ["pix", "credit_card", "boleto", "other"];
  const methodOf = (m: PaymentMethod): PaymentMethod => (m === "paypal" ? "other" : m);
  const byPayment = methods.map((m) => {
    const rows = paid.filter((o) => methodOf(o.paymentMethod) === m);
    return { key: m, label: METHOD_LABEL[m], valueCents: rows.reduce((s, o) => s + orderBase(o, dashboard), 0), count: rows.length };
  });

  const sources: Source[] = ["meta", "google", "other", "untracked"];
  const bySource = sources.map((src) => {
    const rows = paid.filter((o) => sourceOf(o) === src);
    return { key: src, label: SOURCE_LABEL[src], valueCents: rows.reduce((s, o) => s + orderBase(o, dashboard), 0), count: rows.length };
  });

  // Aprovação: pagos (e depois reembolsados) sobre tudo que tentou pagar, menos os ainda pendentes.
  const approval: ApprovalPoint[] = methods.map((m) => {
    const rows = orders.filter((o) => methodOf(o.paymentMethod) === m && o.status !== "waiting_payment" && o.status !== "cancelled");
    const approved = rows.filter((o) => o.status === "paid" || o.status === "refunded" || o.status === "chargedback").length;
    return { key: m, label: METHOD_LABEL[m], approved, total: rows.length, rate: ratio(approved, rows.length) };
  });

  return {
    byProduct: [...byProduct.values()].sort((a, b) => b.valueCents - a.valueCents),
    byPayment,
    bySource,
    approval,
  };
}

export type DashboardSummary = {
  dashboard: { id: string; name: string; currency: string; timezone: string; adPlatforms: Provider[] };
  period: ResolvedPeriod;
  filters: TrackingFilters;
  current: Totals;
  previous: Totals | null;
  changes: Record<"net" | "spend" | "roas" | "profit" | "roi" | "margin", number | null>;
  charts: ReturnType<typeof charts>;
  lastSyncedAt: string | null;
  setupIncomplete: string[];
};

export async function getDashboardSummary(ctx: Ctx, dashboardId: string, sp: SearchParams = {}): Promise<DashboardSummary> {
  const { dashboard } = requireDashboard(ctx, dashboardId);
  const store = readStore();
  const filters = parseFilters(sp);
  const period = resolve(store, dashboard, sp);
  const scope = buildScope(store, dashboard, filters);
  const filtered = filters.accounts.length + filters.products.length + filters.sources.length > 0;
  const current = totalsFor(store, dashboard, scope, period.range, filtered);
  const previous = period.previous ? totalsFor(store, dashboard, scope, period.previous, filtered) : null;
  const ch = (a: number | null, b: number | null | undefined) => (previous && a != null && b != null ? change(a, b) : null);

  const setupIncomplete: string[] = [];
  for (const p of dashboard.adPlatforms) {
    if (!scope.accounts.some((a) => a.provider === p)) setupIncomplete.push(p === "meta" ? "conectar o Meta Ads" : "conectar o Google Ads");
  }
  if (scope.storeIds.size === 0) setupIncomplete.push("conectar a loja Shopify");

  return {
    dashboard: {
      id: dashboard.id,
      name: dashboard.name,
      currency: dashboard.currency,
      timezone: dashboard.timezone,
      adPlatforms: dashboard.adPlatforms,
    },
    period,
    filters,
    current,
    previous,
    changes: {
      net: ch(current.netCents, previous?.netCents),
      spend: ch(current.spendCents, previous?.spendCents),
      roas: ch(current.roas, previous?.roas),
      profit: ch(current.profitCents, previous?.profitCents),
      roi: ch(current.roi, previous?.roi),
      margin: ch(current.margin, previous?.margin),
    },
    charts: charts(store, dashboard, scope, period.range),
    lastSyncedAt: lastSyncedAt(store, dashboard),
    setupIncomplete,
  };
}

export async function getFilterOptions(ctx: Ctx, dashboardId: string) {
  const { dashboard } = requireDashboard(ctx, dashboardId);
  const store = readStore();
  const scope = buildScope(store, dashboard, { accounts: [], products: [], sources: [] });
  return {
    accounts: scope.accounts.map((a) => ({ value: a.id, label: `${a.provider === "meta" ? "Meta" : "Google"} · ${a.name}` })),
    products: store.products
      .filter((p) => scope.storeIds.has(p.storeId))
      .map((p) => ({ value: p.id, label: p.name }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    sources: (["meta", "google", "other", "untracked"] as Source[])
      .filter((s) => s === "other" || s === "untracked" || dashboard.adPlatforms.includes(s))
      .map((s) => ({ value: s, label: SOURCE_LABEL[s] })),
  };
}

export function lastSyncedAt(store: Store, dashboard: DashboardRow): string | null {
  const ids = new Set(store.dashboardAdAccounts.filter((l) => l.dashboardId === dashboard.id).map((l) => l.adAccountId));
  const times = store.adAccounts
    .filter((a) => ids.has(a.id) && a.syncEnabled)
    .map((a) => a.lastSyncedAt)
    .filter((t): t is string => !!t);
  return times.length ? times.sort()[0] : null; // o mais antigo: é o que pode estar atrasado
}

/** O sync roda a cada 15 min; passados 2 ciclos sem atualizar, os dados podem estar atrasados. */
export function isStale(lastSynced: string | null, now = Date.now()) {
  return !lastSynced || now - new Date(lastSynced).getTime() > 30 * 60 * 1000;
}

// ---- Relatório de tráfego (S18) ---------------------------------------------------------------

export type ReportLevel = "contas" | "campanhas" | "conjuntos" | "anuncios" | "palavras";

export type ReportRow = {
  id: string;
  level: ReportLevel;
  name: string;
  parent: string | null;
  status: AdStatus | "connected";
  channelType: string | null;
  dailyBudgetCents: number | null;
  targetCpaCents: number | null;
  spendCents: number;
  impressions: number;
  clicks: number;
  addToCarts: number;
  sales: number;
  revenueCents: number;
  profitCents: number;
  roas: number | null;
  roi: number | null;
  margin: number | null;
  cpaCents: number | null;
  ctr: number | null;
  cpcCents: number | null;
  cpmCents: number | null;
  costPerAddToCartCents: number | null;
};

export type TrafficReport = {
  dashboard: { id: string; name: string; currency: string; adPlatforms: Provider[] };
  provider: Provider;
  connected: boolean;
  period: ResolvedPeriod;
  level: ReportLevel;
  levels: ReportLevel[];
  parentFilter: { level: ReportLevel; id: string; name: string } | null;
  rows: ReportRow[];
  totals: ReportRow;
  lastSyncedAt: string | null;
  canManage: boolean;
};

type Bucket = { spend: number; impressions: number; clicks: number; atc: number; sales: number; revenue: number; costs: number };
const emptyBucket = (): Bucket => ({ spend: 0, impressions: 0, clicks: 0, atc: 0, sales: 0, revenue: 0, costs: 0 });

function metrics(b: Bucket, metaTaxBp: number) {
  const spendTax = Math.round((b.spend * metaTaxBp) / 10000);
  const profit = b.revenue - b.spend - b.costs - spendTax;
  return {
    spendCents: b.spend,
    impressions: b.impressions,
    clicks: b.clicks,
    addToCarts: b.atc,
    sales: b.sales,
    revenueCents: b.revenue,
    profitCents: profit,
    roas: ratio(b.revenue, b.spend),
    roi: ratio(profit, b.spend),
    margin: ratio(profit, b.revenue),
    cpaCents: b.sales ? Math.round(b.spend / b.sales) : null,
    ctr: ratio(b.clicks, b.impressions),
    cpcCents: b.clicks ? Math.round(b.spend / b.clicks) : null,
    cpmCents: b.impressions ? Math.round((b.spend / b.impressions) * 1000) : null,
    costPerAddToCartCents: b.atc ? Math.round(b.spend / b.atc) : null,
  };
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const STATUS_FILTERS: Record<string, AdStatus[]> = {
  ativos: ["active"],
  pausados: ["paused"],
  restricoes: ["rejected", "with_issues", "in_review"],
};

export async function getTrafficReport(
  ctx: Ctx,
  dashboardId: string,
  provider: Provider,
  sp: SearchParams = {},
): Promise<TrafficReport> {
  const { dashboard, role } = requireDashboard(ctx, dashboardId);
  const store = readStore();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const period = resolve(store, dashboard, sp);
  const scope = buildScope(store, dashboard, { accounts: [], products: [], sources: [] });
  const accounts = scope.accounts.filter((a) => a.provider === provider);
  const accountIds = new Set(accounts.map((a) => a.id));
  const levels: ReportLevel[] =
    provider === "google" ? ["contas", "campanhas", "conjuntos", "anuncios", "palavras"] : ["contas", "campanhas", "conjuntos", "anuncios"];
  const requested = one(sp.nivel) as ReportLevel | undefined;
  const level: ReportLevel = requested && levels.includes(requested) ? requested : "campanhas";
  const setting = scope.costCtx.settings.filter((s) => s.validFrom <= period.range.to).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0];
  const metaTaxBp = provider === "meta" ? (setting?.metaAdsTaxBp ?? 0) : 0;

  // Filtro pelo pai (clicar numa campanha abre os conjuntos dela).
  const campaignFilter = one(sp.campanha) ?? null;
  const adSetFilter = one(sp.conjunto) ?? null;
  const accountFilter = one(sp.conta) ?? null;

  const campaigns = store.campaigns.filter((c) => accountIds.has(c.adAccountId));
  const campaignIds = new Set(campaigns.map((c) => c.id));
  const adSets = store.adSets.filter((s) => campaignIds.has(s.campaignId));
  const ads = store.ads.filter((a) => campaignIds.has(a.campaignId));
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const adSetName = new Map(adSets.map((s) => [s.id, s.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  const insights = store.adInsightsDaily.filter((i) => accountIds.has(i.adAccountId) && inRange(i.date, period.range));
  const orders = store.orders.filter(
    (o) =>
      scope.storeIds.has(o.storeId) &&
      !o.isTest &&
      o.status === "paid" &&
      o.attributedPlatform === provider &&
      inRange(dayKeyIn(o.placedAt, dashboard.timezone), period.range),
  );

  const bucketBy = (keyOfInsight: (i: (typeof insights)[number]) => string | null, keyOfOrder: (o: OrderRow) => string | null) => {
    const map = new Map<string, Bucket>();
    const get = (k: string) => {
      let b = map.get(k);
      if (!b) map.set(k, (b = emptyBucket()));
      return b;
    };
    for (const i of insights) {
      const k = keyOfInsight(i);
      if (!k) continue;
      const b = get(k);
      b.spend += i.spendCents;
      b.impressions += i.impressions;
      b.clicks += i.clicks;
      b.atc += i.addToCarts;
    }
    for (const o of orders) {
      const k = keyOfOrder(o);
      if (!k) continue;
      const b = get(k);
      const c = scope.costsOf(o);
      b.sales += 1;
      b.revenue += orderBase(o, dashboard);
      b.costs += c.salesTaxCents + c.extraTaxCents + c.productCostCents + c.feesCents;
    }
    return map;
  };

  let rows: ReportRow[] = [];
  let parentFilter: TrafficReport["parentFilter"] = null;
  const base = (id: string, name: string, extra: Partial<ReportRow>, b: Bucket | undefined): ReportRow => ({
    id,
    level,
    name,
    parent: null,
    status: "active",
    channelType: null,
    dailyBudgetCents: null,
    targetCpaCents: null,
    ...metrics(b ?? emptyBucket(), metaTaxBp),
    ...extra,
  });

  if (level === "contas") {
    const map = bucketBy(
      (i) => i.adAccountId,
      (o) => (o.campaignId ? (scope.campaignAccount.get(o.campaignId) ?? null) : null),
    );
    rows = accounts.map((a) =>
      base(a.id, a.name, { status: a.status === "active" ? "connected" : "unknown", parent: a.externalId }, map.get(a.id)),
    );
  } else if (level === "campanhas") {
    const map = bucketBy(
      (i) => i.campaignId,
      (o) => o.campaignId,
    );
    if (accountFilter && accountName.has(accountFilter)) parentFilter = { level: "contas", id: accountFilter, name: accountName.get(accountFilter)! };
    rows = campaigns
      .filter((c) => !parentFilter || c.adAccountId === parentFilter.id)
      .map((c) =>
        base(
          c.id,
          c.name,
          {
            status: c.status,
            channelType: c.channelType,
            dailyBudgetCents: c.dailyBudgetCents,
            targetCpaCents: c.targetCpaCents,
            parent: accountName.get(c.adAccountId) ?? null,
          },
          map.get(c.id),
        ),
      );
  } else if (level === "conjuntos") {
    const map = bucketBy(
      (i) => i.adSetId,
      (o) => o.adSetId,
    );
    if (campaignFilter && campaignName.has(campaignFilter)) parentFilter = { level: "campanhas", id: campaignFilter, name: campaignName.get(campaignFilter)! };
    rows = adSets
      .filter((s) => !parentFilter || s.campaignId === parentFilter.id)
      .map((s) =>
        base(s.id, s.name, { status: s.status, dailyBudgetCents: s.dailyBudgetCents, parent: campaignName.get(s.campaignId) ?? null }, map.get(s.id)),
      );
  } else if (level === "anuncios") {
    const map = bucketBy(
      (i) => i.adId,
      (o) => o.adId,
    );
    if (adSetFilter && adSetName.has(adSetFilter)) parentFilter = { level: "conjuntos", id: adSetFilter, name: adSetName.get(adSetFilter)! };
    else if (campaignFilter && campaignName.has(campaignFilter))
      parentFilter = { level: "campanhas", id: campaignFilter, name: campaignName.get(campaignFilter)! };
    rows = ads
      .filter((a) => !parentFilter || (parentFilter.level === "conjuntos" ? a.adSetId === parentFilter.id : a.campaignId === parentFilter.id))
      .map((a) =>
        base(a.id, a.name, { status: a.status, parent: `${campaignName.get(a.campaignId) ?? ""} › ${adSetName.get(a.adSetId) ?? ""}` }, map.get(a.id)),
      );
  } else {
    // Palavras-chave: gasto próprio (fora dos totais da conta) e vendas pela utm_term no mesmo grupo.
    const words = store.keywords.filter((k) => accountIds.has(k.adAccountId));
    if (adSetFilter && adSetName.has(adSetFilter)) parentFilter = { level: "conjuntos", id: adSetFilter, name: adSetName.get(adSetFilter)! };
    const map = new Map<string, Bucket>();
    for (const ki of store.keywordInsightsDaily) {
      if (!inRange(ki.date, period.range)) continue;
      const b = map.get(ki.keywordId) ?? emptyBucket();
      b.spend += ki.spendCents;
      b.impressions += ki.impressions;
      b.clicks += ki.clicks;
      map.set(ki.keywordId, b);
    }
    for (const o of orders) {
      if (!o.adSetId || !o.utmTerm) continue;
      const word = words.find((k) => k.adSetId === o.adSetId && normalize(k.text) === normalize(o.utmTerm!));
      if (!word) continue;
      const b = map.get(word.id) ?? emptyBucket();
      const c = scope.costsOf(o);
      b.sales += 1;
      b.revenue += orderBase(o, dashboard);
      b.costs += c.salesTaxCents + c.extraTaxCents + c.productCostCents + c.feesCents;
      map.set(word.id, b);
    }
    const MATCH = { exact: "exata", phrase: "de frase", broad: "ampla" } as const;
    rows = words
      .filter((k) => !parentFilter || k.adSetId === parentFilter.id)
      .map((k) =>
        base(
          k.id,
          k.text,
          { status: k.status, parent: `${adSetName.get(k.adSetId) ?? ""} · correspondência ${MATCH[k.matchType]}` },
          map.get(k.id),
        ),
      );
  }

  const q = one(sp.q)?.trim();
  if (q) rows = rows.filter((r) => normalize(r.name).includes(normalize(q)));
  const statusFilter = one(sp.status);
  if (statusFilter && STATUS_FILTERS[statusFilter]) rows = rows.filter((r) => STATUS_FILTERS[statusFilter].includes(r.status as AdStatus));
  rows.sort((a, b) => b.spendCents - a.spendCents || a.name.localeCompare(b.name, "pt-BR"));

  const sum = rows.reduce<Bucket>(
    (acc, r) => ({
      spend: acc.spend + r.spendCents,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      atc: acc.atc + r.addToCarts,
      sales: acc.sales + r.sales,
      revenue: acc.revenue + r.revenueCents,
      costs: acc.costs + (r.revenueCents - r.spendCents - r.profitCents - Math.round((r.spendCents * metaTaxBp) / 10000)),
    }),
    emptyBucket(),
  );

  return {
    dashboard: { id: dashboard.id, name: dashboard.name, currency: dashboard.currency, adPlatforms: dashboard.adPlatforms },
    provider,
    connected: accounts.length > 0,
    period,
    level,
    levels,
    parentFilter,
    rows,
    totals: base("total", "Total", {}, sum),
    lastSyncedAt: accounts.map((a) => a.lastSyncedAt).filter((t): t is string => !!t).sort()[0] ?? null,
    canManage: role === "admin",
  };
}

// ---- Badge do card (S25) ------------------------------------------------------------------------

export type CardMetric = {
  label: "ROAS";
  value: number | null;
  trend: "up" | "down" | null;
  targetName: string;
  targetLevel: "campaign" | "ad_set" | "ad";
  dashboardId: string;
  provider: Provider | null;
  spendCents: number;
  revenueCents: number;
  sales: number;
};

/** ROAS dos últimos 7 dias, no fuso do dashboard, do alvo ligado ao card. */
export function getCardMetrics(ctx: Ctx, cardIds: string[]): Map<string, CardMetric> {
  const store = readStore();
  const result = new Map<string, CardMetric>();
  const wanted = new Set(cardIds);
  for (const link of store.cardLinks) {
    if (!wanted.has(link.cardId) || result.has(link.cardId)) continue;
    if (link.targetType !== "campaign" && link.targetType !== "ad_set" && link.targetType !== "ad") continue;
    const dashboard = store.dashboards.find((d) => d.id === link.dashboardId);
    if (!dashboard) continue;
    // Quem não é do workspace do dashboard não vê os números (o card continua visível).
    if (!store.workspaceMembers.some((m) => m.workspaceId === dashboard.workspaceId && m.userId === ctx.user.id)) continue;
    const target =
      link.targetType === "campaign"
        ? store.campaigns.find((c) => c.id === link.campaignId)
        : link.targetType === "ad_set"
          ? store.adSets.find((s) => s.id === link.adSetId)
          : store.ads.find((a) => a.id === link.adId);
    if (!target) continue;
    const account = store.adAccounts.find((a) => a.id === target.adAccountId);
    const period = resolvePeriod("7d", dashboard.timezone, null);
    const matchInsight = (i: { campaignId: string; adSetId: string | null; adId: string | null }) =>
      link.targetType === "campaign" ? i.campaignId === target.id : link.targetType === "ad_set" ? i.adSetId === target.id : i.adId === target.id;
    let spend = 0;
    for (const i of store.adInsightsDaily) if (matchInsight(i) && inRange(i.date, period.range)) spend += i.spendCents;
    const storeIds = new Set(store.dashboardStores.filter((l) => l.dashboardId === dashboard.id).map((l) => l.storeId));
    let revenue = 0;
    let sales = 0;
    for (const o of store.orders) {
      if (!storeIds.has(o.storeId) || o.isTest || o.status !== "paid") continue;
      if (!matchInsight({ campaignId: o.campaignId ?? "", adSetId: o.adSetId, adId: o.adId })) continue;
      if (!inRange(dayKeyIn(o.placedAt, dashboard.timezone), period.range)) continue;
      revenue += orderBase(o, dashboard);
      sales++;
    }
    const roas = ratio(revenue, spend);
    result.set(link.cardId, {
      label: "ROAS",
      value: roas,
      trend: roas == null ? null : roas >= 1 ? "up" : "down",
      targetName: target.name,
      targetLevel: link.targetType,
      dashboardId: dashboard.id,
      provider: account?.provider ?? null,
      spendCents: spend,
      revenueCents: revenue,
      sales,
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
