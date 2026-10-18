// De onde vêm as peças dos Painéis no modo simulado: pedidos, gasto dos
// anúncios, custos e despesas do armazenamento, com as MESMAS regras do Resumo
// (server/data/tracking.ts, totalsFor), para o mesmo período dar o mesmo número:
// - o pedido conta pelo dia (ou pela hora) em que foi feito, no fuso do dashboard;
// - bruto = pagos − reembolsos parciais − juros (se não contabilizados);
//   líquido = bruto − taxa da plataforma de pagamento; base = a do dashboard;
// - impostos somados pedido a pedido e dia a dia (o percentual muda com o
//   tempo), inclusive o imposto sobre o gasto do Meta, pelo dia do gasto;
// - despesas só entram sem filtro de conta, produto ou fonte;
// - gasto, impressões e cliques chegam por dia: por hora ficam "sem dado".
// Com o banco (etapa 4 da troca para o Supabase), esta soma vira uma função SQL.

import { COMPONENTS, type ComponentId, type Dimension } from "@/lib/charts/catalog";
import { msg } from "@/lib/charts/messages";
import type { Granularity } from "@/lib/charts/options";
import { markUnavailable, type BucketComponents, type Components, type Row } from "@/server/charts/compute";
import { makeLocator, type Bucket, type BucketOptions } from "@/server/charts/time-buckets";
import { buildScope, METHOD_LABEL, SOURCE_LABEL, sourceOf, type Scope, type TrackingFilters } from "@/server/data/tracking";
import type { Converter } from "@/server/fx/convert";
import { expensesInRange, metaAdsTaxCents } from "@/server/metrics/costs";
import { dayKeyIn, inRange, type DateRange } from "@/server/period";
import type { AdInsightRow, DashboardRow, DateKey, OrderRow, PaymentMethod, Store } from "@/server/store/types";

export type PanelSource = {
  store: Store;
  dashboard: DashboardRow;
  scope: Scope;
  filters: TrackingFilters;
  /** Há filtro de conta, produto ou fonte (as despesas ficam de fora). */
  filtered: boolean;
};

export function panelSource(store: Store, dashboard: DashboardRow, filters: TrackingFilters, fx?: Converter): PanelSource {
  return {
    store,
    dashboard,
    scope: buildScope(store, dashboard, filters, fx),
    filters,
    filtered: filters.accounts.length + filters.products.length + filters.sources.length > 0,
  };
}

/** Peças que só existem por dia (vêm assim das plataformas ou se dividem por dia): por hora ficam "sem dado". */
export const DAILY_ONLY: readonly ComponentId[] = [
  "spendCents",
  "spendMetaCents",
  "spendGoogleCents",
  "impressions",
  "clicks",
  "addToCarts",
  "taxesCents",
  "expensesCents",
];

// ---- somas de um grupo (um balde de tempo, uma campanha...) ------------------------------------

type Sums = Record<ComponentId, number>;
type Acc = { sums: Sums; metaSpendByDay: Map<DateKey, number> };

function newAcc(): Acc {
  return { sums: Object.fromEntries(COMPONENTS.map((c) => [c, 0])) as Sums, metaSpendByDay: new Map() };
}

function addOrder(acc: Acc, o: OrderRow, src: PanelSource) {
  const s = acc.sums;
  s.ordersCount += 1;
  s.refundedCents += o.refundedCents;
  if (o.status === "paid") {
    const gross = o.totalCents - o.refundedCents - (src.dashboard.includeInterest ? 0 : o.interestCents);
    const net = gross - (o.gatewayFeeCents ?? 0);
    s.grossCents += gross;
    s.netCents += net;
    s.baseCents += src.dashboard.revenueBasis === "gross" ? gross : net;
    s.paidCount += 1;
    const costs = src.scope.costsOf(o);
    s.taxesCents += costs.salesTaxCents + costs.extraTaxCents;
    s.productCostCents += costs.productCostCents;
    s.feesCents += costs.feesCents;
  } else if (o.status === "waiting_payment") s.pendingCount += 1;
  else if (o.status === "refunded") s.refundedCount += 1;
  else if (o.status === "chargedback") s.chargebackCount += 1;
}

