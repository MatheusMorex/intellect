import React, { useState } from 'react';
import Link from 'next/link';

export default function Page() {
  const [trigger, setTrigger] = useState('card_moved');
  const [actions, setActions] = useState([
    { id: 1, type: 'move_list', value: 'Revisar' },
    { id: 2, type: 'add_label', value: 'Urgente' },
  ]);

  const addAction = () => {
    setActions([...actions, { id: Date.now(), type: 'move_list', value: 'Selecionar...' }]);
  };

  const removeAction = (id: number) => {
    setActions(actions.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/b/b1/fluxo-operacoes/automation" className="p-2 hover:bg-secondary rounded-full transition-colors">
            ←
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Construtor de Regra</h1>
            <p className="text-muted-foreground">Defina o gatilho e as ações automáticas</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-secondary rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors">
            Cancelar
          </button>
          <button className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold hover:opacity-90 transition-opacity">
            Salvar Automação
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Bloco de Gatilho */}
        <div className="bg-background border border-border rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">1</span>
            <h2 className="font-bold text-lg">Quando isto acontecer...</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Gatilho</label>
              <select
                value={trigger}
                onChange={e => setTrigger(e.target.value)}
                className="w-full p-2 bg-secondary/30 border border-border rounded-md text-sm outline-none focus:ring-2 ring-primary"
              >
                <option value="card_moved">Card movido para lista</option>
                <option value="metric_change">Métrica do Dashboard mudar</option>
                <option value="date_reached">Data de entrega atingida</option>
                <option value="button_click">Clique em botão de card</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Valor/Filtro</label>
              <input
                type="text"
                placeholder="Ex: Lista 'Revisar' ou 'ROAS &lt; 1.5'"
                className="w-full p-2 bg-secondary/30 border border-border rounded-md text-sm outline-none focus:ring-2 ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Bloco de Ações */}
        <div className="bg-background border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <h2 className="font-bold text-lg">Então faça isto...</h2>
            </div>
            <button
              onClick={addAction}
              className="text-xs text-primary hover:underline font-bold"
            >
              + Adicionar Ação
            </button>
          </div>

          <div className="space-y-3">
            {actions.map((action, index) => (
              <div key={action.id} className="flex items-center gap-3 p-3 bg-secondary/10 border border-border rounded-xl group transition-all hover:border-primary/30">
                <span className="text-xs text-muted-foreground font-mono">{index + 1}.</span>
                <select
                  value={action.type}
                  className="flex-1 p-1.5 bg-background border border-border rounded text-xs outline-none"
                  onChange={e => {
                    const newActions = [...actions];
                    newActions[index].type = e.target.value;
                    setActions(newActions);
                  }}
                >
                  <option value="move_list">Mover para lista</option>
                  <option value="add_label">Adicionar etiqueta</option>
                  <option value="notify">Notificar membro</option>
                  <option value="set_date">Alterar data de entrega</option>
                </select>
                <input
                  type="text"
                  value={action.value}
                  className="flex-1 p-1.5 bg-background border border-border rounded text-xs outline-none"
                  onChange={e => {
                    const newActions = [...actions];
                    newActions[index].value = e.target.value;
                    setActions(newActions);
                  }}
                />
                <button
                  onClick={() => removeAction(action.id)}
                  className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Prévia da Regra */}
        <div className="p-6 bg-primary/5 border border-primary/20 rounded-2xl space-y-3">
          <h3 className="text-xs font-bold text-primary uppercase tracking-widest">Prévia da Regra</h3>
          <p className="text-sm italic text-foreground">
            "Quando <span className="font-bold">um card for movido</span> e <span className="font-bold">o valor for 'Revisar'</span>,
            então <span className="font-bold text-primary">mover para a lista Revisar</span> e <span className="font-bold text-primary">adicionar a etiqueta Urgente</span>."
          </p>
        </div>
      </div>
    </div>
  );
}
