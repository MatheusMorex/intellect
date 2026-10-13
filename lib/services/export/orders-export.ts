import { db } from '@/lib/db/user.repo';

export async function exportOrdersToCSV(dashboardId: string) {
  console.log(`Generating CSV export for dashboard ${dashboardId}...`);

  const orders = await db.order.findMany({
    where: {
      store: {
        workspace: {
          id: dashboardId // Simplificação para o MVP
        }
      }
    },
    orderBy: { placedAt: 'desc' }
  });

  if (orders.length === 0) return null;

  const header = ['Data', 'Pedido', 'Status', 'Metodo', 'Campanha', 'Fonte', 'Meio', 'Valor (R$)'].join(',');

  const rows = orders.map(order => {
    return [
      new Date(order.placedAt).toLocaleDateString('pt-BR'),
      order.name,
      order.status,
      order.paymentMethod,
      order.utmCampaign,
      order.utmSource,
      order.utmMedium,
      (Number(order.totalCents) / 100).toFixed(2).replace('.', ',')
    ].join(',');
  });

  return [header, ...rows].join('\n');
}
