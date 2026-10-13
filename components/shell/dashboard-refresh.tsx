"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { RefreshIndicator } from "@/components/ds/refresh-indicator";
import { refreshDashboard } from "@/server/actions/dashboards";

// stale vem do servidor: o sync roda a cada 15 min e, passados 2 ciclos, a tela avisa.
export function DashboardRefresh({
  dashboardId,
  lastSyncedAt,
  stale,
}: {
  dashboardId: string;
  lastSyncedAt: string | null;
  stale: boolean;
}) {
  const router = useRouter();
  const updatedAt = lastSyncedAt ? new Date(lastSyncedAt) : null;
  if (!updatedAt) return <span className="text-xs text-muted-foreground">Nenhuma conta sincronizada ainda</span>;
  return (
    <RefreshIndicator
      updatedAt={updatedAt}
      stale={stale}
      onRefresh={async () => {
        const result = await refreshDashboard(dashboardId);
        toast(result.message);
        router.refresh();
      }}
    />
  );
}
