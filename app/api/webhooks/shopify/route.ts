import { after } from "next/server";
import { db } from '@/lib/db/user.repo';
import crypto from 'crypto';
import { processShopifyOrder } from '@/lib/services/shopify-processor';

// A chave secreta deve vir do ambiente para cada loja
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || 'test_secret';

function verifyShopifyHmac(body: string, hmacHeader: string | null) {
  if (!hmacHeader) return false;
  const hash = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(body)
    .digest('base64');
  return hash === hmacHeader;
}

async function recordDelivery(deliveryId: string, topic: string, shopDomain: string, payload: any) {
  const delivery = await db.webhookDelivery.create({
    data: {
      source: 'shopify',
      deliveryId: deliveryId,
      topic: topic,
      payload: payload,
      store: {
        connect: { shopDomain: shopDomain }
      }
    }
  });
  return { id: delivery.id, duplicate: false };
}

async function processDelivery(id: string) {
  const delivery = await db.webhookDelivery.findUnique({
    where: { id },
    include: { store: { include: { workspace: true } } }
  });

  if (!delivery || !delivery.store) return;

  const { topic, payload } = delivery;
  const storeId = delivery.store.id;
  const workspaceId = delivery.store.workspaceId;

  if (topic === 'orders/create' || topic === 'orders/paid') {
    try {
      await processShopifyOrder(payload, storeId, workspaceId);
      console.log(`Order processed successfully for delivery ${id}`);
    } catch (e) {
      console.error(`Error processing order in delivery ${id}:`, e);
    }
  }
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyShopifyHmac(raw, request.headers.get("x-shopify-hmac-sha256"))) {
    return new Response("Assinatura inválida.", { status: 401 });
  }

  const deliveryId = request.headers.get("x-shopify-webhook-id") || 'unknown';
  const topic = request.headers.get("x-shopify-topic");
  const shopDomain = request.headers.get("x-shopify-shop-domain");

  if (!topic || !shopDomain) {
    return new Response("Faltam cabeçalhos da Shopify.", { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Corpo não é JSON.", { status: 400 });
  }

  const { id, duplicate } = await recordDelivery(deliveryId, topic, shopDomain, payload);
  if (!duplicate) after(() => processDelivery(id));

  return new Response(null, { status: 200 });
}
