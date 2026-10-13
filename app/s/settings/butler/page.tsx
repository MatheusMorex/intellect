import React from 'react';
import { ButlerRuleCreator } from '@/components/butler/ButlerRuleCreator';

export default function ButlerSettingsPage() {
  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Configurações do Butler</h1>
        <p className="text-muted-foreground">
          Defina regras automáticas que transformam métricas de performance em ações no seu Kanban.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="p-4 bg-secondary/30 border border-border rounded-xl space-y-3">
            <h3 className="font-semibold text-sm uppercase text-muted-foreground">Como funciona?</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              O Butler monitora seus dados de Ads e Vendas em tempo real. Quando uma métrica
              cruza o limite definido, ele dispara automaticamente uma ação no seu quadro de trabalho.
            </p>
            <div className="pt-2 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                Monitoramento 24/7
              </div>
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                Ações instantâneas
              </div>
            </div>
          </div>

          <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
            <h3 className="font-semibold text-sm text-primary mb-2">Dica de Especialista</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Configure alertas de <span className="font-bold">ROAS &lt; 1.5</span> para criar cards de "Análise de Criativos"
              automaticamente. Assim você nunca deixa uma campanha performando mal por muito tempo.
            </p>
          </div>
        </div>

        <div className="lg:col-span-2">
          <ButlerRuleCreator />

          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">Regras Ativas</h3>
            <div className="space-y-3">
              {/* Exemplo de lista de regras existentes */}
              <div className="p-4 bg-background border border-border rounded-lg flex items-center justify-between group hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-red-500/10 text-red-600 rounded-md">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14Z"/></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Alerta de ROAS Baixo</p>
                    <p className="text-xs text-muted-foreground">Se ROAS &lt; 1.5 &rarr; Criar Card de Alerta</p>
                  </div>
                </div>
                <button className="text-xs font-medium text-muted-foreground group-hover:text-red-500 transition-colors">
                  Desativar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
