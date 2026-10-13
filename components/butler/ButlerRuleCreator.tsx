import React, { useState } from 'react';

interface RuleOption {
  label: string;
  value: string;
}

const METRIC_OPTIONS: RuleOption[] = [
  { label: 'ROAS', value: 'roas' },
  { label: 'CPA', value: 'cpa' },
  { label: 'Faturamento', value: 'revenue' },
  { label: 'Gastos', value: 'spend' },
];

const OPERATOR_OPTIONS: RuleOption[] = [
  { label: 'Menor que (<)', value: 'lt' },
  { label: 'Maior que (>)', value: 'gt' },
  { label: 'Igual a (=)', value: 'eq' },
];

export function ButlerRuleCreator() {
  const [metric, setMetric] = useState('roas');
  const [operator, setOperator] = useState('lt');
  const [value, setValue] = useState('1.5');
  const [action, setAction] = useState('create_card');

  const handleSave = async () => {
    // Simulação de salvamento da regra no banco
    console.log('Saving rule:', { metric, operator, value, action });
    alert('Regra do Butler salva com sucesso!');
  };

  return (
    <div className="p-6 bg-background border border-border rounded-xl shadow-sm max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/10 text-primary rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M7 12h.01"/><path d="M12 12h.01"/><path d="M17 12h.01"/></svg>
        </div>
        <h2 className="text-xl font-bold">Criar Automação (Butler)</h2>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase">Quando a métrica</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="w-full p-2 bg-secondary border border-border rounded-md text-sm focus:ring-2 ring-primary outline-none"
            >
              {METRIC_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase">For for</label>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className="w-full p-2 bg-secondary border border-border rounded-md text-sm focus:ring-2 ring-primary outline-none"
            >
              {OPERATOR_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase">Valor limite</label>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full p-2 bg-secondary border border-border rounded-md text-sm focus:ring-2 ring-primary outline-none"
              step="0.1"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <label className="text-xs font-medium text-muted-foreground uppercase block mb-3">Então execute a ação</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={() => setAction('create_card')}
              className={`p-3 text-left rounded-lg border transition-all ${action === 'create_card' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-secondary/50'}`}
            >
              <div className="font-medium text-sm">Criar Card de Alerta</div>
              <div className="text-xs text-muted-foreground">Gera um novo card no Kanban para análise imediata.</div>
            </button>
            <button
              onClick={() => setAction('move_card')}
              className={`p-3 text-left rounded-lg border transition-all ${action === 'move_card' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-secondary/50'}`}
            >
              <div className="font-medium text-sm">Mover Card de Campanha</div>
              <div className="text-xs text-muted-foreground">Move cards relacionados para a lista de "Atenção".</div>
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Ativar Automação
          </button>
        </div>
      </div>
    </div>
  );
}
