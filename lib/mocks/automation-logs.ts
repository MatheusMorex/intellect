export const MOCK_AUTOMATION_LOGS = [
  {
    id: 'log1',
    date: '2026-10-13T10:15:00Z',
    automationName: 'Alerta de ROAS Baixo',
    cardName: 'Configurar Webhook Shopify',
    status: 'success',
    message: 'ROAS caiu para 1.2. Card movido para "Revisar" e etiqueta "Urgente" adicionada.'
  },
  {
    id: 'log2',
    date: '2026-10-13T11:00:00Z',
    automationName: 'Aprovar Venda',
    cardName: 'Ajustar Cores do Dashboard',
    status: 'success',
    message: 'Botão clicado. Card movido para "Aprovado".'
  },
  {
    id: 'log3',
    date: '2026-10-13T12:30:00Z',
    automationName: 'Limpeza Semanal',
    cardName: 'Sistema',
    status: 'error',
    message: 'Erro ao arquivar 12 cards: limite de API excedido.'
  },
];
