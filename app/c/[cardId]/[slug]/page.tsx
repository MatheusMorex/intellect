import React, { useState } from 'react';
import { MOCK_CARDS_EXTENDED } from '@/lib/mocks/cards';
import { MOCK_DASHBOARD } from '@/lib/mocks/data';
import { MetricBadge } from '@/components/ds/MetricBadge';
import { ChecklistItem, PopoverLabel } from '@/components/ds/CardPopovers';

export default function Page() {
  // Simulação de card selecionado via params
  const card = MOCK_CARDS_EXTENDED[0];

  const [checklist, setChecklist] = useState([
    { text: 'Criar endpoint /api/webhooks/shopify', completed: true },
    { text: 'Configurar App no Shopify Dev Portal', completed: false },
    { text: 'Testar payload de pedido pago', completed: false },
  ]);

  const toggleCheck = (index: number) => {
    const newChecklist = [...checklist];
    newChecklist[index].completed = !newChecklist[index].completed;
    setChecklist(newChecklist);
  };

  return (
    <div className="flex gap-6 h-full">
      {/* Coluna Principal: Detalhes do Card */}
      <div className="flex-1 space-y-6 overflow-y-auto pr-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="hover:text-foreground cursor-pointer transition-colors">Quadro: Fluxo de Operações</span>
          <span className="opacity-50">/</span>
          <span className="hover:text-foreground cursor-pointer transition-colors">A Fazer</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{card.name}</h1>
            <span className="px-2 py-0.5 rounded bg-secondary text-muted-foreground text-[10px] font-bold uppercase">#1</span>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-secondary rounded-md text-sm font-medium hover:bg-accent transition-colors">
              Arquivar
            </button>
            <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
              Concluir
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Descrição</h3>
                <button className="text-xs text-primary hover:underline font-medium">Editar</button>
              </div>
              <div className="p-4 bg-background border border-border rounded-xl min-h-[150px] text-sm leading-relaxed shadow-sm">
                Implementar a conexão via webhook com a Shopify para capturar pedidos em tempo real.
                Validar a assinatura do HMAC para segurança.
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Checklist</h3>
                <button className="text-xs text-primary hover:underline font-medium">+ Adicionar Item</button>
              </div>
              <div className="space-y-1 bg-background border border-border rounded-xl p-2 shadow-sm">
                {checklist.map((item, i) => (
                  <ChecklistItem
                    key={i}
                    text={item.text}
                    completed={item.completed}
                    onToggle={() => toggleCheck(i)}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Campos Personalizados</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PopoverLabel label="Prioridade" value="Alta" onChange={() => {}} />
                <PopoverLabel label="Sprints" value="Sprint 12" onChange={() => {}} />
              </div>
            </section>
          </div>

          {/* Coluna Lateral: Métricas Vinculadas */}
          <div className="space-y-6">
            <section className="p-4 bg-secondary/20 border border-border rounded-xl space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider">Performance</h3>
                <button className="text-xs text-primary hover:underline font-medium">Vincular</button>
              </div>

              {card.metricsLink ? (
                <div className="space-y-4">
                  <div className="p-3 bg-background border border-border rounded-lg shadow-sm">
                    <p className="text-xs text-muted-foreground mb-2">Campanha Vinculada</p>
                    <p className="font-bold text-sm">Black Friday 2026</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <MetricBadge label="ROAS" value="4.81" trend="12%" trendUp={true} />
                    <MetricBadge label="Lucro" value="R$ 12k" trend="5%" trendUp={true} />
                  </div>
                  <div className="pt-2">
                    <button className="w-full py-2 text-xs bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90 transition-opacity shadow-sm">
                      Ver no Dashboard
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 border-2 border-dashed border-border rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">Nenhuma métrica vinculada</p>
                  <button className="text-xs bg-secondary px-3 py-1.5 rounded-md font-medium">
                    + Vincular Campanha
                  </button>
                </div>
              )}
            </section>

            <section className="p-4 bg-background border border-border rounded-xl space-y-3 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider">Atividade</h3>
              <div className="space-y-4">
                <div className="flex gap-3 text-xs">
                  <div className="w-6 h-6 rounded-full bg-primary/20 shrink-0 border border-primary/30" />
                  <div className="flex-1">
                    <p className="font-medium">Soare <span className="text-muted-foreground font-normal">há 2 horas</span></p>
                    <p className="text-muted-foreground">Moveu este card para "A Fazer"</p>
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  <div className="w-6 h-6 rounded-full bg-primary/20 shrink-0 border border-primary/30" />
                  <div className="flex-1">
                    <p className="font-medium">Soare <span className="text-muted-foreground font-normal">há 1 dia</span></p>
                    <p className="text-muted-foreground">Criou este card</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
