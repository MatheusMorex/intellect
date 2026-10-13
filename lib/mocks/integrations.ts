export const MOCK_INTEGRATIONS = {
  meta: {
    connected: true,
    status: 'active',
    lastSync: '2026-10-13T08:00:00Z',
    accounts: [
      { id: 'acc_meta_1', name: 'Main Ad Account', currency: 'BRL', timezone: 'America/Sao_Paulo' }
    ]
  },
  google: {
    connected: false,
    status: 'disconnected',
    lastSync: null,
    accounts: []
  },
  shopify: {
    connected: true,
    status: 'active',
    shopDomain: 'intellect-store.myshopify.com',
    webhooks: {
      ordersCreate: 'ok',
      ordersPaid: 'ok',
      ordersUpdated: 'error',
      refundsCreate: 'ok'
    },
    lastOrder: {
      id: 'SHP-1003',
      date: '2026-10-13T12:00:00Z'
    }
  }
};
