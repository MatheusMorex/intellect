import React, { Suspense } from 'react';
import { TrackingRepo } from '@/lib/db/tracking.repo';
import { Skeleton } from '@/components/ui/skeleton/Skeleton';

async function getDashboardData(dashboardId: string) {
  // Simulação de delay para demonstrar o skeleton
  await new Promise(resolve => setTimeout(resolve, 1000));
  try {
    const metrics = await TrackingRepo.getDashboardMetrics(dashboardId, 'today');
    return {
      name: 'Operação Principal',
      metrics,
    };
  } catch (e) {
    console.error("Erro ao buscar métricas:", e);
    return null;
  }
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div}
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="p-6 bg-background border border-border rounded-xl shadow-sm">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="lg:col-span-2 h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

export default async function Page({ params }: { params: { dashboardId: string } }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent params={params} />
    </Suspense>
  );
}

async function DashboardContent({ params }: { params: { dashboardId: string } }) {
  const data = await getDashboardData(params.dashboardId);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h1 className="text-2xl font-bold mb-2">Erro ao carregar dados</h1>
        <p className="text-muted-foreground">Não foi possível conectar ao banco de dados.</p>
      </div>
    );
  }

  const { metrics } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{data.name}</h1>
          <p className="text-muted-foreground">Visão geral do desempenho da operação</p>
        </div>
        <div className="flex gap-2">
          <div className="bg-secondary px-3 py-1 rounded-md text-xs font-medium flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Sincronizado com DB
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Faturamento Líquido"
          value={`R$ ${metrics.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          trend="+12%"
          trendUp={true}
        />
        <KPICard
          title="Gastos com Anúncios"
          value={`R$ ${metrics.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          trend="+5%"
          trendUp={false}
        />
        <KPICard
          title="ROAS"
          value={metrics.roas.toFixed(2)}
          trend="+0.4"
          trendUp={true}
        />
        <KPICard
          title="Lucro"
          value={`R$ ${metrics.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          trend="+18%"
          trendUp={true}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-80 bg-secondary/20 border border-border rounded-xl flex items-center justify-center text-muted-foreground">
          Gráfico de Vendas vs Gastos (Implementação na Etapa 3.2)
        </div>

        <div className="bg-secondary/10 border border-border rounded-xl p-4">
          <h3 className="font-semibold mb-4">Insights Rápidos</h3>
          <div className="space-y-3">
            <div className="p-3 bg-background border border-border rounded-lg text-sm">
              <p className="font-medium text-primary">Campanha "Black Friday" em alta</p>
              <p className="text-muted-foreground text-xs">ROAS 5.2 acima da média do dashboard.</p>
            </div>
            <div className="p-3 bg-background border border-border rounded-lg text-sm">
              <p className="font-medium text-orange-500">Atenção ao CPA do Google</p>
              <p className="text-muted-foreground text-xs">CPA subiu 15% nas últimas 24h.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, trend, trendUp }: { title: string, value: string, trend: string, trendUp: boolean }) {
  return (
    <div className="p-6 bg-background border border-border rounded-xl shadow-sm">
      <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-bold">{value}</h2>
        <span className={`text-xs font-bold ${trendUp ? 'text-green-500' : 'text-red-500'}`}>
          {trendUp ? '↑' : '↓'} {trend}
        </span>
      </div>
    </div>
  );
}
