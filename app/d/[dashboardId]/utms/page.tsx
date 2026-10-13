import React from 'react';
import { MOCK_UTM_REPORTS } from '@/lib/mocks/reports';

export default function Page() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Relatório por UTM</h1>
          <p className="text-muted-foreground">Análise de performance por parâmetro de rastreio</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-background border border-border rounded-md text-sm font-medium hover:bg-secondary transition-colors">
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-secondary/30 border-b border-border text-muted-foreground font-medium">
            <tr>
              <th className="px-4 py-3">Parâmetro</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3 text-center">Vendas</th>
              <th className="px-4 py-3 text-right">Faturamento</th>
              <th className="px-4 py-3 text-right">Gastos</th>
              <th className="px-4 py-3 text-right">ROAS</th>
              <th className="px-4 py-3 text-right">Lucro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {MOCK_UTM_REPORTS.map((row, i) => (
              <tr key={i} className="hover:bg-secondary/10 transition-colors group">
                <td className="px-4 py-3">
                  <span className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground border border-border">
                    {row.parameter}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{row.value}</td>
                <td className="px-4 py-3 text-center">{row.sales}</td>
                <td className="px-4 py-3 text-right font-medium">
                  R$ {row.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  R$ {row.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-bold text-primary">
                  {row.roas.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right text-green-600 font-semibold">
                  R$ {row.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
