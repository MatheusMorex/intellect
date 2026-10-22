// Leituras de S21/S22 (integrações e rastreamento), S23 (taxas e custos) e S26 (despesas).

import { format } from "date-fns";

import { requireDashboard, type Ctx } from "@/server/access";
import { prepareDashboardFx } from "@/server/fx/rates";
import { expenseOccurrences, settingOn } from "@/server/metrics/costs";
import { dayKeyIn, resolvePeriod, todayIn } from "@/server/period";
import { withLiveRead } from "@/server/live/scope";
import { readStore } from "@/server/store/db";
import type { ExpenseCategory, ExpenseRow } from "@/server/store/types";

import { byLine } from "./orders";
import type { SearchParams } from "./tracking";

export const META_URL_PARAMS =
  "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&itl_c={{campaign.id}}&itl_s={{adset.id}}&itl_a={{ad.id}}&itl_p={{placement}}";
export const GOOGLE_URL_SUFFIX =
  "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}&itl_c={campaignid}&itl_s={adgroupid}&itl_a={creative}&itl_k={targetid}";

const DAY = 86_400_000;

async function getIntegrationsImpl(ctx: Ctx, dashboardId: string) {
  const { dashboard, role } = requireDashboard(ctx, dashboardId);
  const store = readStore();
  const linked = new Set(store.dashboardAdAccounts.filter((l) => l.dashboardId === dashboard.id).map((l) => l.adAccountId));
  const providers = (["meta", "google"] as const).map((provider) => {
    const connection = store.adConnections.find((c) => c.workspaceId === dashboard.workspaceId && c.provider === provider) ?? null;
    const daysLeft = connection?.tokenExpiresAt ? Math.ceil((new Date(connection.tokenExpiresAt).getTime() - Date.now()) / DAY) : null;
    return {
      provider,
      enabled: dashboard.adPlatforms.includes(provider),
      connection: connection
        ? {
            status: connection.status === "active" && daysLeft != null && daysLeft <= 0 ? ("expired" as const) : connection.status,
            userName: connection.externalUserName,
            daysLeft,
            createdAt: connection.createdAt,
          }
        : null,
      accounts: store.adAccounts
        .filter((a) => a.workspaceId === dashboard.workspaceId && a.provider === provider)
        .map((a) => ({
          id: a.id,
          name: a.name,
          externalId: a.externalId,
          currency: a.currency,
          timezone: a.timezone,
          status: a.status,
          linked: linked.has(a.id),
          lastSyncedAt: a.lastSyncedAt,
          lastSyncError: a.lastSyncError,
        })),
    };
  });

  const storeIds = new Set(store.dashboardStores.filter((l) => l.dashboardId === dashboard.id).map((l) => l.storeId));
  const shop = store.stores.find((s) => storeIds.has(s.id)) ?? null;
  // Lojas do workspace: a ligada a este dashboard e as que dá para ligar.
  const stores = store.stores
    .filter((s) => s.workspaceId === dashboard.workspaceId)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id))
    .map((s) => ({ id: s.id, name: s.name, domain: s.shopDomain, linked: storeIds.has(s.id) }));
  const shopOrders = shop ? store.orders.filter((o) => o.storeId === shop.id) : [];
  const lastOrder = shopOrders.reduce<(typeof shopOrders)[number] | null>((last, o) => (!last || o.placedAt > last.placedAt ? o : last), null);
  const failedDeliveries = shop ? store.webhookDeliveries.filter((d) => d.storeId === shop.id && d.error).length : 0;

  const tests = store.integrationTests
    .filter((t) => t.dashboardId === dashboard.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      source: t.trafficSource,
      url: t.campaignUrl,
      code: t.testCode,
      status: t.status,
      createdAt: t.createdAt,
      orderName: t.orderId ? (store.orders.find((o) => o.id === t.orderId)?.name ?? null) : null,
    }));

  return {
    dashboard: { id: dashboard.id, name: dashboard.name, adPlatforms: dashboard.adPlatforms, timezone: dashboard.timezone },
    canManage: role === "admin",
    mode: process.env.INTEGRATIONS_MODE === "live" ? ("live" as const) : ("fake" as const),
    providers,
    shop: shop
      ? {
          domain: shop.shopDomain,
          name: shop.name,
          status: shop.status,
          webhooksOk: shop.webhooksOk,
          lastEventAt: shop.lastEventAt,
          lastOrder: lastOrder ? { name: lastOrder.name, placedAt: lastOrder.placedAt } : null,
          ordersCount: shopOrders.length,
          failedDeliveries,
        }
      : null,
    stores,
    tests,
    templates: { meta: META_URL_PARAMS, google: GOOGLE_URL_SUFFIX },
  };
}

