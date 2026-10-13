import React, { Suspense } from 'react';
import { TrackingRepo } from '@/lib/db/tracking.repo';
import { Skeleton } from '@/components/ui/skeleton/Skeleton';

async function getAnalyticsData(dashboardId: string) {
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network
  try {
    return {
      labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
      revenue: [1200, 1900, 1500, 2100, 2800, 3200, 2400],
      spend: [400, 600, 500, 700, 900, 1100, 800],
    };
  } catch (e) {
    console.error("Erro ao buscar analytics:", e);
    return null;
  }
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div}
        <Skeleton className="h-7 w-28 rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-6">
        <div className="p-6 bg-background border border-border rounded-xl shadow-sm h-96 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <Skeleton className="flex-1 w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 bg-secondary/20 border border-border rounded-xl space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function Page({ params }: { params: { dashboardId: string } }) {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsContent params={params} />
    </Suspense>
  );
}

async function AnalyticsContent({ params }: { params: { dashboardId: string } }) {
  const data = await getAnalyticsData(params.dashboardId);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h1 className="text-2xl font-bold mb-2">Erro ao carregar analytics</h1>
        <p className="text-muted-foreground">Não foi possível processar os dados de performance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Análise de Performance</h1>
          <p className="text-muted-foreground">Comparativo detalhado de investimentos vs retorno</p>
        </div>
        <div className="flex gap-2">
          <div className="bg-secondary px-3 py-1 rounded-md text-xs font-medium">
            Últimos 7 dias
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="p-6 bg-background border border-border rounded-xl shadow-sm h-96 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold">Vendas vs Investimento</h3>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 bg-primary rounded-full" />
                <span>Faturamento</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 bg-secondary rounded-full" />
                <span>Gastos Ads</span>
              </div>
            </div>
          </div>

          <div className="flex-1 flex items-end justify-between gap-2 px-4">
            {data.revenue.map((val, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative">
                <div className="w-full flex items-end gap-1 h-64">
                  <div
                    className="w-1/2 bg-primary rounded-t-sm transition-all group-hover:opacity-80"
                    style={{ height: `${(val / 3200) * 100}%` }}
                  />
                  <div
                    className="w-1/2 bg-secondary rounded-t-sm transition-all group-hover:opacity-80"
                    style={{ height: `${(data.spend[i] / 1100) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{data.labels[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-secondary/20 border border-border rounded-xl">
            <p className="text-xs text-muted-foreground uppercase font-medium">Eficiência Média</p>
            <h4 className="text-2xl font-bold">3.4x</h4>
            <p className="text-xs text-green-500">↑ 12% vs semana anterior</p>
          </div>
          <div className="p-4 bg-secondary/20 border border-border rounded-xl">
            <p className="text-xs text-muted-foreground uppercase font-medium">CPA Médio</p>
            <h4 className="text-2xl font-bold">R$ 42,10</h4>
            <p className="text-xs text-red-500">↓ 5% vs semana anterior</p>
          </div>
          <div className="p-4 bg-secondary/20 border border-border rounded-xl">
            <p className="text-xs text-muted-foreground uppercase font-medium">ROI Estimado</p>
            <h4 className="text-2xl font-bold">214%</h4>
            <p className="text-xs text-green-500">↑ 8% vs semana anterior</p>
          </div>
        </div>
      </div>
    </div>
  );
}
