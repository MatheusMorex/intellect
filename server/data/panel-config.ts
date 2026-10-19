// Painéis salvos de um dashboard (Fase 5): quais a pessoa vê, qual está aberto,
// os gráficos dele (validados a cada leitura) e o que quem está olhando pode
// fazer. Regras (tarefa, seção 9):
// - admin do workspace vê e edita todos os painéis;
// - membro vê os painéis do workspace inteiro e os que o liberaram;
// - filtros do membro valem só para ele (ficam no endereço da página), e só se
//   o painel deixar; senão, valem os filtros padrão do painel.
// Assinatura pensada para a versão com banco: (ctx, ids, endereço) → dados prontos.

import { COMPARE_PARAM, GRANULARITY_PARAM } from "@/lib/charts/options";
import { normalizeLayout, type PanelLayoutItem } from "@/lib/charts/templates";
import { PANEL_WIDGET, type PanelWidget } from "@/lib/charts/widgets";
import { boardRole, requireDashboard, type Ctx, type WorkspaceRole } from "@/server/access";
import { boardLists, visibleBoards } from "@/server/charts/kanban";
import type { SearchParams } from "@/server/data/tracking";
import { mutate, nowIso, readStore } from "@/server/store/db";
import { defaultPanel } from "@/server/store/seed";
import type { PanelRow, Store } from "@/server/store/types";

/** Parâmetros do endereço que são filtros da tela (o resto, como ?painel= e ?editar=, não entra nas contas). */
export const FILTER_PARAMS = ["periodo", "de", "ate", "agrupar", "comparar", "cde", "cate", "conta", "fonte", "produto"] as const;
/** Os filtros que um gráfico pode ignorar ("Ignorar os filtros do painel"). */
const DATA_FILTERS = ["conta", "fonte", "produto"] as const;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(",") : v);

