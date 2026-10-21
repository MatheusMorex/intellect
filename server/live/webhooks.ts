// Webhooks da Shopify no modo real (AUTH_MODE=live). Não há pessoa logada: a
// entrega é gravada e processada sobre o retrato do workspace da loja
// (withLiveWorkspace), com vendas e anúncios e só a entrega em questão. As
// regras são as mesmas do modo simulado (server/shopify/webhooks.ts).

import crypto from "node:crypto";

import { adminClient } from "@/server/db/admin";
import { processDelivery, recordDelivery } from "@/server/shopify/webhooks";
import { nowIso } from "@/server/store/db";

import { withLiveWorkspace } from "./scope";

type Delivery = { deliveryId: string; topic: string; shopDomain: string; payload: unknown };

export async function recordDeliveryLive(input: Delivery): Promise<{ id: string; duplicate: boolean }> {
  const db = adminClient();
  const { data: shop, error } = await db.from("stores").select("workspace_id").eq("shop_domain", input.shopDomain.toLowerCase()).maybeSingle();
  if (error) throw new Error(`[webhook] ler a loja: ${error.message}`);
  if (shop) {
    return withLiveWorkspace(shop.workspace_id as string, async () => recordDelivery(input), {
      tracking: true,
      deliveries: { deliveryIds: [input.deliveryId] },
    });
  }
  // Loja desconhecida: a entrega fica guardada com o erro, como no modo simulado (a mesma entrega duas vezes vira uma só).
  const { data: existing } = await db.from("webhook_deliveries").select("id").eq("source", "shopify").eq("delivery_id", input.deliveryId).maybeSingle();
  if (existing) return { id: existing.id as string, duplicate: true };
  const id = crypto.randomUUID();
  const { error: insertError } = await db.from("webhook_deliveries").insert({
    id,
    store_id: null,
    source: "shopify",
    delivery_id: input.deliveryId,
    topic: input.topic,
    payload: input.payload,
    received_at: nowIso(),
    attempts: 0,
    error: "Loja desconhecida: o webhook não é de uma loja conectada.",
  });
  if (insertError?.code === "23505") return { id, duplicate: true };
  if (insertError) throw new Error(`[webhook] gravar a entrega: ${insertError.message}`);
  return { id, duplicate: false };
}

export async function processDeliveryLive(deliveryRowId: string) {
  const { data, error } = await adminClient().from("webhook_deliveries").select("stores!inner(workspace_id)").eq("id", deliveryRowId).maybeSingle();
  if (error) throw new Error(`[webhook] ler a entrega: ${error.message}`);
  const workspaceId = (data?.stores as unknown as { workspace_id: string } | null)?.workspace_id;
  if (!workspaceId) return;
  await withLiveWorkspace(workspaceId, () => processDelivery(deliveryRowId), { tracking: true, deliveries: { ids: [deliveryRowId] } });
}
