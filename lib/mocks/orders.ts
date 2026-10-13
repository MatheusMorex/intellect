export const MOCK_ORDERS = [
  {
    id: 'ord1',
    externalId: 'SHP-1001',
    status: 'paid',
    method: 'pix',
    value: 297.00,
    commission: 250.00,
    campaign: 'Black Friday 2026',
    utmSource: 'meta',
    utmMedium: 'paid',
    utmCampaign: 'bf_2026_main',
    createdAt: '2026-10-13T10:30:00Z'
  },
  {
    id: 'ord2',
    externalId: 'SHP-1002',
    status: 'paid',
    method: 'credit_card',
    value: 497.00,
    commission: 410.00,
    campaign: 'Google Search - Brand',
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'brand_search',
    createdAt: '2026-10-13T11:15:00Z'
  },
  {
    id: 'ord3',
    externalId: 'SHP-1003',
    status: 'waiting_payment',
    method: 'boleto',
    value: 197.00,
    commission: 160.00,
    campaign: 'Black Friday 2026',
    utmSource: 'meta',
    utmMedium: 'paid',
    utmCampaign: 'bf_2026_main',
    createdAt: '2026-10-13T12:00:00Z'
  },
];
