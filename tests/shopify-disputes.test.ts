// Chargeback pela Shopify (disputes/create e disputes/update): o pedido pago vira
// "Chargeback"; a disputa ganha devolve para "Pago"; consulta (inquiry) não muda
// nada; um orders/updated depois não desfaz o chargeback; refunds/create é aceito
// sem erro (o valor do reembolso chega pelo orders/updated). Roda sobre os dados
// de exemplo em memória, sem banco.

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { createSeed } from "../server/store/seed.ts";
import type { OrderRow, Store } from "../server/store/types.ts";

// Os dados ficam em memória (server/live/scope.ts, readOnStore); nada é lido do disco nem do banco.
process.env.AUTH_MODE = "live";

describe("chargeback pela Shopify", () => {
  let seed: Store;
  let m: { scope: typeof import("../server/live/scope.ts"); webhooks: typeof import("../server/shopify/webhooks.ts") };

  before(async () => {
    seed = createSeed(new Date());
    m = { scope: await import("../server/live/scope.ts"), webhooks: await import("../server/shopify/webhooks.ts") };
  });

  const shopDomain = () => seed.stores[0].shopDomain;
  const numericId = (o: OrderRow) => o.externalId.split("/").pop()!;
  let deliveries = 0;

  /** Grava e processa uma entrega, como a rota faz; devolve a entrega depois de processada. */
  async function deliver(data: Store, topic: string, payload: unknown) {
    return m.scope.readOnStore(data, async () => {
      const { id } = m.webhooks.recordDelivery({ deliveryId: `teste-disputa-${++deliveries}`, topic, shopDomain: shopDomain(), payload });
      await m.webhooks.processDelivery(id);
      return data.webhookDeliveries.find((d) => d.id === id)!;
    });
  }

  const dispute = (order: OrderRow, status: string, type = "chargeback") => ({
    id: 9000 + deliveries,
    order_id: Number(numericId(order)),
    type,
    status,
    amount: (order.totalCents / 100).toFixed(2),
    currency: order.currency,
    reason: "fraudulent",
    initiated_at: "2026-10-21T10:00:00-03:00",
    finalized_on: status === "won" || status === "lost" ? "2026-10-25T10:00:00-03:00" : null,
  });

  test("disputa aberta deixa o pedido pago como Chargeback, com o evento na linha do tempo", async () => {
    const data = structuredClone(seed);
    const order = data.orders.find((o) => o.status === "paid" && !o.isTest)!;
    const delivery = await deliver(data, "disputes/create", dispute(order, "needs_response"));
    assert.equal(delivery.error, null);
    assert.ok(delivery.processedAt);
    assert.equal(delivery.payload, null, "o corpo do webhook não fica guardado");
    assert.equal(order.status, "chargedback");
    const event = data.orderEvents.filter((e) => e.orderId === order.id).at(-1)!;
    assert.deepEqual([event.status, event.topic], ["chargedback", "disputes/create"]);
  });

  test("disputa ganha devolve o pedido para Pago; perdida continua Chargeback", async () => {
    const data = structuredClone(seed);
    const [won, lost] = data.orders.filter((o) => o.status === "paid" && !o.isTest);
    await deliver(data, "disputes/create", dispute(won, "needs_response"));
    await deliver(data, "disputes/update", dispute(won, "won"));
    assert.equal(won.status, "paid");
    await deliver(data, "disputes/create", dispute(lost, "under_review"));
    await deliver(data, "disputes/update", dispute(lost, "lost"));
    assert.equal(lost.status, "chargedback");
  });

  test("consulta (inquiry) não muda o pedido; pedido que não está pago não vira chargeback", async () => {
    const data = structuredClone(seed);
    const paid = data.orders.find((o) => o.status === "paid" && !o.isTest)!;
    await deliver(data, "disputes/create", dispute(paid, "needs_response", "inquiry"));
    assert.equal(paid.status, "paid");
    const pending = data.orders.find((o) => o.status === "waiting_payment")!;
    await deliver(data, "disputes/create", dispute(pending, "needs_response"));
    assert.equal(pending.status, "waiting_payment");
  });

  test("disputa de pedido que ainda não chegou fica registrada com o motivo", async () => {
    const data = structuredClone(seed);
    const fake = { ...data.orders[0], externalId: "gid://shopify/Order/123456789012345" };
    const delivery = await deliver(data, "disputes/create", dispute(fake, "needs_response"));
    assert.match(delivery.error ?? "", /ainda não chegou/);
  });

  test("orders/updated depois do chargeback não volta o pedido para Pago", async () => {
    const data = structuredClone(seed);
    const order = data.orders.find((o) => o.status === "paid" && !o.isTest)!;
    await deliver(data, "disputes/create", dispute(order, "needs_response"));
    const later = new Date(Date.parse(order.sourceUpdatedAt) + 60_000).toISOString();
    await deliver(data, "orders/updated", {
      id: Number(numericId(order)),
      admin_graphql_api_id: order.externalId,
      name: order.name,
      created_at: order.placedAt,
      processed_at: order.placedAt,
      updated_at: later,
      financial_status: "paid",
      currency: order.currency,
      total_price: (order.totalCents / 100).toFixed(2),
      line_items: [],
    });
    assert.equal(order.status, "chargedback");
  });

  test("refunds/create é aceito sem erro (o valor do reembolso chega pelo orders/updated)", async () => {
    const data = structuredClone(seed);
    const order = data.orders.find((o) => o.status === "paid" && !o.isTest)!;
    const before = structuredClone(order);
    const delivery = await deliver(data, "refunds/create", { id: 77, order_id: Number(numericId(order)), transactions: [{ kind: "refund", status: "success", amount: "10.00" }] });
    assert.equal(delivery.error, null);
    assert.ok(delivery.processedAt);
    assert.deepEqual(order, before);
  });
});