async function getCostSettingsImpl(ctx: Ctx, dashboardId: string) {
  const { dashboard, role } = requireDashboard(ctx, dashboardId);
  const store = readStore();
  const today = format(todayIn(dashboard.timezone), "yyyy-MM-dd");
  const settings = store.costSettings.filter((c) => c.dashboardId === dashboard.id).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
  const current = settingOn(settings, today) ?? settings.at(-1) ?? null;
  const storeIds = new Set(store.dashboardStores.filter((l) => l.dashboardId === dashboard.id).map((l) => l.storeId));
  const products = store.products
    .filter((p) => storeIds.has(p.storeId))
    .map((p) => {
      const costs = store.productCosts.filter((c) => c.productId === p.id).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
      const currentCost = costs.find((c) => c.validFrom <= today) ?? null;
      const sold = store.orderItems.filter((i) => i.productId === p.id).reduce((sum, i) => sum + i.quantity, 0);
      return {
        id: p.id,
        name: p.name,
        costCents: currentCost?.costCents ?? null,
        /** Moeda em que o custo foi cadastrado (a do dashboard naquela hora). */
        costCurrency: currentCost?.currency ?? dashboard.currency,
        validFrom: currentCost?.validFrom ?? null,
        scheduled: costs.filter((c) => c.validFrom > today).map((c) => ({ costCents: c.costCents, currency: c.currency, validFrom: c.validFrom })),
        sold,
      };
    })
    .sort((a, b) => b.sold - a.sold);
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const fees = store.additionalFees
    .filter((f) => f.dashboardId === dashboard.id)
    .map((f) => ({ ...f, productName: f.productId ? (productName.get(f.productId) ?? "Produto removido") : null }));
  return {
    dashboard: { id: dashboard.id, name: dashboard.name, currency: dashboard.currency },
    canManage: role === "admin",
    today,
    current,
    history: settings,
    products,
    fees,
  };
}

export const EXPENSE_CATEGORY: Record<ExpenseCategory, string> = {
  traffic: "Tráfego",
  tools: "Ferramentas",
  staff: "Equipe",
  accounting: "Contabilidade",
  other: "Outros",
};

async function listExpensesImpl(ctx: Ctx, dashboardId: string, sp: SearchParams) {
  const { dashboard, role } = requireDashboard(ctx, dashboardId);
  // Cada despesa aparece na moeda em que foi lançada; os totais, na do dashboard, pela cotação de cada ocorrência.
  const fx = await prepareDashboardFx(dashboard);
  const store = fx.store;
  const convert = (amount: number, currency: string, day: string) => fx.converter.cents(amount, currency, day) ?? 0;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const all = store.expenses.filter((e) => e.dashboardId === dashboard.id);
  const earliest = all.reduce<string | null>((min, e) => (!min || e.date < min ? e.date : min), null);
  const period = resolvePeriod(one(sp.periodo) ?? "mes", dashboard.timezone, earliest, new Date(), { de: one(sp.de), ate: one(sp.ate) });
  const q = one(sp.q)?.trim().toLowerCase();
  const category = one(sp.categoria) as ExpenseCategory | undefined;

  type Line = ExpenseRow & { occurrences: string[]; totalInPeriodCents: number };
  const rows: Line[] = all
    .filter((e) => !q || e.description.toLowerCase().includes(q))
    .filter((e) => !category || e.category === category)
    .map((e) => {
      const occurrences = expenseOccurrences(e, period.range);
      return { ...e, occurrences, totalInPeriodCents: occurrences.reduce((sum, day) => sum + convert(e.amountCents, e.currency, day), 0) };
    })
    .filter((e) => e.occurrences.length > 0)
    // Mais recente primeiro; no empate, pela descrição (a ordem não depende de como os dados foram guardados).
    .sort((a, b) => (b.occurrences.at(-1) ?? "").localeCompare(a.occurrences.at(-1) ?? "") || a.description.localeCompare(b.description, "pt-BR") || a.id.localeCompare(b.id));

  const byCategory = Object.fromEntries(
    (Object.keys(EXPENSE_CATEGORY) as ExpenseCategory[]).map((c) => [c, rows.filter((r) => r.category === c).reduce((s, r) => s + r.totalInPeriodCents, 0)]),
  ) as Record<ExpenseCategory, number>;

  return {
    dashboard: { id: dashboard.id, name: dashboard.name, currency: dashboard.currency },
    canManage: role === "admin",
    period,
    rows,
    total: rows.reduce((s, r) => s + r.totalInPeriodCents, 0),
    byCategory,
    filters: { q: one(sp.q) ?? "", category: category ?? "" },
    fxUnavailable: fx.converter.misses() > 0,
  };
}

