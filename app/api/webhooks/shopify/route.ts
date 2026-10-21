import { after } from "next/server";

import { processDeliveryLive, recordDeliveryLive } from "@/server/live/webhooks";
import { isLive } from "@/server/mode";
import { processDelivery, recordDelivery, verifyShopifyHmac } from "@/server/shopify/webhooks";

// POST /api/webhooks/shopify (architecture.md, F11): valida o HMAC sobre o corpo
// cru, grava a entrega e responde 200 na hora; o processamento vem depois.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyShopifyHmac(raw, request.headers.get("x-shopify-hmac-sha256"))) {
    return new Response("Assinatura inválida.", { status: 401 });
  }

  const deliveryId = request.headers.get("x-shopify-webhook-id");
  const topic = request.headers.get("x-shopify-topic");
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  if (!deliveryId || !topic || !shopDomain) {
    return new Response("Faltam cabeçalhos da Shopify.", { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Corpo não é JSON.", { status: 400 });
  }

  // Modo real: a entrega vai para o Supabase (server/live/webhooks.ts); as regras são as mesmas.
  const delivery = { deliveryId, topic, shopDomain, payload };
  const { id, duplicate } = isLive() ? await recordDeliveryLive(delivery) : recordDelivery(delivery);
  if (!duplicate) after(() => (isLive() ? processDeliveryLive(id) : processDelivery(id)));
  return new Response(null, { status: 200 });
}
