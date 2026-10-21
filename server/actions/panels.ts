"use server";

// Painéis (Fase 5): criar, renomear, duplicar, excluir, ordenar e escolher o
// padrão; quem pode ver; filtros padrão; a grade e os gráficos de cada painel;
// e a pré-visualização do editor. Só o admin do workspace muda painéis: a
// checagem é aqui no servidor (a tela só esconde os botões). Tudo o que chega é
// validado (zod) antes de gravar.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { msg } from "@/lib/charts/messages";
import { MAX_PANELS, MAX_WIDGETS, normalizeLayout, PANEL_LAYOUT, PANEL_TEMPLATES, placeWidgets, templatePanel } from "@/lib/charts/templates";
import { PANEL_WIDGET, type PanelWidget } from "@/lib/charts/widgets";
import { workspaceRole, type Ctx } from "@/server/access";
import { liveTrackingAction } from "@/server/live/action";
import { requireUser } from "@/server/auth/session";
import { renderWidget, type RenderedWidget } from "@/server/charts/render";
import { dashboardPanels, parseWidgets, pickFilters, widgetParams } from "@/server/data/panel-config";
import { loadPanels } from "@/server/data/panels";
import { mutate, newId, nowIso, readStore } from "@/server/store/db";
import type { PanelRow, Store } from "@/server/store/types";

import type { ActionResult } from "./cards";

const t = msg.panels.errors;
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

const id = z.string().trim().min(1).max(64);
const name = z.string().trim().min(1, { error: t.nameEmpty }).max(60, { error: t.nameLong });

type Admin = { ctx: Ctx; dashboardId: string };

/** Quem pede é admin do workspace do dashboard? */
async function adminOf(dashboardId: string): Promise<Admin | null> {
  const user = await requireUser();
  const ctx = { user };
  const dashboard = readStore().dashboards.find((d) => d.id === dashboardId);
  if (!dashboard || workspaceRole(ctx, dashboard.workspaceId) !== "admin") return null;
  return { ctx, dashboardId };
}

/** O painel e o dashboard dele, se quem pede é admin. */
async function adminPanel(panelId: string): Promise<(Admin & { panel: PanelRow }) | null> {
  const panel = readStore().panels.find((p) => p.id === panelId);
  if (!panel) return null;
  const admin = await adminOf(panel.dashboardId);
  return admin ? { ...admin, panel } : null;
}

const refresh = (dashboardId: string) => revalidatePath(`/d/${dashboardId}/paineis`);

/** O painel dentro da transação (o objeto lido antes pode ter mudado). */
const inStore = (store: Store, panelId: string) => store.panels.find((p) => p.id === panelId)!;

/** Posições 0, 1, 2... na ordem atual (depois de criar, apagar ou mover). */
function renumber(store: Store, dashboardId: string) {
  dashboardPanels(store, dashboardId).forEach((p, i) => (p.position = i));
}

// ---- painéis -----------------------------------------------------------------------------------

const createInput = z.object({ dashboardId: id, name, template: z.enum(PANEL_TEMPLATES).default("em-branco") });

async function createPanelImpl(input: z.input<typeof createInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? t.invalid);
  const admin = await adminOf(parsed.data.dashboardId);
  if (!admin) return fail(t.onlyAdmin);
  const { dashboardId, template } = parsed.data;
  if (dashboardPanels(readStore(), dashboardId).length >= MAX_PANELS) return fail(t.tooManyPanels(MAX_PANELS));
  const { widgets, layout } = templatePanel(template);
  const panelId = newId();
  mutate((store) => {
    const panels = dashboardPanels(store, dashboardId);
    const now = nowIso();
    store.panels.push({
      id: panelId,
      dashboardId,
      name: parsed.data.name,
      position: panels.length,
      isDefault: panels.length === 0,
      visibility: "workspace",
      viewerIds: [],
      membersCanFilter: true,
      defaults: {},
      widgets,
      layout,
      createdBy: admin.ctx.user.id,
      createdAt: now,
      updatedAt: now,
    });
  });
  refresh(dashboardId);
  return { ok: true, data: { id: panelId } };
}

const updateInput = z.object({
  panelId: id,
  name: name.optional(),
  visibility: z.enum(["workspace", "restricted"]).optional(),
  viewerIds: z.array(id).max(200).optional(),
  membersCanFilter: z.boolean().optional(),
});

