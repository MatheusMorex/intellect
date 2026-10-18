// Leitura dos Painéis (S28): confere o acesso, prepara as moedas, lê o
// endereço da página e devolve o "computador" que monta cada widget.
// Assinatura pensada para a versão com banco: (ctx, ids, filtros) → dados prontos.

import { boardRole, requireDashboard, type Ctx } from "@/server/access";
import { panelComputer, type PanelComputer } from "@/server/charts/build";
import { visibleBoards } from "@/server/charts/kanban";
import { parsePanelQuery, type PanelQuery } from "@/server/charts/params";
import { panelSource } from "@/server/charts/source";
import { earliestDay, lastSyncedAt, type SearchParams } from "@/server/data/tracking";
import { prepareDashboardFx } from "@/server/fx/rates";
import type { WeekStart } from "@/lib/charts/options";

export type PanelPage = {
  dashboard: { id: string; name: string; currency: string; timezone: string; weekStart: WeekStart };
  query: PanelQuery;
  computer: PanelComputer;
  lastSyncedAt: string | null;
  /** Algum valor em outra moeda ficou sem cotação: a tela não mostra números pela metade. */
  fxUnavailable: boolean;
};

export async function loadPanels(ctx: Ctx, dashboardId: string, sp: SearchParams = {}, now = new Date()): Promise<PanelPage> {
  const { dashboard } = requireDashboard(ctx, dashboardId);
  const fx = await prepareDashboardFx(dashboard);
  const store = fx.store;
  const query = parsePanelQuery(sp, dashboard.timezone, earliestDay(store, dashboard), now);
  // Funil do kanban e Gantt: só os quadros que esta pessoa pode ver.
  const boards = visibleBoards(store, dashboard.workspaceId, (board) => boardRole(ctx, board) != null);
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
