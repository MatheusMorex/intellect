// Leitura dos Painéis (S28): confere o acesso, prepara as moedas, lê o
// endereço da página e devolve o "computador" que monta cada widget.
// Assinatura pensada para a versão com banco: (ctx, ids, filtros) → dados prontos.

import { boardRole, requireDashboard, type Ctx } from "@/server/access";
import { panelComputer, type PanelComputer } from "@/server/charts/build";
import { versionedCache } from "@/server/charts/cache";
import { visibleBoards } from "@/server/charts/kanban";
import { parsePanelQuery, type PanelQuery } from "@/server/charts/params";
import { panelSource } from "@/server/charts/source";
import { floorToLocalHour } from "@/server/charts/time-buckets";
import { earliestDay, lastSyncedAt, type SearchParams } from "@/server/data/tracking";
import { prepareDashboardFx } from "@/server/fx/rates";
import { isLive } from "@/server/mode";
import { withLiveRead } from "@/server/live/scope";
import { readStore, storeVersion } from "@/server/store/db";
import type { BoardRow, DashboardRow } from "@/server/store/types";
import type { WeekStart } from "@/lib/charts/options";

export type PanelPage = {
  dashboard: { id: string; name: string; currency: string; timezone: string; weekStart: WeekStart };
  query: PanelQuery;
  computer: PanelComputer;
  lastSyncedAt: string | null;
  /** Algum valor em outra moeda ficou sem cotação: a tela não mostra números pela metade. */
  fxUnavailable: boolean;
};

/** Telas prontas guardadas entre acessos (server/charts/cache.ts). */
const pageCache = versionedCache<PanelPage>({ max: 60, ttlMs: 5 * 60_000 });

async function loadPanelsImpl(ctx: Ctx, dashboardId: string, sp: SearchParams = {}, now = new Date()): Promise<PanelPage> {
  // O acesso é conferido em todo pedido; só as contas vêm do cache.
  const { dashboard } = requireDashboard(ctx, dashboardId);
  const version = storeVersion();
  // Funil do kanban e Gantt: só os quadros que esta pessoa pode ver (por isso entram na chave).
  const boards = visibleBoards(readStore(), dashboard.workspaceId, (board) => boardRole(ctx, board) != null);
  // Modo real: sem cache (cada leitura já vem do banco). Guardar telas prontas exigiria uma versão por
  // dashboard no banco, que suba quando chegam pedidos ou gastos: fica para quando o volume pedir.
  if (isLive()) return buildPanelPage(dashboard, boards, sp, now);
  const key = [dashboard.id, boards.map((b) => b.id).join(","), panelQueryKey(sp), floorToLocalHour(now.getTime(), dashboard.timezone)].join("|");
  return pageCache.get(key, version, () => buildPanelPage(dashboard, boards, sp, now), now.getTime());
}

async function buildPanelPage(dashboard: DashboardRow, boards: BoardRow[], sp: SearchParams, now: Date): Promise<PanelPage> {
  const fx = await prepareDashboardFx(dashboard);
  const store = fx.store;
  const query = parsePanelQuery(sp, dashboard.timezone, earliestDay(store, dashboard), now);
  const computer = panelComputer(panelSource(store, dashboard, query.filters, fx.converter, boards), query, now);
  // Os totais convertem os custos em outra moeda dia a dia: só depois deles dá para saber se faltou cotação.
  computer.totals();
  computer.compareTotals();
  return {
    dashboard: { id: dashboard.id, name: dashboard.name, currency: dashboard.currency, timezone: dashboard.timezone, weekStart: dashboard.weekStart },
    query,
    computer,
    lastSyncedAt: lastSyncedAt(store, dashboard),
    fxUnavailable: fx.converter.misses() > 0,
  };
}

/** Os parâmetros da página numa chave estável (a mesma tela pede os mesmos dados uma vez só). */
export function panelQueryKey(sp: SearchParams): string {
  const query = new URLSearchParams();
  for (const key of Object.keys(sp).sort()) {
    const value = sp[key];
    if (value == null) continue;
    query.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  return query.toString();
}

// ---- modo real (AUTH_MODE=live): as leituras rodam sobre o retrato do Supabase, com vendas e anúncios (server/live/scope.ts) ----

export async function loadPanels(...args: Parameters<typeof loadPanelsImpl>): ReturnType<typeof loadPanelsImpl> {
  return withLiveRead(args[0].user.id, () => loadPanelsImpl(...args), { tracking: true });
}
