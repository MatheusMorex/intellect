"use server";

import crypto from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireDashboard } from "@/server/access";
import { liveTrackingAction } from "@/server/live/action";
import { requireUser } from "@/server/auth/session";
import { mutate, newId, nowIso } from "@/server/store/db";

import type { ActionResult } from "./cards";

// Integrações (F10, F11, F19). No modo simulado, "conectar" não sai do
// computador: marca a conexão como ativa. A conexão real (OAuth do Meta, do
// Google e app da Shopify) só entra com o "sim" do dono (architecture.md,
// "Antes de usar dados reais").

const providerInput = z.object({ dashboardId: z.uuid(), provider: z.enum(["meta", "google"]) });

function refresh(dashboardId: string) {
  revalidatePath(`/d/${dashboardId}`, "layout");
}

async function simulateConnectImpl(input: z.input<typeof providerInput>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = providerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { dashboardId, provider } = parsed.data;
  const { dashboard } = requireDashboard({ user }, dashboardId, "admin");
  if (process.env.INTEGRATIONS_MODE === "live") {
    return { ok: false, error: "A conexão real precisa do app configurado. Fale com quem cuida do sistema." };
  }
  mutate((store) => {
    let connection = store.adConnections.find((c) => c.workspaceId === dashboard.workspaceId && c.provider === provider);
    if (!connection) {
      connection = {
        id: newId(),
        workspaceId: dashboard.workspaceId,
        provider,
        externalUserId: `simulado-${provider}`,
        externalUserName: user.name,
        tokenExpiresAt: null,
        status: "active",
        lastError: null,
        createdBy: user.id,
        createdAt: nowIso(),
      };
      store.adConnections.push(connection);
    }
    connection.status = "active";
    connection.lastError = null;
    connection.externalUserName = user.name;
    connection.tokenExpiresAt = provider === "meta" ? new Date(Date.now() + 60 * 86_400_000).toISOString() : null;
    for (const account of store.adAccounts) {
      if (account.workspaceId === dashboard.workspaceId && account.provider === provider) {
        account.connectionId = connection.id;
        account.lastSyncError = null;
        account.lastSyncedAt = nowIso();
      }
    }
    if (!dashboard.adPlatforms.includes(provider)) {
      const d = store.dashboards.find((x) => x.id === dashboard.id);
      d?.adPlatforms.push(provider);
    }
  });
  refresh(dashboardId);
  return { ok: true, data: undefined };
}

async function disconnectProviderImpl(input: z.input<typeof providerInput>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = providerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { dashboardId, provider } = parsed.data;
  const { dashboard } = requireDashboard({ user }, dashboardId, "admin");
  mutate((store) => {
    for (const c of store.adConnections) {
      if (c.workspaceId === dashboard.workspaceId && c.provider === provider) c.status = "revoked";
    }
    // O histórico (campanhas, gasto) fica; só o sync para.
    for (const a of store.adAccounts) {
      if (a.workspaceId === dashboard.workspaceId && a.provider === provider) a.lastSyncError = "Conta desconectada.";
    }
  });
  refresh(dashboardId);
  return { ok: true, data: undefined };
}

const accountInput = z.object({ dashboardId: z.uuid(), accountId: z.uuid(), enabled: z.boolean() });

/** Liga ou tira uma conta de anúncios deste dashboard (selectAdAccounts). */
async function setDashboardAccountImpl(input: z.input<typeof accountInput>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = accountInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { dashboardId, accountId, enabled } = parsed.data;
  const { dashboard } = requireDashboard({ user }, dashboardId, "admin");
  const ok = mutate((store) => {
    const account = store.adAccounts.find((a) => a.id === accountId && a.workspaceId === dashboard.workspaceId);
    if (!account) return false;
    const linked = store.dashboardAdAccounts.some((l) => l.dashboardId === dashboardId && l.adAccountId === accountId);
    if (enabled && !linked) store.dashboardAdAccounts.push({ id: newId(), dashboardId, adAccountId: accountId });
    if (!enabled) store.dashboardAdAccounts = store.dashboardAdAccounts.filter((l) => !(l.dashboardId === dashboardId && l.adAccountId === accountId));
    account.syncEnabled = enabled || store.dashboardAdAccounts.some((l) => l.adAccountId === accountId);
    return true;
  });
  if (!ok) return { ok: false, error: "Conta não encontrada." };
  refresh(dashboardId);
  return { ok: true, data: undefined };
}

const storeInput = z.object({ dashboardId: z.uuid(), storeId: z.uuid(), enabled: z.boolean() });

