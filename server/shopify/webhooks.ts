// Webhooks da Shopify (F11): validar, gravar a entrega, processar o pedido.
// A rota responde 200 na hora e processa depois (no backend real, pelo job
// shopify.process-delivery do pg-boss; aqui, pelo after() do Next).

import crypto from "node:crypto";

import { attribute, type AdIndex, type Platform } from "@/server/attribution/attribute";
import { shopifyClient } from "@/server/integrations/shopify";
import { mutate, newId, nowIso, readStore } from "@/server/store/db";
import type { OrderRow, OrderStatus, PaymentMethod, Store } from "@/server/store/types";

export function verifyShopifyHmac(rawBody: string, header: string | null, secret = process.env.SHOPIFY_WEBHOOK_SECRET) {
  if (!header || !secret) return false;
  const expected = Buffer.from(crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"));
  const given = Buffer.from(header);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Grava a entrega pelo X-Shopify-Webhook-Id. A mesma entrega duas vezes só é processada uma vez. */
export function recordDelivery(input: { deliveryId: string; topic: string; shopDomain: string; payload: unknown }) {
  return mutate((store) => {
    const existing = store.webhookDeliveries.find((d) => d.source === "shopify" && d.deliveryId === input.deliveryId);
    if (existing) return { id: existing.id, duplicate: true };
    const shop = store.stores.find((s) => s.shopDomain === input.shopDomain.toLowerCase());
    const id = newId();
    store.webhookDeliveries.push({
      id,
      storeId: shop?.id ?? null,
      source: "shopify",
      deliveryId: input.deliveryId,
      topic: input.topic,
      payload: input.payload,
      receivedAt: nowIso(),
      processedAt: null,
      attempts: 0,
      error: shop ? null : "Loja desconhecida: o webhook não é de uma loja conectada.",
    });
    if (shop) shop.lastEventAt = nowIso();
    return { id, duplicate: false };
  });
}

// ---- tradução do pedido da Shopify -------------------------------------------------

type ShopifyLine = { id: number | string; product_id: number | string | null; title: string; quantity: number; price: string };
type ShopifyOrder = {
  id: number | string;
  admin_graphql_api_id?: string;
  name: string;
  created_at: string;
  updated_at: string;
  processed_at?: string;
  cancelled_at?: string | null;
  financial_status: string;
  currency: string;
  total_price: string;
  subtotal_price?: string;
  total_tax?: string;
  total_discounts?: string;
  total_shipping_price_set?: { shop_money?: { amount?: string } };
  payment_gateway_names?: string[];
  test?: boolean;
  line_items?: ShopifyLine[];
  refunds?: { transactions?: { amount: string; kind?: string; status?: string }[] }[];
  customer?: { id?: number | string } | null;
};

const cents = (value: string | undefined | null) => Math.round(Number(value ?? 0) * 100);

export function statusFrom(order: Pick<ShopifyOrder, "financial_status" | "cancelled_at">): OrderStatus {
  switch (order.financial_status) {
    case "paid":
    case "partially_refunded":
      return "paid";
    case "refunded":
      return "refunded";
    case "voided":
      return order.cancelled_at ? "cancelled" : "refused";
    default:
      return order.cancelled_at ? "cancelled" : "waiting_payment";
  }
}

export function paymentMethodFrom(gateways: string[] | undefined): PaymentMethod {
  const names = (gateways ?? []).join(" ").toLowerCase();
  if (names.includes("pix")) return "pix";
  if (names.includes("boleto")) return "boleto";
  if (names.includes("paypal")) return "paypal";
  if (/(card|cart|credit|shopify_payments|stripe|mercado|pagar|cielo)/.test(names)) return "credit_card";
  return "other";
}

function adIndex(store: Store, workspaceId: string): AdIndex {
  const accounts = store.adAccounts.filter((a) => a.workspaceId === workspaceId);
  const providerOf = new Map(accounts.map((a) => [a.id, a.provider]));
  const key = (p: Platform, ext: string) => `${p}:${ext}`;
  const ads = new Map<string, { campaignId: string; adSetId: string; adId: string }>();
  const sets = new Map<string, { campaignId: string; adSetId: string }>();
  const campaigns = new Map<string, { campaignId: string }>();
  for (const a of store.ads) {
    const p = providerOf.get(a.adAccountId);
    if (p) ads.set(key(p, a.externalId), { campaignId: a.campaignId, adSetId: a.adSetId, adId: a.id });
  }
  for (const s of store.adSets) {
    const p = providerOf.get(s.adAccountId);
    if (p) sets.set(key(p, s.externalId), { campaignId: s.campaignId, adSetId: s.id });
  }
  for (const c of store.campaigns) {
    const p = providerOf.get(c.adAccountId);
    if (!p) continue;
    campaigns.set(key(p, c.externalId), { campaignId: c.id });
    campaigns.set(key(p, c.name), { campaignId: c.id });
  }
  return {
    findAd: (p, ext) => ads.get(key(p, ext)) ?? null,
    findAdSet: (p, ext) => sets.get(key(p, ext)) ?? null,
    findCampaign: (p, extOrName) => campaigns.get(key(p, extOrName)) ?? null,
  };
}

const ORDER_TOPICS = new Set(["orders/create", "orders/updated", "orders/paid", "orders/cancelled"]);

export async function processDelivery(deliveryId: string) {
  const delivery = readStore().webhookDeliveries.find((d) => d.id === deliveryId);
  if (!delivery || delivery.processedAt || !delivery.storeId) return;

  if (!ORDER_TOPICS.has(delivery.topic)) {
    mutate((store) => {
      const d = store.webhookDeliveries.find((x) => x.id === deliveryId)!;
      d.processedAt = nowIso();
      d.payload = null;
      d.error = `Tópico ${delivery.topic} ainda não é tratado nesta etapa.`;
    });
    return;
  }

  const payload = delivery.payload as ShopifyOrder;
  const orderGid = payload.admin_graphql_api_id ?? `gid://shopify/Order/${payload.id}`;
  const shop = readStore().stores.find((s) => s.id === delivery.storeId)!;

  // A jornada vem de outra chamada à Shopify, fora da "transação".
  let journey = null;
  let journeyError: string | null = null;
  try {
    journey = await shopifyClient().getCustomerJourney(shop.shopDomain, orderGid);
  } catch (error) {
    journeyError = error instanceof Error ? error.message : String(error);
  }

  mutate((store) => {
    const d = store.webhookDeliveries.find((x) => x.id === deliveryId)!;
    d.attempts += 1;
    const updatedAt = new Date(payload.updated_at).toISOString();
    const existing = store.orders.find((o) => o.storeId === shop.id && o.externalId === orderGid);
    // Evento mais antigo que o que já temos não desfaz o mais novo.
    if (existing && existing.sourceUpdatedAt > updatedAt) {
      d.processedAt = nowIso();
      d.payload = null;
      return;
    }

    const status = statusFrom(payload);
    const refunded = (payload.refunds ?? [])
      .flatMap((r) => r.transactions ?? [])
      .filter((t) => (t.kind ?? "refund") === "refund" && (t.status ?? "success") === "success")
      .reduce((sum, t) => sum + cents(t.amount), 0);
    const result = attribute(journey, adIndex(store, shop.workspaceId));
    const placedAt = new Date(payload.processed_at ?? payload.created_at).toISOString();
    const orderId = existing?.id ?? newId();

    const row: OrderRow = {
      id: orderId,
      workspaceId: shop.workspaceId,
      storeId: shop.id,
      externalId: orderGid,
      name: payload.name,
      status,
      paymentMethod: paymentMethodFrom(payload.payment_gateway_names),
      currency: payload.currency,
      totalCents: cents(payload.total_price),
      subtotalCents: cents(payload.subtotal_price),
      shippingCents: cents(payload.total_shipping_price_set?.shop_money?.amount),
      taxCents: cents(payload.total_tax),
      discountCents: cents(payload.total_discounts),
      refundedCents: status === "refunded" ? cents(payload.total_price) : refunded,
      gatewayFeeCents: existing?.gatewayFeeCents ?? null, // vem das transações (Shopify Payments), não do webhook
      interestCents: 0,
      isTest: Boolean(payload.test) || result.isTest,
      placedAt,
      paidAt: status === "paid" ? (existing?.paidAt ?? updatedAt) : (existing?.paidAt ?? null),
      sourceUpdatedAt: updatedAt,
      firstVisit: journey?.firstVisit ?? null,
      lastVisit: journey?.lastVisit ?? null,
      landingPage: result.landingPage,
      daysToConversion: journey?.daysToConversion ?? null,
      utmSource: result.utmSource,
      utmMedium: result.utmMedium,
      utmCampaign: result.utmCampaign,
      utmContent: result.utmContent,
      utmTerm: result.utmTerm,
      src: result.src,
      sck: result.sck,
      // Sem jornada ainda: no backend real fica "pending" e o job journey-retry tenta de novo.
      attributionStatus: journey ? result.status : journeyError ? "pending" : "untracked",
      attributedPlatform: result.platform,
      campaignId: result.campaignId,
      adSetId: result.adSetId,
      adId: result.adId,
      createdAt: existing?.createdAt ?? nowIso(),
    };
    if (existing) Object.assign(existing, row);
    else store.orders.push(row);

    // Itens e produtos (o produto passa a existir na primeira venda, como no recon).
    store.orderItems = store.orderItems.filter((i) => i.orderId !== orderId);
    for (const line of payload.line_items ?? []) {
      const productGid = line.product_id ? `gid://shopify/Product/${line.product_id}` : null;
      let product = productGid ? store.products.find((p) => p.storeId === shop.id && p.externalId === productGid) : undefined;
      if (productGid && !product) {
        product = { id: newId(), workspaceId: shop.workspaceId, storeId: shop.id, externalId: productGid, name: line.title };
        store.products.push(product);
      }
      const unit = cents(line.price);
      store.orderItems.push({
        id: newId(),
        orderId,
        productId: product?.id ?? null,
        externalLineId: String(line.id),
        name: line.title,
        quantity: line.quantity,
        unitPriceCents: unit,
        totalCents: unit * line.quantity,
      });
    }

    store.orderEvents.push({
      id: newId(),
      orderId,
      status,
      occurredAt: updatedAt,
      topic: delivery.topic,
      webhookDeliveryId: d.id,
    });
    d.processedAt = nowIso();
    d.error = journeyError;
    d.payload = null; // LGPD: o corpo do webhook não fica guardado depois de processado
  });
}
