import { db } from './user.repo';

export const TrackingRepo = {
  async getDashboardMetrics(dashboardId: string, period: string) {
    // Esta consulta simula a agregação de faturamento líquido e gastos
    // Na implementação real, faremos joins complexos entre AdInsightDaily e Order
    const orders = await db.order.findMany({
      where: {
        store: {
          dashboards: {
            some: { id: dashboardId }
          }
        }
      },
    });

    const revenue = orders.reduce((acc, order) => acc + Number(order.totalCents), 0) / 100;

    return {
      revenue,
      spend: 3200.00, // Placeholder para a soma de ad_insights_daily
      roas: revenue / 3200.00,
      profit: revenue - 3200.00,
    };
  },

  async getSalesList(dashboardId: string) {
    return db.order.findMany({
      where: {
        store: {
          dashboards: {
            some: { id: dashboardId }
          }
        }
      },
      orderBy: { placedAt: 'desc' },
      include: {
        campaign: true,
      }
    });
  },

  async linkCardToMetric(cardId: string, dashboardId: string, target: { type: string, id: string }) {
    return db.cardLink.create({
      data: {
        cardId,
        dashboardId,
        targetType: target.type,
        campaignId: target.type === 'campaign' ? target.id : null,
        adSetId: target.type === 'ad_set' ? target.id : null,
        adId: target.type === 'ad' ? target.id : null,
        productId: target.type === 'product' ? target.id : null,
      }
    });
  }
};
