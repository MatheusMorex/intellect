export const MOCK_AUTOMATIONS = [
  {
    id: 'auto1',
    type: 'rule',
    name: 'Alerta de ROAS Baixo',
    trigger: 'metric_change',
    condition: 'ROAS < 1.5',
    actions: ['move_to_list:Revisar', 'add_label:Urgente', 'notify:gestor'],
    enabled: true,
    lastRun: '2026-10-13T09:00:00Z'
  },
  {
    id: 'auto2',
    type: 'scheduled',
    name: 'Limpeza Semanal',
    trigger: 'every_monday_0900',
    condition: 'card_status:completed',
    actions: ['archive_card'],
    enabled: false,
    lastRun: '2026-10-06T09:00:00Z'
  },
  {
    id: 'auto3',
    type: 'card_button',
    name: 'Aprovar Venda',
    trigger: 'button_click',
    condition: 'none',
    actions: ['move_to_list:Aprovado', 'add_checklist:Onboarding'],
    enabled: true,
    lastRun: '2026-10-13T11:20:00Z'
  },
];