/** Nome, quem vê e se os membros podem mudar os filtros. */
async function updatePanelImpl(input: z.input<typeof updateInput>): Promise<ActionResult> {
  const parsed = updateInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? t.invalid);
  const found = await adminPanel(parsed.data.panelId);
  if (!found) return fail(t.onlyAdmin);
  const v = parsed.data;
  const dashboard = readStore().dashboards.find((d) => d.id === found.dashboardId)!;
  // Só pessoas do workspace podem ser liberadas.
  const members = new Set(readStore().workspaceMembers.filter((m) => m.workspaceId === dashboard.workspaceId).map((m) => m.userId));
  if (v.viewerIds?.some((userId) => !members.has(userId))) return fail(t.viewerNotMember);
  mutate((store) => {
    const panel = inStore(store, v.panelId);
    if (v.name !== undefined) panel.name = v.name;
    if (v.visibility !== undefined) panel.visibility = v.visibility;
    if (v.viewerIds !== undefined) panel.viewerIds = [...new Set(v.viewerIds)];
    if (v.membersCanFilter !== undefined) panel.membersCanFilter = v.membersCanFilter;
    panel.updatedAt = nowIso();
  });
  refresh(found.dashboardId);
  return { ok: true, data: undefined };
}

const panelInput = z.object({ panelId: id });

async function duplicatePanelImpl(input: z.input<typeof panelInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = panelInput.safeParse(input);
  if (!parsed.success) return fail(t.invalid);
  const found = await adminPanel(parsed.data.panelId);
  if (!found) return fail(t.onlyAdmin);
  if (dashboardPanels(readStore(), found.dashboardId).length >= MAX_PANELS) return fail(t.tooManyPanels(MAX_PANELS));
  const copyId = newId();
  mutate((store) => {
    const source = inStore(store, found.panel.id);
    const now = nowIso();
    store.panels.push({
      ...structuredClone(source),
      id: copyId,
      name: msg.panels.copyName(source.name).slice(0, 60),
      position: source.position + 0.5,
      isDefault: false,
      createdBy: found.ctx.user.id,
      createdAt: now,
      updatedAt: now,
    });
    renumber(store, found.dashboardId);
  });
  refresh(found.dashboardId);
  return { ok: true, data: { id: copyId } };
}

async function deletePanelImpl(input: z.input<typeof panelInput>): Promise<ActionResult> {
  const parsed = panelInput.safeParse(input);
  if (!parsed.success) return fail(t.invalid);
  const found = await adminPanel(parsed.data.panelId);
  if (!found) return fail(t.onlyAdmin);
  if (dashboardPanels(readStore(), found.dashboardId).length <= 1) return fail(t.lastPanel);
  mutate((store) => {
    const panel = inStore(store, found.panel.id);
    store.panels = store.panels.filter((p) => p.id !== panel.id);
    // O padrão foi apagado: o primeiro que sobrou vira o padrão.
    const rest = dashboardPanels(store, found.dashboardId);
    if (panel.isDefault && rest[0]) rest[0].isDefault = true;
    renumber(store, found.dashboardId);
  });
  refresh(found.dashboardId);
  return { ok: true, data: undefined };
}

async function setDefaultPanelImpl(input: z.input<typeof panelInput>): Promise<ActionResult> {
  const parsed = panelInput.safeParse(input);
  if (!parsed.success) return fail(t.invalid);
  const found = await adminPanel(parsed.data.panelId);
  if (!found) return fail(t.onlyAdmin);
  mutate((store) => {
    for (const p of dashboardPanels(store, found.dashboardId)) p.isDefault = p.id === found.panel.id;
  });
  refresh(found.dashboardId);
  return { ok: true, data: undefined };
}

const moveInput = z.object({ panelId: id, direction: z.union([z.literal(-1), z.literal(1)]) });

/** Uma posição para a esquerda (-1) ou para a direita (1) nas abas. */
async function movePanelImpl(input: z.input<typeof moveInput>): Promise<ActionResult> {
  const parsed = moveInput.safeParse(input);
  if (!parsed.success) return fail(t.invalid);
  const found = await adminPanel(parsed.data.panelId);
  if (!found) return fail(t.onlyAdmin);
  mutate((store) => {
    const panels = dashboardPanels(store, found.dashboardId);
    const from = panels.findIndex((p) => p.id === found.panel.id);
    const to = from + parsed.data.direction;
    if (to < 0 || to >= panels.length) return;
    [panels[from], panels[to]] = [panels[to], panels[from]];
    panels.forEach((p, i) => (p.position = i));
  });
  refresh(found.dashboardId);
  return { ok: true, data: undefined };
}

const defaultsInput = z.object({ panelId: id, params: z.record(z.string(), z.string().max(2000)) });

