import assert from "node:assert/strict";
import { test } from "node:test";

import { DASHBOARD_CURRENCIES, isDashboardCurrency } from "../lib/currency.ts";
import { money } from "../lib/format.ts";
import { createSeed, STORE_VERSION, upgradeStore } from "../server/store/seed.ts";

test("dólar entra na lista de moedas do dashboard (nas configurações)", () => {
  assert.equal(isDashboardCurrency("USD"), true);
  assert.deepEqual(
    DASHBOARD_CURRENCIES.map((c) => c.code),
    ["BRL", "EUR", "GBP", "CHF", "USD"],
  );
  assert.equal(money(123_456, "USD"), "US$ 1.234,56");
});

test("dashboard novo começa a semana na segunda", () => {
  const store = createSeed(new Date("2026-10-17T15:00:00Z"));
  assert.equal(store.version, STORE_VERSION);
  assert.ok(store.dashboards.length > 0);
  for (const d of store.dashboards) assert.equal(d.weekStart, "monday");
});

test("dados simulados da versão 6 ganham o início da semana sem perder o resto", () => {
  const store = createSeed(new Date("2026-10-17T15:00:00Z"));
  const before = structuredClone(store.dashboards);
  for (const d of store.dashboards) delete (d as Partial<typeof d>).weekStart;
  store.version = 6;
  const upgraded = upgradeStore(store);
  assert.ok(upgraded);
  assert.equal(upgraded.version, STORE_VERSION);
  assert.deepEqual(upgraded.dashboards, before);
});

test("quem já escolheu domingo continua com domingo ao atualizar", () => {
  const store = createSeed(new Date("2026-10-17T15:00:00Z"));
  store.dashboards[0].weekStart = "sunday";
  store.version = 6;
  assert.equal(upgradeStore(store)?.dashboards[0].weekStart, "sunday");
});
