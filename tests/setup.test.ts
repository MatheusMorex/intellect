// S29 Configuração inicial: cada passo fica marcado sozinho pelo estado do
// dashboard. Roda sobre os dados de exemplo em memória, sem banco.

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import type { SessionUser } from "../server/auth/session.ts";
import { createSeed } from "../server/store/seed.ts";
import type { Store } from "../server/store/types.ts";

// Os dados ficam em memória (server/live/scope.ts, readOnStore); nada é lido do disco nem do banco.
process.env.AUTH_MODE = "live";

describe("configuração inicial do dashboard", () => {
  let seed: Store;
  let ctx: { user: SessionUser };
  let m: { scope: typeof import("../server/live/scope.ts"); settings: typeof import("../server/data/settings.ts") };

  before(async () => {
    seed = createSeed(new Date());
    const ana = seed.users.find((u) => u.email.startsWith("ana"))!;
    ctx = { user: { id: ana.id, name: ana.name, email: ana.email, username: ana.username, avatarColor: ana.avatarColor, timezone: ana.timezone } };
    m = { scope: await import("../server/live/scope.ts"), settings: await import("../server/data/settings.ts") };
  });

  const setupOf = (data: Store, dashboardId = data.dashboards[0].id) => m.scope.readOnStore(data, () => m.settings.getSetup(ctx, dashboardId));
  const state = (steps: { id: string; done: boolean }[]) => Object.fromEntries(steps.map((s) => [s.id, s.done]));

  test("dashboard de exemplo: contas, loja e parâmetros prontos; falta só o teste", async () => {
    const setup = await setupOf(structuredClone(seed));
    assert.deepEqual(state(setup.steps), { plataformas: true, meta: true, google: true, loja: true, parametros: true, teste: false });
    assert.equal(setup.done, 5);
  });

  test("teste concluído completa a configuração", async () => {
    const data = structuredClone(seed);
    const d = data.dashboards[0];
    data.integrationTests.push({ id: crypto.randomUUID(), dashboardId: d.id, trafficSource: "meta", campaignUrl: "https://loja.exemplo/", testCode: "abc123", status: "attributed", orderId: null, createdBy: null, createdAt: new Date().toISOString() });
    const setup = await setupOf(data);
    assert.equal(setup.done, setup.steps.length);
  });

  test("dashboard novo, sem nada ligado: só o primeiro passo feito, e cada plataforma escolhida vira um passo", async () => {
    const data = structuredClone(seed);
    const base = data.dashboards[0];
    const fresh = { ...base, id: crypto.randomUUID(), name: "Operação nova", adPlatforms: ["meta" as const] };
    data.dashboards.push(fresh);
    const setup = await setupOf(data, fresh.id);
    assert.deepEqual(state(setup.steps), { plataformas: true, meta: false, loja: false, parametros: false, teste: false });
    // A conta do Meta está conectada no workspace: falta só escolher as contas deste dashboard.
    assert.match(setup.steps.find((s) => s.id === "meta")!.detail, /Falta escolher as contas/);
  });

  test("sem plataformas de anúncio, o passo dos parâmetros some (só vendas orgânicas)", async () => {
    const data = structuredClone(seed);
    data.dashboards[0].adPlatforms = [];
    const setup = await setupOf(data);
    assert.deepEqual(
      setup.steps.map((s) => s.id),
      ["plataformas", "loja", "teste"],
    );
  });
});