/** Os filtros atuais da tela viram os filtros com que o painel abre (vazio = sem filtro padrão). */
async function savePanelDefaultsImpl(input: z.input<typeof defaultsInput>): Promise<ActionResult> {
  const parsed = defaultsInput.safeParse(input);
  if (!parsed.success) return fail(t.invalid);
  const found = await adminPanel(parsed.data.panelId);
  if (!found) return fail(t.onlyAdmin);
  mutate((store) => {
    const panel = inStore(store, found.panel.id);
    panel.defaults = pickFilters(parsed.data.params);
    panel.updatedAt = nowIso();
  });
  refresh(found.dashboardId);
  return { ok: true, data: undefined };
}

// ---- grade e gráficos --------------------------------------------------------------------------

const layoutInput = z.object({ panelId: id, layout: PANEL_LAYOUT });

/** A grade depois de arrastar ou redimensionar (salva sozinha, sem botão). */
async function savePanelLayoutImpl(input: z.input<typeof layoutInput>): Promise<ActionResult> {
  const parsed = layoutInput.safeParse(input);
  if (!parsed.success) return fail(t.invalidLayout);
  const found = await adminPanel(parsed.data.panelId);
  if (!found) return fail(t.onlyAdmin);
  mutate((store) => {
    const panel = inStore(store, found.panel.id);
    panel.layout = normalizeLayout(parseWidgets(panel.widgets).widgets, parsed.data.layout);
    panel.updatedAt = nowIso();
  });
  refresh(found.dashboardId);
  return { ok: true, data: undefined };
}

const widgetInput = z.object({ panelId: id, widget: z.unknown() });

/** Gráfico novo (vai para o fim da grade) ou mudado (fica onde estava). */
async function saveWidgetImpl(input: z.input<typeof widgetInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = widgetInput.safeParse(input);
  if (!parsed.success) return fail(t.invalid);
  const widget = PANEL_WIDGET.safeParse(parsed.data.widget);
  if (!widget.success) return fail(widget.error.issues[0]?.message ?? t.invalid);
  const found = await adminPanel(parsed.data.panelId);
  if (!found) return fail(t.onlyAdmin);
  const { widgets } = parseWidgets(found.panel.widgets);
  const exists = widgets.some((w) => w.id === widget.data.id);
  if (!exists && widgets.length >= MAX_WIDGETS) return fail(t.tooManyWidgets(MAX_WIDGETS));
  mutate((store) => {
    const panel = inStore(store, found.panel.id);
    const current = parseWidgets(panel.widgets).widgets;
    const next: PanelWidget[] = exists ? current.map((w) => (w.id === widget.data.id ? widget.data : w)) : [...current, widget.data];
    panel.widgets = next;
    panel.layout = placeWidgets(next, normalizeLayout(next, panel.layout));
    panel.updatedAt = nowIso();
  });
  refresh(found.dashboardId);
  return { ok: true, data: { id: widget.data.id } };
}

const widgetIdInput = z.object({ panelId: id, widgetId: id });

async function deleteWidgetImpl(input: z.input<typeof widgetIdInput>): Promise<ActionResult> {
  const parsed = widgetIdInput.safeParse(input);
  if (!parsed.success) return fail(t.invalid);
  const found = await adminPanel(parsed.data.panelId);
  if (!found) return fail(t.onlyAdmin);
  mutate((store) => {
    const panel = inStore(store, found.panel.id);
    const rest = parseWidgets(panel.widgets).widgets.filter((w) => w.id !== parsed.data.widgetId);
    panel.widgets = rest;
    panel.layout = normalizeLayout(rest, panel.layout);
    panel.updatedAt = nowIso();
  });
  refresh(found.dashboardId);
  return { ok: true, data: undefined };
}

/** Cópia do gráfico, logo abaixo dos outros. */
async function duplicateWidgetImpl(input: z.input<typeof widgetIdInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = widgetIdInput.safeParse(input);
  if (!parsed.success) return fail(t.invalid);
  const found = await adminPanel(parsed.data.panelId);
  if (!found) return fail(t.onlyAdmin);
  const { widgets } = parseWidgets(found.panel.widgets);
  const source = widgets.find((w) => w.id === parsed.data.widgetId);
  if (!source) return fail(t.widgetMissing);
  if (widgets.length >= MAX_WIDGETS) return fail(t.tooManyWidgets(MAX_WIDGETS));
  const copyId = `g-${newId().replace(/-/g, "").slice(0, 10)}`;
  mutate((store) => {
    const panel = inStore(store, found.panel.id);
    const current = parseWidgets(panel.widgets).widgets;
    const next = [...current, { ...structuredClone(source), id: copyId }];
    const layout = normalizeLayout(current, panel.layout);
    const original = layout.find((item) => item.i === source.id);
    panel.widgets = next;
    // Do mesmo tamanho do original, no fim da grade.
    const bottom = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    panel.layout = original ? [...layout, { ...original, i: copyId, x: 0, y: bottom }] : placeWidgets(next, layout);
    panel.updatedAt = nowIso();
  });
  refresh(found.dashboardId);
  return { ok: true, data: { id: copyId } };
}

