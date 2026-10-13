import React from 'react';
import { MOCK_COST_SETTINGS, MOCK_PRODUCT_COSTS } from '@/lib/mocks/costs';

export default function Page() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Taxas e Custos</h1>
          <p className="text-muted-foreground">Configure os impostos e custos de produto para calcular o lucro líquido</p>
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
          Salvar Alterações
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Seção de Impostos Globais */}
        <div className="space-y-6">
          <div className="p-6 bg-background border border-border rounded-xl shadow-sm space-y-6">
            <h2 className="text-lg font-bold">Impostos e Taxas Globais</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-secondary/20 border border-border rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Imposto sobre Vendas</p>
                  <p className="text-xs text-muted-foreground">Aplicado sobre o faturamento líquido</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="w-20 p-1 bg-background border border-border rounded text-right text-sm"
                    defaultValue={MOCK_COST_SETTINGS.salesTaxPct}
                  />
                  <span className="text-sm font-bold">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-secondary/20 border border-border rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Imposto sobre Meta Ads</p>
                  <p className="text-xs text-muted-foreground">Imposto incidente sobre o gasto de anúncios</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="w-20 p-1 bg-background border border-border rounded text-right text-sm"
                    defaultValue={MOCK_COST_SETTINGS.metaAdsTaxPct}
                  />
                  <span className="text-sm font-bold">%</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">Taxas Adicionais</h3>
                <button className="text-xs text-primary hover:underline">+ Adicionar Taxa</button>
              </div>
              <div className="space-y-2">
                {MOCK_COST_SETTINGS.extraTaxes.map(tax => (
                  <div key={tax.id} className="flex items-center justify-between p-2 bg-secondary/10 border border-border rounded-md text-sm">
                    <span className="font-medium">{tax.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">R$ {tax.value}</span>
                      <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded uppercase">{tax.kind}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Custos de Produto */}
        <div className="space-y-6">
          <div className="p-6 bg-background border border-border rounded-xl shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Custos de Produto</h2>
              <button className="text-xs text-primary hover:underline">+ Novo Produto</button>
            </div>
            <div className="overflow-hidden border border-border rounded-lg">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/30 text-muted-foreground font-medium border-b border-border">
                  <tr>
                    <th className="px-4 py-2">Produto</th>
                    <th className="px-4 py-2 text-right">Custo Unitário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {MOCK_PRODUCT_COSTS.map(product => (
                    <tr key={product.id} className="hover:bg-secondary/10">
                      <td className="px-4 py-2 font-medium">{product.name}</td>
                      <td className="px-4 py-2 text-right">
                        R$ {(product.costCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
