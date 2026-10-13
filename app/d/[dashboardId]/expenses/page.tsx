import React from 'react';
import { MOCK_EXPENSES } from '@/lib/mocks/expenses';

export default function Page() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Despesas Adicionais</h1>
          <p className="text-muted-foreground">Lançamentos de custos que não sejam gastos com anúncios</p>
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
          + Nova Despesa
        </button>
      </div>

      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-secondary/30 border-b border-border text-muted-foreground font-medium">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {MOCK_EXPENSES.map((exp) => (
              <tr key={exp.id} className="hover:bg-secondary/10 transition-colors">
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(exp.date).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[10px] font-bold uppercase">
                    {exp.category}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{exp.description}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${exp.kind === 'recurring' ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                    {exp.kind === 'recurring' ? 'Recorrente' : 'Única'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-bold">
                  R$ {exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