// ---- pré-visualização --------------------------------------------------------------------------

const previewInput = z.object({ dashboardId: id, params: z.record(z.string(), z.string().max(2000)), widget: z.unknown() });

export type PreviewResult = { ok: true; data: RenderedWidget } | { ok: false; error: string; issues: string[] };

/**
 * O gráfico como vai ficar, com os filtros da tela, sem gravar nada. Os erros
 * de configuração voltam todos, em português, para o editor mostrar.
 */
async function previewWidgetImpl(input: z.input<typeof previewInput>): Promise<PreviewResult> {
  const parsed = previewInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: t.invalid, issues: [] };
  const admin = await adminOf(parsed.data.dashboardId);
  if (!admin) return { ok: false, error: t.onlyAdmin, issues: [] };
  const widget = PANEL_WIDGET.safeParse(parsed.data.widget);
  if (!widget.success) {
    const issues = [...new Set(widget.error.issues.map((i) => i.message))];
    return { ok: false, error: issues[0] ?? t.invalid, issues };
  }
  const page = await loadPanels(admin.ctx, admin.dashboardId, widgetParams(pickFilters(parsed.data.params), widget.data));
  if (page.fxUnavailable) return { ok: false, error: msg.panel.fx.title, issues: [] };
  return { ok: true, data: renderWidget(page.computer, widget.data) };
}

// ---- modo real (AUTH_MODE=live): cada action roda sobre o retrato do Supabase, com vendas e anúncios (server/live/action.ts) ----

export async function createPanel(...args: Parameters<typeof createPanelImpl>): ReturnType<typeof createPanelImpl> {
  return liveTrackingAction(() => createPanelImpl(...args));
}

export async function updatePanel(...args: Parameters<typeof updatePanelImpl>): ReturnType<typeof updatePanelImpl> {
  return liveTrackingAction(() => updatePanelImpl(...args));
}

export async function duplicatePanel(...args: Parameters<typeof duplicatePanelImpl>): ReturnType<typeof duplicatePanelImpl> {
  return liveTrackingAction(() => duplicatePanelImpl(...args));
}

export async function deletePanel(...args: Parameters<typeof deletePanelImpl>): ReturnType<typeof deletePanelImpl> {
  return liveTrackingAction(() => deletePanelImpl(...args));
}

export async function setDefaultPanel(...args: Parameters<typeof setDefaultPanelImpl>): ReturnType<typeof setDefaultPanelImpl> {
  return liveTrackingAction(() => setDefaultPanelImpl(...args));
}

export async function movePanel(...args: Parameters<typeof movePanelImpl>): ReturnType<typeof movePanelImpl> {
  return liveTrackingAction(() => movePanelImpl(...args));
}

export async function savePanelDefaults(...args: Parameters<typeof savePanelDefaultsImpl>): ReturnType<typeof savePanelDefaultsImpl> {
  return liveTrackingAction(() => savePanelDefaultsImpl(...args));
}

export async function savePanelLayout(...args: Parameters<typeof savePanelLayoutImpl>): ReturnType<typeof savePanelLayoutImpl> {
  return liveTrackingAction(() => savePanelLayoutImpl(...args));
}

export async function saveWidget(...args: Parameters<typeof saveWidgetImpl>): ReturnType<typeof saveWidgetImpl> {
  return liveTrackingAction(() => saveWidgetImpl(...args));
}

export async function deleteWidget(...args: Parameters<typeof deleteWidgetImpl>): ReturnType<typeof deleteWidgetImpl> {
  return liveTrackingAction(() => deleteWidgetImpl(...args));
}

export async function duplicateWidget(...args: Parameters<typeof duplicateWidgetImpl>): ReturnType<typeof duplicateWidgetImpl> {
  return liveTrackingAction(() => duplicateWidgetImpl(...args));
}

export async function previewWidget(...args: Parameters<typeof previewWidgetImpl>): ReturnType<typeof previewWidgetImpl> {
  return liveTrackingAction(() => previewWidgetImpl(...args));
}
