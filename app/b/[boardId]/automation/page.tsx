import React from 'react';
import { MOCK_AUTOMATIONS } from '@/lib/mocks/automations';
import Link from 'next/link';

export default function Page() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Automações</h1>
          <p className="text-muted-foreground">Configure regras para que o trabalho ande sozinho</p>
        </div>
        <Link
          href="/b/b1/fluxo-operacoes/automation/builder"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold hover:opacity-90 transition-opacity"
        >
          + Nova Automação
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {MOCK_AUTOMATIONS.map(auto => (
          <div key={auto.id} className="bg-background border border-border rounded-xl p-5 shadow-sm hover:border-primary/50 transition-all flex flex-col group">
            <div className="flex items-start justify-between mb-4">
              <div className="p-2 bg-secondary rounded-lg text-xl">
                {auto.type === 'rule' ? '⚡' : auto.type === 'scheduled' ? '⏰' : '🔘'}
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={auto.enabled} className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="space-y-2 mb-6">
              <h3 className="font-bold text-lg group-hover:text-primary transition-colors">{auto.name}</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase text-[10px]">Gatilho:</span>
                  <span className="bg-secondary px-1.5 py-0.5 rounded font-mono">{auto.trigger}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase text-[10px]">Condição:</span>
                  <span className="bg-secondary px-1.5 py-0.5 rounded font-mono">{auto.condition}</span>
                </div>
              </div>
            </div>

            <div className="mt-auto pt-4 border-t border-border flex items-center justify-between">
              <div className="text-[10px] text-muted-foreground">
                Executado em: {new Date(auto.lastRun).toLocaleDateString()}
              </div>
              <div className="flex gap-2">
                <button className="p-1.5 hover:bg-secondary rounded text-xs transition-colors">⚙️</button>
                <button className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded text-xs transition-colors">🗑️</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-secondary/30 border border-border rounded-2xl p-6 flex items-center gap-6">
        <div className="text-3xl">💡</div>
        <div className="space-y-1">
          <h4 className="font-bold">Dica de Automação</h4>
          <p className="text-sm text-muted-foreground">
            Você pode criar regras que monitoram o ROAS no Dashboard. Se o lucro cair abaixo de X,
            o app move automaticamente o card para a lista "Revisar".
          </p>
        </div>
      </div>
    </div>
  );
}
