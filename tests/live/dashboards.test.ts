// Telas S20 (Dashboards), S27 (UTMs) e S29 (Configuração inicial) no modo real,
// contra o projeto de TESTE (nunca o principal): criar um dashboard, ligar contas
// e loja, o passo a passo marcando sozinho, o relatório por UTM igual ao calculado
// sobre os dados originais e excluir levando junto só o que é do dashboard.
// Rodam com `npm run test:live`. No fim, tudo o que o teste criou é apagado.

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

describe("dashboards, UTMs e configuração inicial no Supabase", { skip: !enabled || !isTestProject ? "sem .env.test.local do projeto de teste" : false }, () => {
  const admin = enabled ? createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } }) : (null as unknown as SupabaseClient);
  let data: Store;
  let ana: SessionUser;
  let bruno: SessionUser;
  let workspaceId = "";
  let mainId = "";
  let fresh = "";

  let m: {
    dashboards: typeof import("../../server/actions/dashboards.ts");
    integrations: typeof import("../../server/actions/integrations.ts");
    settings: typeof import("../../server/data/settings.ts");
    utms: typeof import("../../server/data/utms.ts");
    scope: typeof import("../../server/live/scope.ts");
    session: typeof import("./test-session.ts");
  };

  const rows = async (table: string, filter: (q: any) => any) => {
    const { data: found, error } = await filter(admin.from(table).select("*"));
    assert.ifError(error);
    return found as Record<string, any>[];
  };
  const ok = <T>(r: { ok: true; data: T } | { ok: false; error: string }) => {
    assert.ok(r.ok, r.ok ? "" : r.error);
    return (r as { ok: true; data: T }).data;
  };
  const person = (u: Store["users"][number]): SessionUser => ({ id: u.id, name: u.name, email: u.email, username: u.username, avatarColor: u.avatarColor, timezone: u.timezone });

  before(async () => {
    const { createSeed } = await import("../../server/store/seed.ts");
    const { copyWithNewIds, writeSeed } = await import("../../server/live/write-seed.ts");
    data = (await writeSeed(admin, copyWithNewIds(createSeed(new Date()), `dash-${run}`), "Teste-Segura-123")).data;
    workspaceId = data.workspaces[0].id;
    mainId = data.dashboards[0].id;
    ana = person(data.users.find((u) => u.email.startsWith("ana-"))!);
    bruno = person(data.users.find((u) => u.email.startsWith("bruno-"))!);
    m = {
      dashboards: await import("../../server/actions/dashboards.ts"),
      integrations: await import("../../server/actions/integrations.ts"),
      settings: await import("../../server/data/settings.ts"),
      utms: await import("../../server/data/utms.ts"),
      scope: await import("../../server/live/scope.ts"),
      session: await import("./test-session.ts"),
    };
  });

  after(async () => {
    if (!enabled || !isTestProject || !data) return;
    await admin.from("workspaces").delete().eq("id", workspaceId);
    for (const s of data.stores) await admin.from("stores").delete().eq("shop_domain", s.shopDomain);
    for (const u of data.users) await admin.auth.admin.deleteUser(u.id);
  });

  test("relatório por UTM: os números lidos do banco são os mesmos dos dados originais", async () => {
    for (const por of m.utms.UTM_PARAMS) {
      const sp = { periodo: "maximo", por };
      const live = await m.utms.getUtmReport({ user: ana }, mainId, sp);
      const original = await m.scope.readOnStore(structuredClone(data), () => m.utms.getUtmReport({ user: ana }, mainId, sp));
      assert.deepEqual(live, original, por);
    }
  });

  test("criar dashboard: só admin; nasce com o painel Visão geral e sem nada ligado", async () => {
    const values = { workspaceId, name: `Operação ${run}`, currency: "USD", timezone: "America/New_York", revenueBasis: "gross" as const, includeInterest: true, adPlatforms: ["meta" as const], weekStart: "sunday" as const };
    m.session.actAs(bruno);
    assert.equal((await m.dashboards.createDashboard(values)).ok, false, "quem não é admin não cria");
    m.session.actAs(ana);
    fresh = ok(await m.dashboards.createDashboard(values)).id;
    const [row] = await rows("dashboards", (q) => q.eq("id", fresh));
    assert.equal(row.name, `Operação ${run}`);
    assert.equal(row.currency, "USD");
    assert.equal(row.timezone, "America/New_York");
    assert.equal(row.revenue_basis, "gross");
    assert.equal(row.include_interest, true);
    assert.deepEqual(row.ad_platforms, ["meta"]);
    assert.equal(row.week_start, "sunday");
    const panels = await rows("dashboard_panels", (q) => q.eq("dashboard_id", fresh));
    assert.deepEqual(
      panels.map((p) => [p.name, p.is_default]),
      [["Visão geral", true]],
    );
    const setup = await m.settings.getSetup({ user: ana }, fresh);
    assert.deepEqual(
      setup.steps.map((s) => [s.id, s.done]),
      [
        ["plataformas", true],
        ["meta", false],
        ["loja", false],
        ["parametros", false],
        ["teste", false],
      ],
    );
  });

  test("ligar a conta do Meta e a loja: o passo a passo marca sozinho, e as vendas da loja passam a contar", async () => {
    m.session.actAs(ana);
    const meta = data.adAccounts.find((a) => a.provider === "meta")!;
    const shop = data.stores[0];
    ok(await m.integrations.setDashboardAccount({ dashboardId: fresh, accountId: meta.id, enabled: true }));
    ok(await m.integrations.setDashboardStore({ dashboardId: fresh, storeId: shop.id, enabled: true }));
    assert.equal((await rows("dashboard_stores", (q) => q.eq("dashboard_id", fresh).eq("store_id", shop.id))).length, 1);
    const setup = await m.settings.getSetup({ user: ana }, fresh);
    assert.deepEqual(
      setup.steps.map((s) => [s.id, s.done]),
      [
        ["plataformas", true],
        ["meta", true],
        ["loja", true],
        ["parametros", true],
        ["teste", false],
      ],
    );
    const utm = await m.utms.getUtmReport({ user: ana }, fresh, { periodo: "maximo", por: "source" });
    assert.ok(utm.totals.orders > 0, "as vendas da loja deveriam aparecer no dashboard novo");
    // Desligar a loja tira as vendas de novo.
    ok(await m.integrations.setDashboardStore({ dashboardId: fresh, storeId: shop.id, enabled: false }));
    assert.equal((await rows("dashboard_stores", (q) => q.eq("dashboard_id", fresh))).length, 0);
    ok(await m.integrations.setDashboardStore({ dashboardId: fresh, storeId: shop.id, enabled: true }));
  });

  test("a lista de dashboards mostra o que cada um tem ligado e o que a exclusão leva junto", async () => {
    const list = await m.settings.listDashboardsForSettings({ user: ana });
    const main = list.dashboards.find((d) => d.id === mainId)!;
    const created = list.dashboards.find((d) => d.id === fresh)!;
    assert.equal(created.metaAccounts, 1);
    assert.equal(created.stores, 1);
    assert.equal(created.panels, 1);
    assert.ok(main.expenses > 0 && main.cardLinks > 0, "o dashboard de exemplo tem despesas e cards ligados");
    assert.equal(main.canManage, true);
  });

  test("excluir: pede o nome certo; leva junto o que é do dashboard; pedidos e gastos ficam", async () => {
    m.session.actAs(ana);
    const ordersBefore = (await rows("orders", (q) => q.eq("workspace_id", workspaceId).select("id"))).length;
    assert.equal((await m.dashboards.deleteDashboard({ dashboardId: mainId, confirmName: "outro nome" })).ok, false);
    m.session.actAs(bruno);
    assert.equal((await m.dashboards.deleteDashboard({ dashboardId: mainId, confirmName: data.dashboards[0].name })).ok, false, "quem não é admin não exclui");
    m.session.actAs(ana);
    ok(await m.dashboards.deleteDashboard({ dashboardId: mainId, confirmName: data.dashboards[0].name }));
    assert.equal((await rows("dashboards", (q) => q.eq("id", mainId))).length, 0);
    for (const table of ["dashboard_ad_accounts", "dashboard_stores", "cost_settings", "additional_fees", "expenses", "dashboard_panels", "card_links", "automations"]) {
      assert.equal((await rows(table, (q) => q.eq("dashboard_id", mainId))).length, 0, `${table} ficou`);
    }
    assert.equal((await rows("orders", (q) => q.eq("workspace_id", workspaceId).select("id"))).length, ordersBefore, "os pedidos são da loja e ficam");
    // O dashboard novo continua com a loja e as contas.
    assert.equal((await rows("dashboard_stores", (q) => q.eq("dashboard_id", fresh))).length, 1);
  });
});