async function getOrderDetailImpl(ctx: Ctx, dashboardId: string, orderId: string) {
  const { dashboard } = requireDashboard(ctx, dashboardId);
  const store = readStore();
  const storeIds = new Set(store.dashboardStores.filter((l) => l.dashboardId === dashboard.id).map((l) => l.storeId));
  const order = store.orders.find((o) => o.id === orderId && storeIds.has(o.storeId));
  if (!order) return null;
  const shop = store.stores.find((s) => s.id === order.storeId);
  const numericId = order.externalId.split("/").pop();
  return {
    dashboard: { id: dashboard.id, name: dashboard.name, timezone: dashboard.timezone },
    order,
    day: dayKeyIn(order.placedAt, dashboard.timezone),
    items: store.orderItems.filter((i) => i.orderId === order.id).sort(byLine),
    events: store.orderEvents.filter((e) => e.orderId === order.id).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    campaign: order.campaignId ? (store.campaigns.find((c) => c.id === order.campaignId)?.name ?? null) : null,
    adSet: order.adSetId ? (store.adSets.find((s) => s.id === order.adSetId)?.name ?? null) : null,
    ad: order.adId ? (store.ads.find((a) => a.id === order.adId)?.name ?? null) : null,
    shopifyAdminUrl: shop && numericId ? `https://${shop.shopDomain}/admin/orders/${numericId}` : null,
  };
}

// ---- modo real (AUTH_MODE=live): as leituras rodam sobre o retrato do Supabase, com vendas e anúncios (server/live/scope.ts) ----

export async function getIntegrations(...args: Parameters<typeof getIntegrationsImpl>): ReturnType<typeof getIntegrationsImpl> {
  return withLiveRead(args[0].user.id, () => getIntegrationsImpl(...args), { tracking: true });
}

export async function getCostSettings(...args: Parameters<typeof getCostSettingsImpl>): ReturnType<typeof getCostSettingsImpl> {
  return withLiveRead(args[0].user.id, () => getCostSettingsImpl(...args), { tracking: true });
}

export async function listExpenses(...args: Parameters<typeof listExpensesImpl>): ReturnType<typeof listExpensesImpl> {
  return withLiveRead(args[0].user.id, () => listExpensesImpl(...args), { tracking: true });
}

export async function getOrderDetail(...args: Parameters<typeof getOrderDetailImpl>): ReturnType<typeof getOrderDetailImpl> {
  return withLiveRead(args[0].user.id, () => getOrderDetailImpl(...args), { tracking: true });
}

/** Configurações > Vendas e moeda: o dashboard e o papel de quem olha (esperando o retrato no modo real). */
export async function getDashboardSettings(ctx: Ctx, dashboardId: string) {
  return withLiveRead(ctx.user.id, () => requireDashboard(ctx, dashboardId));
}

// ---- S20 Dashboards: a lista, com o que cada um tem ligado -------------------------------------

