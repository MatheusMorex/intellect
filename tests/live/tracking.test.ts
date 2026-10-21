// Etapa 4 da troca para o Supabase: vendas, anúncios, custos, painéis e
// cotações no modo real. O teste grava o exemplo do modo simulado (com ids e
// e-mails novos) no projeto de TESTE (nunca o principal), lê de volta pelo app
// e confere: (1) cada linha volta igual; (2) Resumo, Meta, Google, Vendas,
// Painéis e o ROAS dos cards dão os mesmos números calculados sobre os dados
// originais; (3) as ações gravam no banco; (4) o webhook da Shopify grava o
// pedido. Rodam com `npm run test:live`. No fim, tudo o que o teste criou é apagado.

/* eslint-disable @typescript-eslint/no-explicit-any -- linhas cruas do banco, conferidas campo a campo */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { register } from "node:module";
import { after, before, describe, test } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { SessionUser } from "../../server/auth/session.ts";
import type { Store } from "../../server/store/types.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const enabled = Boolean(url && secret && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
// Trava de segurança: estes testes criam e apagam dados.
const isTestProject = (url ?? "").includes("aqaijwpnudhftlxwsfdm");

process.env.AUTH_MODE = "live";
register("./stubs.mjs", import.meta.url);

const run = crypto.randomUUID().slice(0, 8);

