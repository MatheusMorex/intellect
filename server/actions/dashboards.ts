"use server";

// Dashboards de vendas: atualizar os dados (F13), criar e excluir (S20).

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DASHBOARD_CURRENCIES } from "@/lib/currency";
import { requireDashboard, workspaceRole } from "@/server/access";
import { liveTrackingAction } from "@/server/live/action";
import { requireUser } from "@/server/auth/session";
import { mutate, newId, nowIso, readStore } from "@/server/store/db";
import { defaultPanel } from "@/server/store/seed";

import type { ActionResult } from "./cards";

const MIN_INTERVAL_MS = 5 * 60 * 1000;
const fail = (error: string) => ({ ok: false as const, error });

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

// ---- criar e excluir (S20) ------------------------------------------------------------------------

const createInput = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1, "Dê um nome ao dashboard.").max(100, "O nome pode ter até 100 caracteres."),
  currency: z.enum(DASHBOARD_CURRENCIES.map((c) => c.code) as [string, ...string[]], { error: "Escolha uma das moedas da lista." }),
  timezone: z.string().min(1),
  revenueBasis: z.enum(["net", "gross"]),
  includeInterest: z.boolean(),
  adPlatforms: z.array(z.enum(["meta", "google"])).max(2),
  weekStart: z.enum(["monday", "sunday"], { error: "Escolha o dia em que a semana começa." }),
});

/** Dashboard novo, vazio, com o painel "Visão geral". Contas e loja são ligadas depois, na configuração inicial (S29). */
async function createDashboardImpl(input: z.input<typeof createInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const v = parsed.data;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: v.timezone });
  } catch {
    return fail("Fuso horário inválido.");
  }
  const user = await requireUser();
  if (workspaceRole({ user }, v.workspaceId) !== "admin") return fail("Só admins do workspace criam dashboards.");
  const id = newId();
  mutate((store) => {
    store.dashboards.push({
      id,
      workspaceId: v.workspaceId,
      name: v.name,
      timezone: v.timezone,
      currency: v.currency,
      revenueBasis: v.revenueBasis,
      includeInterest: v.includeInterest,
      revenueGoalCents: null,
      adPlatforms: [...new Set(v.adPlatforms)],
      weekStart: v.weekStart,
    });
    store.panels.push(defaultPanel(id, user.id, nowIso()));
  });
  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}

const deleteInput = z.object({ dashboardId: z.uuid(), confirmName: z.string() });

/**
 * Exclui o dashboard e o que é só dele: contas e loja ligadas, impostos, taxas,
 * despesas, testes de integração, painéis, vínculos de cards e as regras de
 * automação por métrica dele. Pedidos, campanhas e gastos ficam: são do workspace
 * (da loja e das contas de anúncio), e outro dashboard pode usar.
 */
async function deleteDashboardImpl(input: z.input<typeof deleteInput>): Promise<ActionResult> {
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return fail("Dados inválidos.");
  const user = await requireUser();
  const dashboard = readStore().dashboards.find((d) => d.id === parsed.data.dashboardId);
  if (!dashboard) return fail("Este dashboard não existe mais. Recarregue a página.");
  if (workspaceRole({ user }, dashboard.workspaceId) !== "admin") return fail("Só admins do workspace excluem dashboards.");
  // Confirmação digitando o nome: excluir não tem volta.
  if (parsed.data.confirmName.trim() !== dashboard.name) return fail("Digite o nome do dashboard exatamente como aparece para confirmar.");
  const id = dashboard.id;
  mutate((store) => {
    store.dashboardAdAccounts = store.dashboardAdAccounts.filter((x) => x.dashboardId !== id);
    store.dashboardStores = store.dashboardStores.filter((x) => x.dashboardId !== id);
    store.costSettings = store.costSettings.filter((x) => x.dashboardId !== id);
    store.additionalFees = store.additionalFees.filter((x) => x.dashboardId !== id);
    store.expenses = store.expenses.filter((x) => x.dashboardId !== id);
    store.integrationTests = store.integrationTests.filter((x) => x.dashboardId !== id);
    store.panels = store.panels.filter((x) => x.dashboardId !== id);
    store.cardLinks = store.cardLinks.filter((x) => x.dashboardId !== id);
    store.automations = store.automations.filter((x) => x.dashboardId !== id);
    store.dashboards = store.dashboards.filter((x) => x.id !== id);
  });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

// ---- modo real (AUTH_MODE=live): cada action roda sobre o retrato do Supabase, com vendas e anúncios (server/live/action.ts) ----

export async function refreshDashboard(...args: Parameters<typeof refreshDashboardImpl>): ReturnType<typeof refreshDashboardImpl> {
  return liveTrackingAction(() => refreshDashboardImpl(...args));
}

export async function createDashboard(...args: Parameters<typeof createDashboardImpl>): ReturnType<typeof createDashboardImpl> {
  return liveTrackingAction(() => createDashboardImpl(...args));
}

export async function deleteDashboard(...args: Parameters<typeof deleteDashboardImpl>): ReturnType<typeof deleteDashboardImpl> {
  return liveTrackingAction(() => deleteDashboardImpl(...args));
}
