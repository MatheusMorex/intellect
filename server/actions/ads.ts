"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseMoneyToCents } from "@/lib/parse";
import { requireDashboard } from "@/server/access";
import { liveTrackingAction } from "@/server/live/action";
import { requireUser } from "@/server/auth/session";
import { mutate, nowIso } from "@/server/store/db";
import type { Store } from "@/server/store/types";

import type { ActionResult } from "./cards";

// Ligar, pausar e mudar orçamento (F14). A tela pede confirmação antes; aqui,
// no modo simulado, só o armazenamento local muda. No modo real, a chamada vai
// para a API do Meta ou do Google primeiro e só depois atualiza a cópia local.

const level = z.enum(["campanhas", "conjuntos", "anuncios"]);

function findObject(store: Store, dashboardId: string, lvl: z.infer<typeof level>, id: string) {
  const accountIds = new Set(store.dashboardAdAccounts.filter((l) => l.dashboardId === dashboardId).map((l) => l.adAccountId));
  if (lvl === "campanhas") return store.campaigns.find((c) => c.id === id && accountIds.has(c.adAccountId));
  if (lvl === "conjuntos") return store.adSets.find((s) => s.id === id && accountIds.has(s.adAccountId));
  return store.ads.find((a) => a.id === id && accountIds.has(a.adAccountId));
}

const statusInput = z.object({ dashboardId: z.uuid(), level, id: z.uuid(), active: z.boolean() });

async function setAdObjectStatusImpl(input: z.input<typeof statusInput>): Promise<ActionResult<{ status: string }>> {
  const user = await requireUser();
  const parsed = statusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { dashboardId, level: lvl, id, active } = parsed.data;
  requireDashboard({ user }, dashboardId, "admin");
  if (process.env.INTEGRATIONS_MODE === "live") {
    return { ok: false, error: "Mudar status na conta real ainda não está ligado." };
  }
  const status = mutate((store) => {
    const object = findObject(store, dashboardId, lvl, id);
    if (!object) return null;
    if (object.status !== "active" && object.status !== "paused") return "blocked";
    object.status = active ? "active" : "paused";
    return object.status;
  });
  if (!status) return { ok: false, error: "Não encontrei esse item. Recarregue a página." };
  if (status === "blocked") return { ok: false, error: "Só dá para ligar ou pausar itens ativos ou pausados." };
  revalidatePath(`/d/${dashboardId}`, "layout");
  return { ok: true, data: { status } };
}

const budgetInput = z.object({ dashboardId: z.uuid(), level: z.enum(["campanhas", "conjuntos"]), id: z.uuid(), value: z.string() });

async function setAdObjectBudgetImpl(input: z.input<typeof budgetInput>): Promise<ActionResult<{ cents: number }>> {
  const user = await requireUser();
  const parsed = budgetInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { dashboardId, level: lvl, id, value } = parsed.data;
  const cents = parseMoneyToCents(value);
  // O mínimo vale na moeda da conta de anúncio, que é a do campo de orçamento.
  if (cents == null || cents < 100) return { ok: false, error: "Use um orçamento diário de pelo menos 1,00, como 80,00." };
  requireDashboard({ user }, dashboardId, "admin");
  if (process.env.INTEGRATIONS_MODE === "live") {
    return { ok: false, error: "Mudar orçamento na conta real ainda não está ligado." };
  }
  const ok = mutate((store) => {
    const object = findObject(store, dashboardId, lvl, id);
    if (!object || !("dailyBudgetCents" in object)) return false;
    object.dailyBudgetCents = cents;
    const account = store.adAccounts.find((a) => a.id === object.adAccountId);
    if (account) account.lastSyncedAt = nowIso();
    return true;
  });
  if (!ok) return { ok: false, error: "Esse item não tem orçamento próprio." };
  revalidatePath(`/d/${dashboardId}`, "layout");
  return { ok: true, data: { cents } };
}

// ---- modo real (AUTH_MODE=live): cada action roda sobre o retrato do Supabase, com vendas e anúncios (server/live/action.ts) ----

export async function setAdObjectStatus(...args: Parameters<typeof setAdObjectStatusImpl>): ReturnType<typeof setAdObjectStatusImpl> {
  return liveTrackingAction(() => setAdObjectStatusImpl(...args));
}

export async function setAdObjectBudget(...args: Parameters<typeof setAdObjectBudgetImpl>): ReturnType<typeof setAdObjectBudgetImpl> {
  return liveTrackingAction(() => setAdObjectBudgetImpl(...args));
}
