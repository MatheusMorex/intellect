import React from 'react';
import { MOCK_AUTOMATION_LOGS } from '@/lib/mocks/automation-logs';
import Link from 'next/link';

export default function Page() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/b/b1/fluxo-operacoes/automation" className="p-2 hover:bg-secondary rounded-full transition-colors">
            ←
          </Link>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Log de Execuções</h1>
            <p className="text-muted-foreground">Histórico de todas as ações disparadas pelas automações</p>
          </div>
        </div>
        <button className="px-4 py-2 bg-secondary rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors">
          Limpar Histórico
        </button>
      </div>

      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-secondary/30 border-b border-border text-muted-foreground font-medium">
            <tr className="text-xs uppercase tracking-wider">
              <th className="px-4 py-3">Data/Hora</th>
              <th className="px-4 py-3">Automação</th>
              <th className="px-4 py-3">Card Alvo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Resultado / Mensagem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {MOCK_AUTOMATION_LOGS.map((log) => (
              <tr key={log.id} className="hover:bg-secondary/10 transition-colors group">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {new Date(log.date).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3 font-medium">
                  <span className="bg-secondary px-2 py-0.5 rounded text-xs">{log.automationName}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground italic">
                  {log.cardName}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    log.status === 'success'
                    ? 'bg-green-500/10 text-green-600 border-green-500/20'
                    : 'bg-red-500/10 text-red-600 border-red-500/20'
                  }`}>
                    {log.status === 'success' ? 'Sucesso' : 'Erro'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs leading-relaxed">
                  {log.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-secondary/10 border border-border rounded-xl flex items-center gap-3 text-sm text-muted-foreground">
        <span className="text-lg">ℹ️</span>
        <p>As automações são processadas em background. Se uma regra falhar repetidamente, ela será desativada automaticamente para evitar loops.</p>
      </div>
    </div>
  );
}