/** Só os filtros, sem vazios, como texto. */
export function pickFilters(sp: SearchParams | Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of FILTER_PARAMS) {
    const value = one(sp[key])?.trim();
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Os filtros que valem na tela: os do endereço, se a pessoa pode filtrar e
 * mexeu em algum; senão, os padrões do painel. (Ao trocar de painel, o
 * endereço chega limpo e o painel abre como o administrador deixou.)
 */
export function effectiveParams(sp: SearchParams, defaults: Record<string, string>, canFilter: boolean): Record<string, string> {
  const fromUrl = canFilter ? pickFilters(sp) : {};
  return Object.keys(fromUrl).length ? fromUrl : pickFilters(defaults);
}

/** Os parâmetros de um gráfico: os do painel com o período, o agrupamento e a comparação próprios, e sem filtros se ele os ignora. */
export function widgetParams(params: Record<string, string>, widget: Pick<PanelWidget, "ignoreFilters" | "overrides">): Record<string, string> {
  const p = { ...params };
  if (widget.ignoreFilters) for (const key of DATA_FILTERS) delete p[key];
  const { periodo, agrupar, comparar } = widget.overrides;
  if (periodo) {
    p.periodo = periodo;
    delete p.de;
    delete p.ate;
  }
  if (agrupar) p.agrupar = GRANULARITY_PARAM[agrupar];
  if (comparar) {
    p.comparar = COMPARE_PARAM[comparar];
    delete p.cde;
    delete p.cate;
  }
  return p;
}

export function canSeePanel(panel: PanelRow, userId: string, role: WorkspaceRole | null): boolean {
  if (!role) return false;
  return role === "admin" || panel.visibility === "workspace" || panel.viewerIds.includes(userId);
}

/** Painéis do dashboard, na ordem das abas. */
export function dashboardPanels(store: Store, dashboardId: string): PanelRow[] {
  return store.panels
    .filter((p) => p.dashboardId === dashboardId)
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

/** Os gráficos guardados que ainda são válidos (um painel salvo antes de uma mudança de regra não derruba a tela). */
export function parseWidgets(raw: unknown[]): { widgets: PanelWidget[]; invalid: number } {
  const widgets: PanelWidget[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  for (const item of raw) {
    const parsed = PANEL_WIDGET.safeParse(item);
    if (parsed.success && !seen.has(parsed.data.id)) {
      widgets.push(parsed.data);
      seen.add(parsed.data.id);
    } else invalid++;
  }
  return { widgets, invalid };
}

/** Dashboard sem painel nenhum (criado depois do seed) ganha a "Visão geral". */
function ensurePanels(dashboardId: string, userId: string) {
  if (readStore().panels.some((p) => p.dashboardId === dashboardId)) return;
  mutate((store) => {
    if (!store.panels.some((p) => p.dashboardId === dashboardId)) store.panels.push(defaultPanel(dashboardId, userId, nowIso()));
  });
}

export type PanelTab = { id: string; name: string; isDefault: boolean; restricted: boolean };

export type OpenPanel = {
  id: string;
  name: string;
  isDefault: boolean;
  visibility: PanelRow["visibility"];
  viewerIds: string[];
  membersCanFilter: boolean;
  defaults: Record<string, string>;
  widgets: PanelWidget[];
  layout: PanelLayoutItem[];
  /** Gráficos guardados com configuração que não vale mais (ficam de fora, com aviso). */
  invalid: number;
};

export type PanelConfig = {
  role: WorkspaceRole;
  /** Admin do workspace: cria, edita e apaga painéis e define quem vê. */
  canEdit: boolean;
  /** Pode mudar período e filtros (só para a própria visualização). */
  canFilter: boolean;
  panels: PanelTab[];
  panel: OpenPanel | null;
  /** O painel pedido no endereço não existe ou a pessoa não pode ver (abriu o padrão no lugar). */
  requestedMissing: boolean;
  /** Os filtros que valem na tela (endereço ou padrões do painel). */
  params: Record<string, string>;
};

export function loadPanelConfig(ctx: Ctx, dashboardId: string, sp: SearchParams): PanelConfig {
  const { dashboard, role } = requireDashboard(ctx, dashboardId);
  ensurePanels(dashboard.id, ctx.user.id);
  const store = readStore();
  const visible = dashboardPanels(store, dashboard.id).filter((p) => canSeePanel(p, ctx.user.id, role));
  const requested = one(sp.painel);
  const current = visible.find((p) => p.id === requested) ?? visible.find((p) => p.isDefault) ?? visible[0] ?? null;
  const canEdit = role === "admin";
  const canFilter = canEdit || (current?.membersCanFilter ?? true);
  const parsed = current ? parseWidgets(current.widgets) : null;
  return {
    role,
    canEdit,
    canFilter,
    panels: visible.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault, restricted: p.visibility === "restricted" })),
    panel:
      current && parsed
        ? {
            id: current.id,
            name: current.name,
            isDefault: current.isDefault,
            visibility: current.visibility,
            viewerIds: current.viewerIds,
            membersCanFilter: current.membersCanFilter,
            defaults: pickFilters(current.defaults),
            widgets: parsed.widgets,
            layout: normalizeLayout(parsed.widgets, current.layout),
            invalid: parsed.invalid,
          }
        : null,
    requestedMissing: Boolean(requested) && current?.id !== requested,
    params: effectiveParams(sp, current?.defaults ?? {}, canFilter),
  };
}

export type PanelEditorData = {
  /** Pessoas do workspace, para escolher quem vê um painel restrito. */
  members: { id: string; name: string; role: WorkspaceRole }[];
  /** Quadros que a pessoa pode ver, com as listas (funil do kanban e Gantt). */
  boards: { id: string; name: string; lists: { id: string; name: string }[] }[];
};

/** O que o editor precisa (só para quem edita). */
export function loadPanelEditorData(ctx: Ctx, dashboardId: string): PanelEditorData {
  const { dashboard } = requireDashboard(ctx, dashboardId, "admin");
  const store = readStore();
  const users = new Map(store.users.map((u) => [u.id, u]));
  const members = store.workspaceMembers
    .filter((m) => m.workspaceId === dashboard.workspaceId && users.has(m.userId))
    .map((m) => ({ id: m.userId, name: users.get(m.userId)!.name, role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const boards = visibleBoards(store, dashboard.workspaceId, (b) => boardRole(ctx, b) != null).map((b) => ({
    id: b.id,
    name: b.name,
    lists: boardLists(store, b.id).map((l) => ({ id: l.id, name: l.name })),
  }));
  return { members, boards };
}