function addInsight(acc: Acc, i: AdInsightRow, src: PanelSource) {
  const s = acc.sums;
  s.spendCents += i.spendCents;
  if (src.scope.accountProvider.get(i.adAccountId) === "meta") {
    s.spendMetaCents += i.spendCents;
    acc.metaSpendByDay.set(i.date, (acc.metaSpendByDay.get(i.date) ?? 0) + i.spendCents);
  } else s.spendGoogleCents += i.spendCents;
  s.impressions += i.impressions;
  s.clicks += i.clicks;
  s.addToCarts += i.addToCarts;
}

/** Fecha as somas: o imposto do Meta pelo percentual de cada dia do gasto, e as despesas do intervalo. */
function finish(acc: Acc, src: PanelSource, expensesCents: number, metaTaxCents = metaAdsTaxCents(acc.metaSpendByDay, src.scope.costCtx.settings)): Components {
  const s = { ...acc.sums };
  s.taxesCents += metaTaxCents;
  s.expensesCents = expensesCents;
  return s;
}

/**
 * Imposto do Meta repartido entre as linhas sem sobrar nem faltar centavo. O
 * de cada dia é calculado sobre o gasto do dia inteiro (como no Resumo) e
 * dividido pelo gasto de cada linha; os centavos que sobram do arredondamento
 * vão para as maiores frações (método do maior resto). Arredondar linha por
 * linha faria a soma das campanhas sair alguns centavos diferente do total.
 */
export function allocateMetaTax(spendByDay: Map<DateKey, number>[], settings: PanelSource["scope"]["costCtx"]["settings"]): number[] {
  const result = spendByDay.map(() => 0);
  const days = new Set(spendByDay.flatMap((m) => [...m.keys()]));
  for (const day of days) {
    const spends = spendByDay.map((m) => m.get(day) ?? 0);
    const total = spends.reduce((a, b) => a + b, 0);
    const tax = metaAdsTaxCents(new Map([[day, total]]), settings);
    if (tax === 0 || total === 0) continue;
    const exact = spends.map((spend) => (tax * spend) / total);
    const shares = exact.map(Math.floor);
    let rest = tax - shares.reduce((a, b) => a + b, 0);
    const byFraction = exact.map((e, i) => ({ i, fraction: e - shares[i] })).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
    for (const { i } of byFraction) {
      if (rest <= 0) break;
      shares[i] += 1;
      rest -= 1;
    }
    shares.forEach((share, i) => (result[i] += share));
  }
  return result;
}

const dashboardExpenses = (src: PanelSource) => src.store.expenses.filter((e) => e.dashboardId === src.dashboard.id);

function expensesBetween(src: PanelSource, range: DateRange) {
  if (src.filtered) return 0;
  return expensesInRange(dashboardExpenses(src), range, src.scope.convert).totalCents;
}

const orderDay = (o: OrderRow, src: PanelSource) => dayKeyIn(o.placedAt, src.dashboard.timezone);

// ---- total de um período (cartões de KPI) ------------------------------------------------------

/** As peças do período inteiro, como o Resumo soma (sempre por dia, qualquer que seja a granularidade do gráfico). */
export function componentsInRange(src: PanelSource, range: DateRange): Components {
  const acc = newAcc();
  for (const o of src.store.orders) {
    if (src.scope.orderMatches(o) && inRange(orderDay(o, src), range)) addOrder(acc, o, src);
  }
  for (const i of src.store.adInsightsDaily) {
    if (src.scope.spendAccounts.has(i.adAccountId) && inRange(i.date, range)) addInsight(acc, i, src);
  }
  return finish(acc, src, expensesBetween(src, range));
}

// ---- por tempo (linhas e colunas) --------------------------------------------------------------

/** As peças de cada balde, na ordem dos baldes. Balde sem nada fica zerado (não some do eixo). */
export function componentsByBucket(src: PanelSource, buckets: Bucket[], granularity: Granularity, options: BucketOptions): BucketComponents[] {
  const locator = makeLocator(buckets, granularity, options);
  const accs = new Map(buckets.map((b) => [b.key, newAcc()]));
  for (const o of src.store.orders) {
    if (!src.scope.orderMatches(o)) continue;
    const key = locator.byInstant(o.placedAt);
    if (key) addOrder(accs.get(key)!, o, src);
  }
  if (granularity !== "hour") {
    for (const i of src.store.adInsightsDaily) {
      if (!src.scope.spendAccounts.has(i.adAccountId)) continue;
      const key = locator.byDay(i.date);
      if (key) addInsight(accs.get(key)!, i, src);
    }
  }
  return buckets.map((b) => {
    const components = finish(accs.get(b.key)!, src, granularity === "hour" ? 0 : expensesBetween(src, { from: b.from, to: b.to }));
    return { key: b.key, components: granularity === "hour" ? markUnavailable(components, DAILY_ONLY) : components };
  });
}