describe("vendas e anúncios no Supabase (etapa 4)", { skip: !enabled || !isTestProject ? "sem .env.test.local do projeto de teste" : false }, () => {
  const admin = enabled ? createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } }) : (null as unknown as SupabaseClient);
  let data: Store;
  let ana: SessionUser;
  let dashboardId = "";
  let workspaceId = "";

  let m: {
    tracking: typeof import("../../server/data/tracking.ts");
    orders: typeof import("../../server/data/orders.ts");
    panels: typeof import("../../server/data/panels.ts");
    settingsData: typeof import("../../server/data/settings.ts");
    boards: typeof import("../../server/data/boards.ts");
    costs: typeof import("../../server/actions/costs.ts");
    ads: typeof import("../../server/actions/ads.ts");
    integrations: typeof import("../../server/actions/integrations.ts");
    panelActions: typeof import("../../server/actions/panels.ts");
    dashboardActions: typeof import("../../server/actions/dashboards.ts");
    templates: typeof import("../../lib/charts/templates.ts");
    settings: typeof import("../../server/actions/settings.ts");
    webhooks: typeof import("../../server/live/webhooks.ts");
    snapshot: typeof import("../../server/live/snapshot.ts");
    scope: typeof import("../../server/live/scope.ts");
    tables: typeof import("../../server/live/tables.ts");
    session: typeof import("./test-session.ts");
  };

  const rows = async (table: string, filter: (q: any) => any) => {
    const { data: found, error } = await filter(admin.from(table).select("*"));
    assert.ifError(error);
    return found as Record<string, any>[];
  };
  const one = async (table: string, id: string) => (await rows(table, (q) => q.eq("id", id)))[0];
  const ok = <T>(r: { ok: true; data: T } | { ok: false; error: string }) => {
    assert.ok(r.ok, r.ok ? "" : r.error);
    return (r as { ok: true; data: T }).data;
  };

  before(async () => {
    const { createSeed } = await import("../../server/store/seed.ts");
    const { copyWithNewIds, writeSeed } = await import("../../server/live/write-seed.ts");
    const written = await writeSeed(admin, copyWithNewIds(createSeed(new Date()), `vendas-${run}`), "Teste-Segura-123");
    data = written.data;
    workspaceId = data.workspaces[0].id;
    dashboardId = data.dashboards[0].id;
    const u = data.users.find((x) => x.email.startsWith("ana-"))!;
    ana = { id: u.id, name: u.name, email: u.email, username: u.username, avatarColor: u.avatarColor, timezone: u.timezone };
    m = {
      tracking: await import("../../server/data/tracking.ts"),
      orders: await import("../../server/data/orders.ts"),
      panels: await import("../../server/data/panels.ts"),
      settingsData: await import("../../server/data/settings.ts"),
      boards: await import("../../server/data/boards.ts"),
      costs: await import("../../server/actions/costs.ts"),
      ads: await import("../../server/actions/ads.ts"),
      integrations: await import("../../server/actions/integrations.ts"),
      panelActions: await import("../../server/actions/panels.ts"),
      dashboardActions: await import("../../server/actions/dashboards.ts"),
      templates: await import("../../lib/charts/templates.ts"),
      settings: await import("../../server/actions/settings.ts"),
      webhooks: await import("../../server/live/webhooks.ts"),
      snapshot: await import("../../server/live/snapshot.ts"),
      scope: await import("../../server/live/scope.ts"),
      tables: await import("../../server/live/tables.ts"),
      session: await import("./test-session.ts"),
    };
    m.session.actAs(ana);
  });

  after(async () => {
    if (!enabled || !isTestProject || !data) return;
    await admin.from("workspaces").delete().eq("id", workspaceId);
    for (const s of data.stores) await admin.from("stores").delete().eq("shop_domain", s.shopDomain);
    await admin.from("webhook_deliveries").delete().like("delivery_id", `teste-${run}-%`);
    for (const u of data.users) await admin.auth.admin.deleteUser(u.id);
  });

  test("o retrato traz de volta cada linha de vendas, anúncios, custos e painéis como foi gravada", async () => {
    const loaded = await m.snapshot.loadWorkspaceSnapshot(workspaceId, { tracking: true });
    // Cotações são do banco todo (não do workspace) e entregas de webhook só vêm quando pedidas.
    const skip = new Set(["fxRates", "fxCoverage", "webhookDeliveries", "integrationTests"]);
    const keys = m.tables.TABLES.filter((t) => t.tracking && !skip.has(t.key)).map((t) => t.key);
    let total = 0;
    for (const key of [...keys, "dashboards"]) {
      const want = (data as any)[key] as { id: string }[];
      const got = new Map(((loaded as any)[key] as { id: string }[]).map((r) => [r.id, r]));
      assert.equal(got.size, want.length, `${key}: quantidade`);
      for (const row of want) assert.deepEqual(got.get(row.id), row, `${key} ${row.id}`);
      total += want.length;
    }
    assert.ok(total > 4000, `poucas linhas conferidas (${total})`);
  });

  test("Resumo, Meta, Google, Vendas, Painéis, custos e o ROAS dos cards dão os mesmos números dos dados originais", async () => {
    const ctx = { user: ana };
    const same = async <T>(what: string, read: () => Promise<T>, pick: (v: T) => unknown = (v) => v) => {
      const live = pick(await read());
      const original = pick(await m.scope.readOnStore(structuredClone(data), read));
      assert.deepEqual(live, original, what);
      return live;
    };

    for (const periodo of ["7d", "30d", "maximo"]) {
      const summary: any = await same(`Resumo ${periodo}`, () => m.tracking.getDashboardSummary(ctx, dashboardId, { periodo }));
      assert.equal(summary.fxUnavailable ?? false, false);
      for (const nivel of ["contas", "campanhas", "conjuntos", "anuncios"]) {
        await same(`Meta ${nivel} ${periodo}`, () => m.tracking.getTrafficReport(ctx, dashboardId, "meta", { periodo, nivel }));
      }
      for (const nivel of ["campanhas", "conjuntos", "palavras"]) {
        await same(`Google ${nivel} ${periodo}`, () => m.tracking.getTrafficReport(ctx, dashboardId, "google", { periodo, nivel }));
      }
      const list: any = await same(`Vendas ${periodo}`, () => m.orders.listOrders(ctx, dashboardId, { period: periodo }));
      if (periodo === "maximo") assert.ok(list.rows.length > 0, "a lista de vendas veio vazia");
    }

    // O resumo de 30 dias tem dinheiro de verdade (não é uma comparação de zeros com zeros).
    const summary: any = await m.tracking.getDashboardSummary(ctx, dashboardId, { periodo: "30d" });
    assert.match(JSON.stringify(summary), /[1-9]\d{4,}/);

    const now = new Date();
    await same(
      "Painéis",
      () => m.panels.loadPanels(ctx, dashboardId, { periodo: "30d", comparar: "anterior" }, now),
      (page) => ({ totals: page.computer.totals(), compare: page.computer.compareTotals(), series: page.computer.series(), synced: page.lastSyncedAt }),
    );
    await same("Custos", () => m.settingsData.getCostSettings(ctx, dashboardId));
    await same("Despesas", () => m.settingsData.listExpenses(ctx, dashboardId, { periodo: "30d" }));
    const sale = [...data.orders].sort((a, b) => b.placedAt.localeCompare(a.placedAt))[0];
    await same("Detalhe da venda", () => m.settingsData.getOrderDetail(ctx, dashboardId, sale.id));
    await same("Integrações", () => m.settingsData.getIntegrations(ctx, dashboardId));
    await same("Filtros", () => m.tracking.getFilterOptions(ctx, dashboardId));

    // Cards ligados a campanhas mostram o ROAS: o quadro lê vendas e anúncios do banco.
    const linked = new Set(data.cardLinks.map((l) => l.cardId));
    const board = data.cards.find((c) => linked.has(c.id))!.boardId;
    const metrics: any = await same(
      "ROAS dos cards",
      () => m.boards.getBoardView(ctx, board),
      (view) => view.cards.filter((c) => linked.has(c.id)).map((c) => [c.id, c.metric]),
    );
    assert.ok(metrics.length > 0 && metrics.every(([, metric]: [string, any]) => metric && metric.spendCents > 0), "ROAS dos cards sem gasto");
  });

  test("custos: impostos, custo do produto, taxa e despesa vão para o banco e voltam", async () => {
    const today = new Date().toISOString().slice(0, 10);
    ok(await m.costs.saveCostSettings({ dashboardId, validFrom: today, salesTax: "6,5", metaAdsTax: "12,15", extraTaxes: [{ name: "ISS", bp: "2" }] }));
    const settings = await rows("cost_settings", (q) => q.eq("dashboard_id", dashboardId).eq("valid_from", today));
    assert.equal(settings.length, 1);
    assert.equal(settings[0].sales_tax_bp, 650);
    assert.equal(settings[0].meta_ads_tax_bp, 1215);
    assert.deepEqual(settings[0].extra_taxes, [{ name: "ISS", bp: 200 }]);
    // Salvar de novo na mesma data substitui (não duplica).
    ok(await m.costs.saveCostSettings({ dashboardId, validFrom: today, salesTax: "7", metaAdsTax: "12,15", extraTaxes: [] }));
    const again = await rows("cost_settings", (q) => q.eq("dashboard_id", dashboardId).eq("valid_from", today));
    assert.equal(again.length, 1);
    assert.equal(again[0].sales_tax_bp, 700);

    const product = data.products[0];
    ok(await m.costs.setProductCost({ dashboardId, productId: product.id, cost: "41,90", validFrom: today }));
    const costs = await rows("product_costs", (q) => q.eq("product_id", product.id).eq("valid_from", today));
    assert.equal(costs.length, 1);
    assert.equal(costs[0].cost_cents, 4190);

    ok(await m.costs.upsertAdditionalFee({ dashboardId, name: "Antifraude", kind: "fixed", value: "0,90", scope: "all", productId: null, paymentMethod: null, validFrom: today }));
    const [fee] = await rows("additional_fees", (q) => q.eq("dashboard_id", dashboardId).eq("name", "Antifraude"));
    assert.equal(fee.amount_cents, 90);
    ok(await m.costs.upsertAdditionalFee({ dashboardId, feeId: fee.id, name: "Antifraude", kind: "percent", value: "1,5", scope: "payment_method", productId: null, paymentMethod: "pix", validFrom: today }));
    const edited = await one("additional_fees", fee.id);
    assert.equal(edited.kind, "percent");
    assert.equal(edited.bp, 150);
    assert.equal(edited.amount_cents, null);
    assert.equal(edited.payment_method, "pix");

    ok(await m.costs.saveExpense({ dashboardId, kind: "recurring", category: "tools", description: `Ferramenta ${run}`, amount: "199,00", date: today, endDate: null }));
    const [expense] = await rows("expenses", (q) => q.eq("dashboard_id", dashboardId).eq("description", `Ferramenta ${run}`));
    assert.equal(expense.amount_cents, 19900);
    ok(await m.costs.saveExpense({ dashboardId, expenseId: expense.id, kind: "once", category: "other", description: `Ferramenta ${run}`, amount: "250,00", date: today, endDate: null }));
    assert.equal((await one("expenses", expense.id)).amount_cents, 25000);

    // As telas de custos e de despesas mostram o que está no banco.
    assert.ok(JSON.stringify(await m.settingsData.getCostSettings({ user: ana }, dashboardId)).includes("Antifraude"), "a taxa não apareceu em Custos");
    assert.ok(JSON.stringify(await m.settingsData.listExpenses({ user: ana }, dashboardId, { periodo: "30d" })).includes(`Ferramenta ${run}`), "a despesa não apareceu em Despesas");

    ok(await m.costs.deleteExpense(dashboardId, expense.id));
    ok(await m.costs.deleteAdditionalFee(dashboardId, fee.id));
    assert.equal(await one("expenses", expense.id), undefined);
    assert.equal(await one("additional_fees", fee.id), undefined);
  });

  test("anúncios e integrações: pausar, orçamento, desconectar, conectar e tirar a conta do dashboard", async () => {
    const meta = data.adAccounts.find((a) => a.provider === "meta")!;
    const campaign = data.campaigns.find((c) => c.adAccountId === meta.id && c.status === "active")!;
    assert.deepEqual(ok(await m.ads.setAdObjectStatus({ dashboardId, level: "campanhas", id: campaign.id, active: false })), { status: "paused" });
    assert.equal((await one("campaigns", campaign.id)).status, "paused");
    ok(await m.ads.setAdObjectStatus({ dashboardId, level: "campanhas", id: campaign.id, active: true }));
    assert.equal((await one("campaigns", campaign.id)).status, "active");

    const adSet = data.adSets.find((s) => s.adAccountId === meta.id)!;
    const target = data.campaigns.find((c) => c.adAccountId === meta.id && c.dailyBudgetCents != null) ? "campanhas" : "conjuntos";
    const budgetId = target === "campanhas" ? data.campaigns.find((c) => c.adAccountId === meta.id && c.dailyBudgetCents != null)!.id : adSet.id;
    assert.deepEqual(ok(await m.ads.setAdObjectBudget({ dashboardId, level: target, id: budgetId, value: "123,45" })), { cents: 12345 });
    assert.equal((await one(target === "campanhas" ? "campaigns" : "ad_sets", budgetId)).daily_budget_cents, 12345);

    ok(await m.integrations.disconnectProvider({ dashboardId, provider: "meta" }));
    const revoked = await rows("ad_connections", (q) => q.eq("workspace_id", workspaceId).eq("provider", "meta"));
    assert.ok(revoked.length > 0 && revoked.every((c) => c.status === "revoked"));
    assert.equal((await one("ad_accounts", meta.id)).last_sync_error, "Conta desconectada.");
    ok(await m.integrations.simulateConnect({ dashboardId, provider: "meta" }));
    const active = await rows("ad_connections", (q) => q.eq("workspace_id", workspaceId).eq("provider", "meta"));
    assert.ok(active.every((c) => c.status === "active"));
    assert.equal((await one("ad_accounts", meta.id)).last_sync_error, null);

    ok(await m.integrations.setDashboardAccount({ dashboardId, accountId: meta.id, enabled: false }));
    assert.equal((await rows("dashboard_ad_accounts", (q) => q.eq("dashboard_id", dashboardId).eq("ad_account_id", meta.id))).length, 0);
    // Sem a conta do Meta, a tela do Meta mostra o convite para conectar e zero de gasto.
    const report: any = await m.tracking.getTrafficReport({ user: ana }, dashboardId, "meta", { periodo: "30d" });
    assert.equal(report.connected, false);
    assert.equal(report.totals.spendCents, 0);
    ok(await m.integrations.setDashboardAccount({ dashboardId, accountId: meta.id, enabled: true }));
    assert.equal((await rows("dashboard_ad_accounts", (q) => q.eq("dashboard_id", dashboardId).eq("ad_account_id", meta.id))).length, 1);

    // Teste de integração: o link leva o código, e o teste fica esperando o pedido.
    const check = ok(await m.integrations.createIntegrationTest({ dashboardId, source: "meta", url: "https://loja.exemplo.com.br/produto" }));
    assert.ok(check.url.includes(`itl_test=${check.code}`));
    const [waiting] = await rows("integration_tests", (q) => q.eq("test_code", check.code));
    assert.equal(waiting.dashboard_id, dashboardId);
    assert.equal(waiting.status, "waiting");

    // "Atualizar": marca a hora nas contas (no máximo uma vez a cada 5 minutos).
    const refreshed = await m.dashboardActions.refreshDashboard(dashboardId);
    assert.equal(refreshed.ok, true);
    const synced = await rows("ad_accounts", (q) => q.eq("workspace_id", workspaceId));
    assert.ok(synced.every((a) => Date.now() - Date.parse(a.last_synced_at) < 6 * 60_000), "conta sem a hora da atualização");
    const again = await m.dashboardActions.refreshDashboard(dashboardId);
    assert.match(again.message, /em dia/);
  });

  test("painéis: criar, renomear, duplicar, escolher o padrão e apagar", async () => {
    const created = ok(await m.panelActions.createPanel({ dashboardId, name: "Tráfego do teste", template: "trafego" }));
    const panel = await one("dashboard_panels", created.id);
    assert.equal(panel.name, "Tráfego do teste");
    assert.ok(Array.isArray(panel.widgets) && panel.widgets.length > 0, "o modelo veio sem widgets");
    assert.equal(panel.widgets.length, panel.layout.length);

    ok(await m.panelActions.updatePanel({ panelId: created.id, name: "Tráfego (teste)", membersCanFilter: false }));
    const renamed = await one("dashboard_panels", created.id);
    assert.equal(renamed.name, "Tráfego (teste)");
    assert.equal(renamed.members_can_filter, false);

    const copy = ok(await m.panelActions.duplicatePanel({ panelId: created.id }));
    assert.deepEqual((await one("dashboard_panels", copy.id)).widgets.length, panel.widgets.length);

    ok(await m.panelActions.setDefaultPanel({ panelId: copy.id }));
    const defaults = await rows("dashboard_panels", (q) => q.eq("dashboard_id", dashboardId).eq("is_default", true));
    assert.deepEqual(
      defaults.map((p) => p.id),
      [copy.id],
    );

    const widget = panel.widgets[0];
    ok(await m.panelActions.deleteWidget({ panelId: created.id, widgetId: widget.id }));
    const fewer = await one("dashboard_panels", created.id);
    assert.equal(fewer.widgets.length, panel.widgets.length - 1);
    assert.ok(!fewer.layout.some((l: { i: string }) => l.i === widget.id), "o widget apagado ficou no layout");

    // Gráfico copiado e editado, grade arrumada, filtros padrão e ordem das abas.
    const copied = ok(await m.panelActions.duplicateWidget({ panelId: created.id, widgetId: panel.widgets[1].id }));
    const withCopy = await one("dashboard_panels", created.id);
    const copyWidget = withCopy.widgets.find((w: { id: string }) => w.id === copied.id);
    assert.ok(copyWidget, "a cópia do gráfico não foi gravada");
    ok(await m.panelActions.saveWidget({ panelId: created.id, widget: { ...copyWidget, title: "Cópia renomeada" } }));
    const afterEdit = await one("dashboard_panels", created.id);
    assert.equal(afterEdit.widgets.find((w: { id: string }) => w.id === copied.id).title, "Cópia renomeada");
    const layout = afterEdit.layout.map((l: { i: string }) => (l.i === copied.id ? { ...l, x: 0, y: 0 } : l));
    ok(await m.panelActions.savePanelLayout({ panelId: created.id, layout }));
    assert.deepEqual((await one("dashboard_panels", created.id)).layout, m.templates.normalizeLayout(afterEdit.widgets, layout));
    ok(await m.panelActions.savePanelDefaults({ panelId: created.id, params: { periodo: "30d" } }));
    assert.equal((await one("dashboard_panels", created.id)).defaults.periodo, "30d");
    const position = (await one("dashboard_panels", created.id)).position;
    ok(await m.panelActions.movePanel({ panelId: created.id, direction: -1 }));
    assert.equal((await one("dashboard_panels", created.id)).position, position - 1);
    const positions = (await rows("dashboard_panels", (q) => q.eq("dashboard_id", dashboardId).order("position"))).map((p) => p.position);
    assert.deepEqual(positions, positions.map((_, i) => i), "posições das abas repetidas ou com buraco");

    ok(await m.panelActions.deletePanel({ panelId: copy.id }));
    ok(await m.panelActions.deletePanel({ panelId: created.id }));
    assert.equal(await one("dashboard_panels", copy.id), undefined);
    // Apagar o padrão passa o "padrão" para outro painel: sempre sobra um.
    assert.equal((await rows("dashboard_panels", (q) => q.eq("dashboard_id", dashboardId).eq("is_default", true))).length, 1);
  });

  test("dashboard em dólar: a cotação é buscada uma vez e fica guardada no banco", async () => {
    const d = data.dashboards[0];
    const base = { dashboardId, name: d.name, timezone: d.timezone, revenueBasis: d.revenueBasis, includeInterest: d.includeInterest, adPlatforms: d.adPlatforms, weekStart: d.weekStart };
    ok(await m.settings.updateDashboardSettings({ ...base, currency: "USD" }));
    assert.equal((await one("dashboards", dashboardId)).currency, "USD");
    try {
      const summary: any = await m.tracking.getDashboardSummary({ user: ana }, dashboardId, { periodo: "30d" });
      assert.equal(summary.fxUnavailable ?? false, false, "sem cotação (a internet estava fora?)");
      const coverage = await rows("fx_coverage", (q) => q.eq("quote", "USD"));
      assert.equal(coverage.length, 1);
      assert.ok(coverage[0].to_date >= new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10), `cobertura até ${coverage[0].to_date}`);
      const rates = await rows("fx_rates", (q) => q.eq("quote", "USD").gte("date", coverage[0].from_date));
      assert.ok(rates.length > 10, `poucas cotações (${rates.length})`);
      assert.ok(rates.every((r) => r.base === "BRL" && Number(r.rate) > 0));
      // Os valores em dólar são menores que em real (a conversão aconteceu).
      const brl: any = await m.scope.readOnStore(structuredClone(data), () => m.tracking.getDashboardSummary({ user: ana }, dashboardId, { periodo: "30d" }));
      assert.ok(summary.current.netCents > 0 && summary.current.netCents < brl.current.netCents, `receita em USD ${summary.current.netCents} × BRL ${brl.current.netCents}`);
    } finally {
      ok(await m.settings.updateDashboardSettings({ ...base, currency: d.currency }));
    }
  });

  test("webhook da Shopify: pedido novo, entrega repetida, atualização e evento atrasado", async () => {
    const shop = data.stores[0];
    const orderId = Date.now();
    const gid = `gid://shopify/Order/${orderId}`;
    const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
    const payload = (updatedAt: string, financial: string, cancelled: string | null = null) => ({
      id: orderId,
      admin_graphql_api_id: gid,
      name: `#T${run}`,
      created_at: at(-10),
      processed_at: at(-10),
      updated_at: updatedAt,
      cancelled_at: cancelled,
      financial_status: financial,
      currency: "BRL",
      total_price: "259.80",
      subtotal_price: "239.80",
      total_tax: "0.00",
      total_discounts: "0.00",
      total_shipping_price_set: { shop_money: { amount: "20.00" } },
      payment_gateway_names: ["pix"],
      line_items: [{ id: 1, product_id: 987654321, title: `Produto novo ${run}`, quantity: 2, price: "119.90" }],
    });

    const first = await m.webhooks.recordDeliveryLive({ deliveryId: `teste-${run}-1`, topic: "orders/create", shopDomain: shop.shopDomain, payload: payload(at(-5), "paid") });
    assert.equal(first.duplicate, false);
    const repeated = await m.webhooks.recordDeliveryLive({ deliveryId: `teste-${run}-1`, topic: "orders/create", shopDomain: shop.shopDomain, payload: payload(at(-5), "paid") });
    assert.deepEqual(repeated, { id: first.id, duplicate: true });
    await m.webhooks.processDeliveryLive(first.id);

    const [order] = await rows("orders", (q) => q.eq("store_id", shop.id).eq("external_id", gid));
    assert.ok(order, "o pedido não chegou ao banco");
    assert.equal(order.status, "paid");
    assert.equal(order.total_cents, 25980);
    assert.equal(order.shipping_cents, 2000);
    assert.equal(order.payment_method, "pix");
    const items = await rows("order_items", (q) => q.eq("order_id", order.id));
    assert.equal(items.length, 1);
    assert.equal(items[0].total_cents, 23980);
    const product = await one("products", items[0].product_id);
    assert.equal(product.name, `Produto novo ${run}`);
    const delivery = await one("webhook_deliveries", first.id);
    assert.ok(delivery.processed_at, "a entrega não foi marcada como processada");
    assert.equal(delivery.payload, null, "o corpo do webhook ficou guardado depois de processado");
    assert.ok((await one("stores", shop.id)).last_event_at, "a loja não registrou o último evento");

    // Cancelamento mais novo muda o pedido; um evento atrasado (mais antigo) não desfaz.
    const cancel = await m.webhooks.recordDeliveryLive({ deliveryId: `teste-${run}-2`, topic: "orders/cancelled", shopDomain: shop.shopDomain, payload: payload(at(-1), "voided", at(-1)) });
    await m.webhooks.processDeliveryLive(cancel.id);
    assert.equal((await one("orders", order.id)).status, "cancelled");
    const late = await m.webhooks.recordDeliveryLive({ deliveryId: `teste-${run}-3`, topic: "orders/paid", shopDomain: shop.shopDomain, payload: payload(at(-3), "paid") });
    await m.webhooks.processDeliveryLive(late.id);
    assert.equal((await one("orders", order.id)).status, "cancelled");
    const events = await rows("order_events", (q) => q.eq("order_id", order.id));
    assert.deepEqual(events.map((e) => e.status).sort(), ["cancelled", "paid"]);

    // A venda aparece na tela de Vendas.
    const list = JSON.stringify(await m.orders.listOrders({ user: ana }, dashboardId, { period: "hoje" }));
    assert.ok(list.includes(`#T${run}`), "a venda nova não apareceu em Vendas");

    // Loja que não é de ninguém: a entrega fica guardada com o erro, sem pedido.
    const stranger = await m.webhooks.recordDeliveryLive({ deliveryId: `teste-${run}-4`, topic: "orders/create", shopDomain: `outra-${run}.myshopify.com`, payload: payload(at(0), "paid") });
    const lost = await one("webhook_deliveries", stranger.id);
    assert.equal(lost.store_id, null);
    assert.match(lost.error, /Loja desconhecida/);
  });
});
