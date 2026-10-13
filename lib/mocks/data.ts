export const MOCK_USER = {
  id: 'u1',
  name: 'Soare',
  email: 'soare@intellect.com',
  avatar: '/avatars/soare.png',
  theme: 'dark'
};

export const MOCK_WORKSPACE = {
  id: 'w1',
  name: 'INtellect Main',
  slug: 'intellect-main'
};

export const MOCK_BOARDS = [
  { id: 'b1', name: 'Fluxo de Operações', slug: 'fluxo-operacoes', workspaceId: 'w1' },
  { id: 'b2', name: 'Ideias de Produto', slug: 'ideias-produto', workspaceId: 'w1' },
];

export const MOCK_CARDS = [
  { id: 'c1', boardId: 'b1', name: 'Configurar Webhook Shopify', listId: 'l1', pos: 1 },
  { id: 'c2', boardId: 'b1', name: 'Validar API Meta Ads', listId: 'l1', pos: 2 },
  { id: 'c3', boardId: 'b1', name: 'Ajustar Cores do Dashboard', listId: 'l2', pos: 1 },
];

export const MOCK_DASHBOARD = {
  id: 'd1',
  name: 'Operação Principal',
  currency: 'BRL',
  metrics: {
    revenue: 15400.50,
    spend: 3200.00,
    roas: 4.81,
    profit: 12200.50,
  }
};
