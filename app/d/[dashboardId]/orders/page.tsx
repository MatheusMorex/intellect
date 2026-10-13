import React, { Suspense } from 'react';
import { TrackingRepo } from '@/lib/db/tracking.repo';
import { Skeleton } from '@/components/ui/skeleton/Skeleton';

async function getOrders(dashboardId: string) {
  await new Promise(resolve => setTimeout(resolve, 600)); // Simulate network
  try {
    return await TrackingRepo.getSalesList(dashboardId);
  } catch (e) {
    console.error("Erro ao buscar vendas:", e);
    return [];
  }
}

function OrdersSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div}
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <div className="bg-secondary/30 border-b border-border p-3">
          <div className="flex justify-between">
            {[1, 2, 3, 4, 5, 6, 7].map(i => <Skeleton key={i} className="h-3 w-20" />)}
          </div>
        </div}
        <div className="divide-y divide-border">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="p-4 flex justify-between items-center">
              <div className="flex gap-4 flex-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function Page({ params }: { params: { dashboardId: string } }) {
  return (
    <Suspense fallback={<OrdersSkeleton />}>
      <OrdersContent params={params} />
    </Suspense>
  );
}

async function OrdersContent({ params }: { params: { dashboardId: string } }) {
  const orders = await getOrders(params.dashboardId);

  const handleExport = () => {
    window.location.href = `/api/export?dashboardId=${params.dashboardId}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendas</h1>
          <p className="text-muted-foreground">Lista detalhada de pedidos e atribuição de UTMs</p>
        </div}
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-background border border-border rounded-md text-sm font-medium hover:bg-secondary transition-colors"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-secondary/30 border-b border-border text-muted-foreground font-medium">
            <tr className="text-xs uppercase tracking-wider">
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">ID Shopify</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Campanha</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 text-right">Comissão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.length > 0 ? (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-secondary/10 transition-colors group">
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(order.placedAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 font-medium">{order.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 capitalize">{order.paymentMethod}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{order.campaign?.name || 'Não atribuído'}</span>
                      <span className="text-xs text-muted-foreground">{order.utmSource} / {order.utmMedium}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    R$ {(Number(order.totalCents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right text-green-600 font-semibold">
                    R$ {(Number(order.gatewayFeeCents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  Nenhum pedido encontrado para este dashboard.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-green-500/10 text-green-600 border-green-500/20',
    waiting_payment: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    refused: 'bg-red-500/10 text-red-600 border-red-500/20',
    refunded: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  };

  const labels: Record<string, string> = {
    paid: 'Pago',
    waiting_payment: 'Pendente',
    refused: 'Recusado',
    refunded: 'Reembolsado',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[status] || styles.refunded}`}>
      {labels[status] || status}
    </span>
  );
}