// ---- por dimensão (barras) ---------------------------------------------------------------------

/** Linha que junta o que não tem aquela informação (pedido sem campanha, sem UTM...). */
export const NONE_KEY = "__sem__";

/** Pix, cartão e boleto; o resto (PayPal e outros) junto, como no Resumo. */
const methodOf = (m: PaymentMethod): PaymentMethod => (m === "paypal" ? "other" : m);

type Key = { key: string; label: string };

function keyers(src: PanelSource, dimension: Exclude<Dimension, "product">) {
  const { store, scope } = src;
  const accountName = new Map(store.adAccounts.map((a) => [a.id, `${a.provider === "meta" ? "Meta" : "Google"} · ${a.name}`]));
  const campaignName = new Map(store.campaigns.map((c) => [c.id, c.name]));
  const adSetName = new Map(store.adSets.map((s) => [s.id, s.name]));
  const adName = new Map(store.ads.map((a) => [a.id, a.name]));
  // Anúncios com o mesmo nome na mesma campanha (um em cada conjunto): o nome do conjunto vai junto.
  const sameName = new Map<string, number>();
  for (const a of store.ads) sameName.set(`${a.campaignId}|${a.name}`, (sameName.get(`${a.campaignId}|${a.name}`) ?? 0) + 1);
  for (const a of store.ads) {
    if ((sameName.get(`${a.campaignId}|${a.name}`) ?? 0) > 1) adName.set(a.id, `${a.name} (${adSetName.get(a.adSetId) ?? a.adSetId})`);
  }
  const none = (label: string): Key => ({ key: NONE_KEY, label });
  const utm = (value: string | null): Key => (value?.trim() ? { key: value.trim(), label: value.trim() } : none(msg.withoutValue.utm));
  // Pedido sem conjunto ou anúncio, e gasto do Performance Max (que chega por campanha), ficam juntos em "Sem ...".
  const named = (id: string | null, names: Map<string, string>, without: string): Key =>
    id ? { key: id, label: names.get(id) ?? id } : none(without);

  type Keyers = { order: (o: OrderRow) => Key; insight: ((i: AdInsightRow) => Key) | null };
  const byDimension: Record<Exclude<Dimension, "product">, () => Keyers> = {
    platform: () => ({
      order: (o) => ({ key: sourceOf(o), label: SOURCE_LABEL[sourceOf(o)] }),
      insight: (i) => {
        const provider = scope.accountProvider.get(i.adAccountId) === "meta" ? "meta" : "google";
        return { key: provider, label: SOURCE_LABEL[provider] };
      },
    }),
    adAccount: () => ({
      order: (o) => {
        const account = o.campaignId ? scope.campaignAccount.get(o.campaignId) : undefined;
        return account ? { key: account, label: accountName.get(account) ?? account } : none(msg.withoutValue.adAccount);
      },
      insight: (i) => ({ key: i.adAccountId, label: accountName.get(i.adAccountId) ?? i.adAccountId }),
    }),
    campaign: () => ({
      order: (o) => (o.campaignId ? { key: o.campaignId, label: campaignName.get(o.campaignId) ?? o.campaignId } : none(msg.withoutValue.campaign)),
      insight: (i) => ({ key: i.campaignId, label: campaignName.get(i.campaignId) ?? i.campaignId }),
    }),
    adSet: () => ({
      order: (o) => named(o.adSetId, adSetName, msg.withoutValue.adSet),
      insight: (i) => named(i.adSetId, adSetName, msg.withoutValue.adSet),
    }),
    ad: () => ({
      order: (o) => named(o.adId, adName, msg.withoutValue.ad),
      insight: (i) => named(i.adId, adName, msg.withoutValue.ad),
    }),
    paymentMethod: () => ({
      order: (o) => ({ key: methodOf(o.paymentMethod), label: METHOD_LABEL[methodOf(o.paymentMethod)] }),
      insight: null,
    }),
    utmSource: () => ({ order: (o) => utm(o.utmSource), insight: null }),
    utmMedium: () => ({ order: (o) => utm(o.utmMedium), insight: null }),
    utmCampaign: () => ({ order: (o) => utm(o.utmCampaign), insight: null }),
    utmContent: () => ({ order: (o) => utm(o.utmContent), insight: null }),
  };
  return byDimension[dimension]();
}

