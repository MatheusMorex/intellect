// Cotações de câmbio para os dashboards. Fonte: taxas de referência do Banco
// Central Europeu pela api.frankfurter.dev (pública, sem chave). A PTAX do
// Banco Central do Brasil seria a primeira escolha, mas a API dela recusa
// acesso fora do navegador (403).
//
// Busca só o que falta e guarda em store.fxRates (no Supabase, fx_rates).

import { format } from "date-fns";

import { dayKeyIn, todayIn } from "@/server/period";
import { mutate, nowIso, readStore } from "@/server/store/db";
import type { DashboardRow, DateKey, Store } from "@/server/store/types";

import { BASE_CURRENCY, identityConverter, LOOKBACK_DAYS, makeConverter, shiftDay, type Converter } from "./convert";

const API = "https://api.frankfurter.dev/v1";
/** Cotação recente é buscada de novo depois de 1 hora (o BCE publica uma vez por dia útil). */
const REFRESH_MS = 60 * 60 * 1000;

type RatesResponse = { rates?: Record<DateKey, Record<string, number>> };

async function fetchQuote(quote: string, start: DateKey, end: DateKey): Promise<RatesResponse | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API}/${start}..${end}?base=${BASE_CURRENCY}&symbols=${quote}`, {
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!res.ok) return null;
      return (await res.json()) as RatesResponse;
    } catch {
      // rede instável: tenta mais uma vez
    }
  }
  return null;
}

/** Garante as cotações de `quotes` entre `from` (menos os dias de folga) e `to`. Falha em silêncio: quem converte vê a falta. */
export async function ensureRates(quotes: string[], from: DateKey, to: DateKey): Promise<void> {
  const wanted = [...new Set(quotes)].filter((q) => q !== BASE_CURRENCY);
  if (!wanted.length) return;
  const needFrom = shiftDay(from, -LOOKBACK_DAYS);
  const store = readStore();
  const recent = to >= shiftDay(new Date().toISOString().slice(0, 10), -3);
  const stale = wanted.filter((q) => {
    const cov = store.fxCoverage[q];
    if (!cov) return true;
    if (cov.from > needFrom || cov.to < to) return true;
    return recent && Date.now() - Date.parse(cov.fetchedAt) > REFRESH_MS;
  });
  if (!stale.length) return;

  const results = await Promise.all(
    stale.map(async (quote) => {
      const cov = store.fxCoverage[quote];
      // O intervalo novo sempre encosta no que já existe, para a cobertura não ter buracos.
      const start = cov && cov.from < needFrom ? cov.from : needFrom;
      const end = cov && cov.to > to ? cov.to : to;
      return { quote, start, end, data: await fetchQuote(quote, start, end) };
    }),
  );
  const fetched = results.filter((r) => r.data?.rates);
  if (!fetched.length) return;

  mutate((s) => {
    const index = new Map(s.fxRates.map((r, i) => [`${r.date}|${r.quote}`, i]));
    for (const { quote, start, end, data } of fetched) {
      for (const [date, row] of Object.entries(data!.rates!)) {
        const rate = row[quote];
        if (!(typeof rate === "number" && rate > 0)) continue;
        const key = `${date}|${quote}`;
        const i = index.get(key);
        if (i != null) s.fxRates[i].rate = rate;
        else {
          s.fxRates.push({ date, quote, rate });
          index.set(key, s.fxRates.length - 1);
        }
      }
      s.fxCoverage[quote] = { from: start, to: end, fetchedAt: nowIso() };
    }
  });
}

/** Moedas e primeiro dia dos valores que entram nas contas do dashboard. */
function dashboardMoney(store: Store, dashboard: DashboardRow) {
  const currencies = new Set<string>();
  let earliest: DateKey | null = null;
  const see = (currency: string, day: DateKey) => {
    currencies.add(currency);
    if (!earliest || day < earliest) earliest = day;
  };
  const accounts = new Set(store.dashboardAdAccounts.filter((l) => l.dashboardId === dashboard.id).map((l) => l.adAccountId));
  const stores = new Set(store.dashboardStores.filter((l) => l.dashboardId === dashboard.id).map((l) => l.storeId));
  const keywords = new Set(store.keywords.filter((k) => accounts.has(k.adAccountId)).map((k) => k.id));
  const products = new Set(store.products.filter((p) => stores.has(p.storeId)).map((p) => p.id));
  for (const i of store.adInsightsDaily) if (accounts.has(i.adAccountId)) see(i.currency, i.date);
  for (const k of store.keywordInsightsDaily) if (keywords.has(k.keywordId)) see(k.currency, k.date);
  for (const o of store.orders) if (stores.has(o.storeId)) see(o.currency, dayKeyIn(o.placedAt, dashboard.timezone));
  for (const c of store.productCosts) if (products.has(c.productId)) see(c.currency, c.validFrom);
  for (const f of store.additionalFees) if (f.dashboardId === dashboard.id && f.kind === "fixed") see(f.currency, f.validFrom);
  for (const e of store.expenses) if (e.dashboardId === dashboard.id) see(e.currency, e.date);
  return { currencies, earliest: earliest as DateKey | null, accounts, stores, keywords };
}

export type DashboardFx = {
  /** O armazenamento com pedidos, itens e gastos do dashboard já na moeda dele. */
  store: Store;
  converter: Converter;
};

/**
 * Prepara as contas de um dashboard na moeda dele: busca as cotações que faltam
 * e devolve uma cópia do armazenamento com pedidos, itens e gastos convertidos.
 * Custos de produto, taxas fixas e despesas são convertidos no dia de cada uso
 * (server/data/tracking.ts). Se faltar cotação, converter.misses() fica maior que zero.
 */
export async function prepareDashboardFx(dashboard: DashboardRow): Promise<DashboardFx> {
  let store = readStore();
  const money = dashboardMoney(store, dashboard);
  const foreign = [...money.currencies].filter((c) => c !== dashboard.currency);
  if (!foreign.length) return { store, converter: identityConverter(dashboard.currency) };

  const today = format(todayIn(dashboard.timezone), "yyyy-MM-dd");
  await ensureRates([...foreign, dashboard.currency], money.earliest ?? today, today);
  store = readStore();
  const converter = makeConverter(store.fxRates, dashboard.currency);
  return { store: convertSnapshot(store, dashboard, converter, money), converter };
}

/** Só para quem não pode esperar a busca (badge do card): usa as cotações já guardadas. */
export function cachedConverter(store: Store, currency: string): Converter {
  return makeConverter(store.fxRates, currency);
}

function convertSnapshot(store: Store, dashboard: DashboardRow, fx: Converter, money: ReturnType<typeof dashboardMoney>): Store {
  const to = dashboard.currency;
  const c = (amount: number, from: string, day: DateKey) => fx.cents(amount, from, day) ?? 0;
  const orderInfo = new Map<string, { currency: string; day: DateKey }>();

  const orders = store.orders.map((o) => {
    if (!money.stores.has(o.storeId) || o.currency === to) return o;
    const day = dayKeyIn(o.placedAt, dashboard.timezone);
    orderInfo.set(o.id, { currency: o.currency, day });
    return {
      ...o,
      currency: to,
      totalCents: c(o.totalCents, o.currency, day),
      subtotalCents: c(o.subtotalCents, o.currency, day),
      shippingCents: c(o.shippingCents, o.currency, day),
      taxCents: c(o.taxCents, o.currency, day),
      discountCents: c(o.discountCents, o.currency, day),
      refundedCents: c(o.refundedCents, o.currency, day),
      gatewayFeeCents: o.gatewayFeeCents == null ? null : c(o.gatewayFeeCents, o.currency, day),
      interestCents: c(o.interestCents, o.currency, day),
    };
  });
  const orderItems = store.orderItems.map((i) => {
    const info = orderInfo.get(i.orderId);
    if (!info) return i;
    return { ...i, unitPriceCents: c(i.unitPriceCents, info.currency, info.day), totalCents: c(i.totalCents, info.currency, info.day) };
  });
  const adInsightsDaily = store.adInsightsDaily.map((i) =>
    !money.accounts.has(i.adAccountId) || i.currency === to ? i : { ...i, currency: to, spendCents: c(i.spendCents, i.currency, i.date) },
  );
  const keywordInsightsDaily = store.keywordInsightsDaily.map((k) =>
    !money.keywords.has(k.keywordId) || k.currency === to ? k : { ...k, currency: to, spendCents: c(k.spendCents, k.currency, k.date) },
  );
  return { ...store, orders, orderItems, adInsightsDaily, keywordInsightsDaily };
}