function listDashboardsForSettingsImpl(ctx: Ctx) {
  const store = readStore();
  const memberships = store.workspaceMembers.filter((m) => m.userId === ctx.user.id);
  const workspaces = memberships
    .map((m) => ({ id: m.workspaceId, name: store.workspaces.find((w) => w.id === m.workspaceId)?.name ?? "Workspace", role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const role = new Map(workspaces.map((w) => [w.id, w.role]));
  const count = <T extends { dashboardId: string | null }>(rows: T[], id: string) => rows.filter((r) => r.dashboardId === id).length;
  const dashboards = store.dashboards
    .filter((d) => role.has(d.workspaceId))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id))
    .map((d) => {
      const accountIds = new Set(store.dashboardAdAccounts.filter((l) => l.dashboardId === d.id).map((l) => l.adAccountId));
      const accounts = store.adAccounts.filter((a) => accountIds.has(a.id));
      return {
        id: d.id,
        name: d.name,
        workspaceId: d.workspaceId,
        workspaceName: workspaces.find((w) => w.id === d.workspaceId)!.name,
        currency: d.currency,
        timezone: d.timezone,
        adPlatforms: d.adPlatforms,
        metaAccounts: accounts.filter((a) => a.provider === "meta").length,
        googleAccounts: accounts.filter((a) => a.provider === "google").length,
        stores: count(store.dashboardStores, d.id),
        // O que a exclusão leva junto (a confirmação mostra).
        panels: count(store.panels, d.id),
        expenses: count(store.expenses, d.id),
        cardLinks: count(store.cardLinks, d.id),
        automations: count(store.automations, d.id),
        canManage: role.get(d.workspaceId) === "admin",
      };
    });
  return { workspaces, dashboards };
}

export async function listDashboardsForSettings(ctx: Ctx) {
  return withLiveRead(ctx.user.id, () => listDashboardsForSettingsImpl(ctx), { tracking: true });
}

// ---- S29 Configuração inicial: o que falta para o dashboard ficar pronto ----------------------

export type SetupStep = {
  id: "plataformas" | "meta" | "google" | "loja" | "parametros" | "teste";
  done: boolean;
  /** O que já está feito ou o que falta, numa frase. */
  detail: string;
};

async function getSetupImpl(ctx: Ctx, dashboardId: string) {
  const data = await getIntegrationsImpl(ctx, dashboardId);
  const store = readStore();
  const platforms = data.dashboard.adPlatforms;
  const steps: SetupStep[] = [
    {
      id: "plataformas",
      done: true,
      detail: platforms.length
        ? `Anúncios no ${platforms.map((p) => (p === "meta" ? "Meta" : "Google")).join(" e no ")}.`
        : "Sem anúncios: só vendas orgânicas e de outras fontes.",
    },
  ];
  for (const p of data.providers.filter((x) => x.enabled)) {
    const linked = p.accounts.filter((a) => a.linked).length;
    const connected = p.connection?.status === "active";
    steps.push({
      id: p.provider,
      done: connected && linked > 0,
      detail: !connected
        ? "A conta ainda não está conectada."
        : linked === 0
          ? "Conectada. Falta escolher as contas de anúncio deste dashboard."
          : `Conectada, com ${linked} ${linked === 1 ? "conta de anúncio" : "contas de anúncio"}.`,
    });
  }
  const linkedStores = new Set(data.stores.filter((s) => s.linked).map((s) => s.id));
  steps.push({
    id: "loja",
    done: linkedStores.size > 0,
    detail: data.shop ? `${data.shop.name} (${data.shop.domain}).` : "Nenhuma loja ligada a este dashboard.",
  });
  if (platforms.length) {
    const tracked = store.orders.some((o) => linkedStores.has(o.storeId) && !o.isTest && o.attributionStatus === "tracked");
    steps.push({
      id: "parametros",
      done: tracked,
      detail: tracked ? "Já chegaram vendas com a campanha identificada." : "Ainda não chegou nenhuma venda com a campanha identificada.",
    });
  }
  const passed = store.integrationTests.some((t) => t.dashboardId === dashboardId && t.status === "attributed");
  steps.push({
    id: "teste",
    done: passed,
    detail: passed ? "O pedido de teste chegou com a origem certa." : "Nenhum teste concluído ainda.",
  });
  return { dashboard: data.dashboard, canManage: data.canManage, steps, done: steps.filter((s) => s.done).length };
}

export async function getSetup(...args: Parameters<typeof getSetupImpl>): ReturnType<typeof getSetupImpl> {
  return withLiveRead(args[0].user.id, () => getSetupImpl(...args), { tracking: true });
}
