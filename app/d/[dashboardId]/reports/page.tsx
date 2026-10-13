import React from 'react';
import { MOCK_TIME_SERIES } from '@/lib/mocks/reports';

export default function Page() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Relatórios Temporais</h1>
          <p className="text-muted-foreground">Evolução diária de métricas e tendências</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-secondary/50 p-1 rounded-md border border-border">
            <button className="px-3 py-1 text-xs font-medium bg-background rounded-sm shadow-sm">Dia</button>
            <button className="px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">Semana</button>
            <button className="px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">Mês</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Time Series Chart Placeholder */}
        <div className="h-96 bg-background border border-border rounded-xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold">Curva de Faturamento vs Gastos</h3>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 bg-primary rounded-full" /> Faturamento
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 bg-red-500 rounded-full" /> Gastos
              </div>
            </div>
          </div>
          <div className="flex-1 bg-secondary/10 border border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground">
            Gráfico de Linhas (Implementação com Recharts na Etapa 3.2)
          </div>
        </div>

        {/* Data Table */}
        <div className="rounded-xl border border-border bg-background overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/30 border-b border-border text-muted-foreground font-medium">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3 text-right">Vendas</th>
                <th className="px-4 py-3 text-right">Faturamento</th>
                <th className="px-4 py-3 text-right">Gastos</th>
                <th className="px-4 py-3 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MOCK_TIME_SERIES.map((day, i) => (
                <tr key={i} className="hover:bg-secondary/10 transition-colors">
                  <td className="px-4 py-3">{new Date(day.date).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right">{day.sales}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    R$ {day.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    R$ {day.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-primary">
                    {(day.revenue / day.spend).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
