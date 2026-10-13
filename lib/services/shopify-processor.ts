import { db } from '@/lib/db/user.repo';

export async function processShopifyOrder(payload: any, storeId: string, workspaceId: string) {
  // 1. Extração e Normalização de Dados
  const externalId = payload.id.toString();
  const name = payload.name;
  const totalCents = Math.round(parseFloat(payload.total_price) * 100);
  const subtotalCents = Math.round(parseFloat(payload.subtotal_price) * 100);
  const shippingCents = Math.round(parseFloat(payload.total_shipping_price_set?.shop_money?.amount || '0') * 100);
  const taxCents = Math.round(parseFloat(payload.total_tax) * 100);
  const discountCents = Math.round(parseFloat(payload.total_discounts) * 100);

  // 2. Atribuição de UTMs (Lógica simplificada para o MVP)
  // Na vida real, leríamos o CustomerJourneySummary da Shopify
  const utms = payload.customer?.last_visit_utm || {};
  const utmSource = utms.source || 'organic';
  const utmMedium = utms.medium || 'manual';
  const utmCampaign = utms.campaign || 'default';

  // 3. Persistência do Pedido
  const order = await db.order.create({
    data: {
      workspaceId,
      storeId,
      externalId,
      name,
      status: payload.financial_status === 'paid' ? 'paid' : 'waiting_payment',
      paymentMethod: payload.payment_gateway_names?.[0] || 'other',
      currency: payload.currency,
      totalCents,
      subtotalCents,
      shippingCents,
      taxCents,
      discountCents,
      placedAt: new Date(payload.created_at),
      utmSource,
      utmMedium,
      utmCampaign,
      attributionStatus: 'tracked',
      attributedPlatform: utmSource === 'meta' ? 'meta' : utmSource === 'google' ? 'google' : null,
    },
    include: {
      orderItems: {
        create: payload.line_items.map((item: any) => ({
          externalLineId: item.id.toString(),
          name: item.title,
          quantity: item.quantity,
          unitPriceCents: Math.round(parseFloat(item.price) * 100),
          totalCents: Math.round(parseFloat(item.price) * item.quantity * 100),
        })),
      },
    },
  });

  // 4. Disparo de Automações (Butler)
  // Aqui chamaríamos o motor de automações para verificar se a venda dispara algum card
  console.log(`Order ${order.id} processed and attributed to ${utmCampaign}`);

  return order;
}