/** Liga ou tira uma loja do workspace deste dashboard (os pedidos dela passam a contar aqui). */
async function setDashboardStoreImpl(input: z.input<typeof storeInput>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = storeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { dashboardId, storeId, enabled } = parsed.data;
  const { dashboard } = requireDashboard({ user }, dashboardId, "admin");
  const ok = mutate((store) => {
    if (!store.stores.some((s) => s.id === storeId && s.workspaceId === dashboard.workspaceId)) return false;
    const linked = store.dashboardStores.some((l) => l.dashboardId === dashboardId && l.storeId === storeId);
    if (enabled && !linked) store.dashboardStores.push({ id: newId(), dashboardId, storeId });
    if (!enabled) store.dashboardStores = store.dashboardStores.filter((l) => !(l.dashboardId === dashboardId && l.storeId === storeId));
    return true;
  });
  if (!ok) return { ok: false, error: "Loja não encontrada." };
  refresh(dashboardId);
  return { ok: true, data: undefined };
}

/** Link de 24 h para outra pessoa conectar a conta dela (createConnectLink). */
async function createConnectLinkImpl(input: z.input<typeof providerInput>): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  const user = await requireUser();
  const parsed = providerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { dashboardId, provider } = parsed.data;
  requireDashboard({ user }, dashboardId, "admin");
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const payload = `${provider}.${dashboardId}.${expiresAt}`;
  const signature = crypto.createHmac("sha256", process.env.AUTH_SECRET ?? "").update(payload).digest("base64url").slice(0, 32);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    ok: true,
    data: { url: `${base}/api/oauth/${provider}/start?d=${dashboardId}&e=${encodeURIComponent(expiresAt)}&s=${signature}`, expiresAt },
  };
}

const testInput = z.object({
  dashboardId: z.uuid(),
  source: z.enum(["meta", "google", "organic"]),
  url: z.url("Cole o link completo da página, começando com https://."),
});

/** Teste de integração (F19): gera o link com itl_test e as UTMs da fonte. */
async function createIntegrationTestImpl(input: z.input<typeof testInput>): Promise<ActionResult<{ url: string; code: string }>> {
  const user = await requireUser();
  const parsed = testInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { dashboardId, source, url } = parsed.data;
  requireDashboard({ user }, dashboardId, "admin");
  const code = crypto.randomBytes(4).toString("hex");
  const link = new URL(url);
  const utm =
    source === "meta"
      ? { utm_source: "meta", utm_medium: "paid", utm_campaign: "teste-integracao" }
      : source === "google"
        ? { utm_source: "google", utm_medium: "cpc", utm_campaign: "teste-integracao" }
        : { utm_source: "teste", utm_medium: "organic", utm_campaign: "teste-integracao" };
  for (const [k, v] of Object.entries(utm)) link.searchParams.set(k, v);
  link.searchParams.set("itl_test", code);
  mutate((store) => {
    store.integrationTests.push({
      id: newId(),
      dashboardId,
      trafficSource: source,
      campaignUrl: url,
      testCode: code,
      status: "waiting",
      orderId: null,
      createdBy: user.id,
      createdAt: nowIso(),
    });
  });
  refresh(dashboardId);
  return { ok: true, data: { url: link.toString(), code } };
}

// ---- modo real (AUTH_MODE=live): cada action roda sobre o retrato do Supabase, com vendas e anúncios (server/live/action.ts) ----

export async function simulateConnect(...args: Parameters<typeof simulateConnectImpl>): ReturnType<typeof simulateConnectImpl> {
  return liveTrackingAction(() => simulateConnectImpl(...args));
}

export async function disconnectProvider(...args: Parameters<typeof disconnectProviderImpl>): ReturnType<typeof disconnectProviderImpl> {
  return liveTrackingAction(() => disconnectProviderImpl(...args));
}

export async function setDashboardAccount(...args: Parameters<typeof setDashboardAccountImpl>): ReturnType<typeof setDashboardAccountImpl> {
  return liveTrackingAction(() => setDashboardAccountImpl(...args));
}

export async function setDashboardStore(...args: Parameters<typeof setDashboardStoreImpl>): ReturnType<typeof setDashboardStoreImpl> {
  return liveTrackingAction(() => setDashboardStoreImpl(...args));
}

export async function createConnectLink(...args: Parameters<typeof createConnectLinkImpl>): ReturnType<typeof createConnectLinkImpl> {
  return liveTrackingAction(() => createConnectLinkImpl(...args));
}

export async function createIntegrationTest(...args: Parameters<typeof createIntegrationTestImpl>): ReturnType<typeof createIntegrationTestImpl> {
  return liveTrackingAction(() => createIntegrationTestImpl(...args));
}
