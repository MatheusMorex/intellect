"use server";

import { revalidatePath } from "next/cache";

import { requireDashboard } from "@/server/access";
import { liveTrackingAction } from "@/server/live/action";
import { requireUser } from "@/server/auth/session";
import { mutate, nowIso } from "@/server/store/db";

const MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * "Atualizar" (F13): pede um sync agora, no máximo 1 a cada 5 minutos por conta.
 * No modo simulado não há API para chamar: só marca o horário.
 */
async function refreshDashboardImpl(dashboardId: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const { dashboard } = requireDashboard({ user }, dashboardId);
  const updated = mutate((store) => {
    const ids = new Set(store.dashboardAdAccounts.filter((l) => l.dashboardId === dashboard.id).map((l) => l.adAccountId));
    let count = 0;
    for (const account of store.adAccounts) {
      if (!ids.has(account.id)) continue;
      const last = account.lastSyncedAt ? new Date(account.lastSyncedAt).getTime() : 0;
      if (Date.now() - last < MIN_INTERVAL_MS) continue;
      account.lastSyncedAt = nowIso();
      count++;
    }
    return count;
  });
  revalidatePath(`/d/${dashboardId}`, "layout");
  return updated
    ? { ok: true, message: "Dados atualizados." }
    : { ok: true, message: "Os dados já estão em dia (atualizados há menos de 5 minutos)." };
}

// ---- modo real (AUTH_MODE=live): cada action roda sobre o retrato do Supabase, com vendas e anúncios (server/live/action.ts) ----

export async function refreshDashboard(...args: Parameters<typeof refreshDashboardImpl>): ReturnType<typeof refreshDashboardImpl> {
  return liveTrackingAction(() => refreshDashboardImpl(...args));
}