/**
 * As peças de cada item da dimensão no período (uma linha por campanha, por
 * conta...). Só entram os itens com algum pedido ou gasto. As despesas ficam
 * zeradas nas linhas: uma conta de luz não se divide por campanha.
 */
export function componentsByDimension(src: PanelSource, range: DateRange, dimension: Dimension): Row[] {
  if (dimension === "product") return productRows(src, range);
  return componentsByPath(src, range, [dimension]).map((r) => ({ key: r.path[0].key, label: r.path[0].label, components: r.components }));
}

/** Uma linha por combinação de níveis (Meta → Campanha X → Anúncio Y), com o caminho até ela. */
export type PathRow = Row & { path: Key[] };

/** Separa as chaves do caminho na chave da linha (não aparece em nenhum id). */
export const PATH_SEPARATOR = "\u001f";

/**
 * As peças de cada combinação de níveis no período (o treemap). As mesmas
 * regras das linhas de uma dimensão só: o imposto do Meta é repartido entre as
 * linhas do último nível, então a soma de cada nível fecha com o de cima e com
 * o total. Gasto só entra se todos os níveis existirem nos anúncios (por UTM,
 * não: lib/charts/widgets.ts recusa antes).
 */
export function componentsByPath(src: PanelSource, range: DateRange, dimensions: Exclude<Dimension, "product">[]): PathRow[] {
  const levels = dimensions.map((d) => keyers(src, d));
  const groups = new Map<string, { path: Key[]; acc: Acc }>();
  const groupOf = (path: Key[]) => {
    const key = path.map((k) => k.key).join(PATH_SEPARATOR);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { path, acc: newAcc() }));
    return g.acc;
  };
  for (const o of src.store.orders) {
    if (src.scope.orderMatches(o) && inRange(orderDay(o, src), range)) addOrder(groupOf(levels.map((l) => l.order(o))), o, src);
  }
  if (levels.every((l) => l.insight)) {
    for (const i of src.store.adInsightsDaily) {
      if (src.scope.spendAccounts.has(i.adAccountId) && inRange(i.date, range)) addInsight(groupOf(levels.map((l) => l.insight!(i))), i, src);
    }
  }
  const list = [...groups];
  const metaTax = allocateMetaTax(
    list.map(([, g]) => g.acc.metaSpendByDay),
    src.scope.costCtx.settings,
  );
  return list.map(([key, g], i) => ({ key, label: g.path.at(-1)!.label, path: g.path, components: finish(g.acc, src, 0, metaTax[i]) }));
}

/** Peças que existem por produto (lib/charts/catalog.ts, DIMENSION_METRICS): o resto fica "sem dado". */
const PRODUCT_COMPONENTS: readonly ComponentId[] = ["grossCents", "paidCount", "ordersCount"];
const NOT_BY_PRODUCT = COMPONENTS.filter((c) => !PRODUCT_COMPONENTS.includes(c));

/**
 * Por produto: faturamento = soma dos itens pagos (como "Vendas por produto" do
 * Resumo); vendas e pedidos = em quantos pedidos pagos (ou feitos) o produto
 * entrou. Com filtro de produto, só aparecem os produtos escolhidos.
 */
function productRows(src: PanelSource, range: DateRange): Row[] {
  const { store, scope } = src;
  const productName = new Map(store.products.map((p) => [p.id, p.name]));
  const chosen = src.filters.products.length ? new Set(src.filters.products) : null;
  const groups = new Map<string, { label: string; sums: Sums }>();
  for (const o of store.orders) {
    if (!scope.orderMatches(o) || !inRange(orderDay(o, src), range)) continue;
    const seen = new Set<string>();
    for (const item of scope.itemsByOrder.get(o.id) ?? []) {
      if (chosen && !(item.productId && chosen.has(item.productId))) continue;
      const key = item.productId ?? `item:${item.name}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { label: (item.productId && productName.get(item.productId)) || item.name, sums: newAcc().sums }));
      if (o.status === "paid") g.sums.grossCents += item.totalCents;
      if (seen.has(key)) continue;
      seen.add(key);
      g.sums.ordersCount += 1;
      if (o.status === "paid") g.sums.paidCount += 1;
    }
  }
  return [...groups].map(([key, g]) => ({ key, label: g.label, components: markUnavailable({ ...g.sums }, NOT_BY_PRODUCT) }));
}
