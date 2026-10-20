"use client";

import "react-grid-layout/css/styles.css";

import { Copy, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ReactGridLayout, useContainerWidth, type Layout } from "react-grid-layout";
import { toast } from "sonner";

import { WidgetEditor } from "@/components/charts/widget-editor";
import { EmptyState } from "@/components/ds/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/charts/messages";
import { GRID_COLS, GRID_MARGIN, ROW_HEIGHT, WIDGET_SIZE, type PanelLayoutItem } from "@/lib/charts/templates";
import { widgetTitle, type PanelWidget } from "@/lib/charts/widgets";
import { cn } from "@/lib/utils";
import { deleteWidget, duplicateWidget, savePanelLayout } from "@/server/actions/panels";
import type { PanelEditorData } from "@/server/data/panel-config";

// Grade de um painel salvo (12 colunas). Para ler, uma grade CSS comum: aparece
// sem esperar o JavaScript e, no celular, empilha os gráficos na ordem da grade.
// Para editar (admin, tela larga), o react-grid-layout arrasta e redimensiona, e
// cada mudança é salva sozinha.

const t = msg.panels;
/** Abaixo disso, a grade de edição não cabe: os gráficos ficariam espremidos. */
const EDIT_MIN_WIDTH = 900;

const byPosition = (a: PanelLayoutItem, b: PanelLayoutItem) => a.y - b.y || a.x - b.x;
const layoutKey = (layout: PanelLayoutItem[]) => JSON.stringify([...layout].sort((a, b) => a.i.localeCompare(b.i)).map((l) => [l.i, l.x, l.y, l.w, l.h]));

/** Altura em pixels de um gráfico com h linhas (a mesma da grade de edição). */
const heightOf = (h: number) => h * ROW_HEIGHT + (h - 1) * GRID_MARGIN;

function ViewGrid({ layout, widgets, slots }: { layout: PanelLayoutItem[]; widgets: Map<string, PanelWidget>; slots: Record<string, ReactNode> }) {
  // As 12 colunas dependem da largura da própria grade (container query), não da janela:
  // numa tela de 1024 px com o menu aberto sobram ~730 px, e quatro cartões de KPI por
  // linha cortariam os números. Abaixo de 56rem (896 px, perto do mínimo da grade de
  // edição), vale a grade de 2 colunas.
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 @4xl:grid-cols-12 @4xl:[grid-auto-rows:40px]">
        {[...layout].sort(byPosition).map((item) => {
          const widget = widgets.get(item.i);
          if (!widget) return null;
          const style = {
            "--panel-col": `${item.x + 1} / span ${item.w}`,
            "--panel-row": `${item.y + 1} / span ${item.h}`,
            "--panel-h": `${heightOf(item.h)}px`,
          } as CSSProperties;
          return (
            <div
              key={item.i}
              data-widget={item.i}
              style={style}
              className={cn(
                "h-[var(--panel-h)] min-w-0 @4xl:h-auto @4xl:[grid-column:var(--panel-col)] @4xl:[grid-row:var(--panel-row)]",
                widget.type === "kpi" ? "sm:col-span-1" : "sm:col-span-2",
              )}
            >
              {slots[item.i]}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PanelGrid({
  dashboardId,
  panelId,
  editing,
  layout,
  widgets,
  slots,
  params,
  editorData,
  canEdit,
}: {
  dashboardId: string;
  panelId: string;
  editing: boolean;
  layout: PanelLayoutItem[];
  widgets: PanelWidget[];
  slots: Record<string, ReactNode>;
  params: Record<string, string>;
  editorData: PanelEditorData | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
  const [items, setItems] = useState(layout);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [editor, setEditor] = useState<{ widget: PanelWidget | null } | null>(null);
  const [removing, setRemoving] = useState<PanelWidget | null>(null);
  const saved = useRef(layoutKey(layout));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Arrastando ou redimensionando agora: a grade só é salva depois de soltar. */
  const moving = useRef(false);
  const { width, containerRef, mounted } = useContainerWidth();

  // A grade salva mudou no servidor (gráfico novo, removido, outro painel): a tela acompanha.
  const [source, setSource] = useState(layout);
  if (source !== layout) {
    setSource(layout);
    setItems(layout);
  }
  useEffect(() => {
    saved.current = layoutKey(layout);
  }, [layout]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const save = async (next: PanelLayoutItem[]) => {
    setStatus("saving");
    const result = await savePanelLayout({ panelId, layout: next });
    if (result.ok) {
      saved.current = layoutKey(next);
      setStatus("saved");
    } else {
      setStatus("idle");
      toast.error(result.error || t.saveError);
    }
  };

  const clean = (next: Layout) => next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));

  /** Salva a grade um instante depois da última mudança (sem botão). */
  const schedule = (next: PanelLayoutItem[]) => {
    if (layoutKey(next) === saved.current) return;
    if (timer.current) clearTimeout(timer.current);
    // Já avisa que tem mudança a caminho: "Grade salva" de antes não vale mais.
    setStatus("saving");
    timer.current = setTimeout(() => void save(next), 600);
  };

  const onLayoutChange = (next: Layout) => {
    const items = clean(next);
    setItems(items);
    if (!moving.current) schedule(items);
  };
  const onStart = () => {
    moving.current = true;
  };
  const onStop = (next: Layout) => {
    moving.current = false;
    schedule(clean(next));
  };

  const duplicate = async (widget: PanelWidget) => {
    const result = await duplicateWidget({ panelId, widgetId: widget.id });
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  };

  const remove = async () => {
    if (!removing) return;
    const result = await deleteWidget({ panelId, widgetId: removing.id });
    setRemoving(null);
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  };

  const empty = widgets.length === 0;
  const wide = mounted && width >= EDIT_MIN_WIDTH;

  return (
    <div className="grid gap-3">
      {editing && canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border p-2">
          <p className="text-xs text-muted-foreground">{wide ? t.editHint : t.wideScreen}</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {status === "saving" ? t.saving : status === "saved" ? t.saved : ""}
            </span>
            <Button size="sm" onClick={() => setEditor({ widget: null })}>
              <Plus aria-hidden="true" className="size-4" />
              {t.addWidget}
            </Button>
          </div>
        </div>
      )}

      {empty ? (
        <EmptyState icon={Plus} title={t.emptyPanel.title} description={canEdit ? t.emptyPanel.admin : t.emptyPanel.member} className="py-12" />
      ) : (
        <div ref={containerRef} className="panel-grid min-w-0">
          {editing && canEdit && wide ? (
            <ReactGridLayout
              width={width}
              layout={items.map((item) => {
                const size = WIDGET_SIZE[byId.get(item.i)?.type ?? "line"];
                return { ...item, minW: size.minW, minH: size.minH };
              })}
              gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT, margin: [GRID_MARGIN, GRID_MARGIN], containerPadding: [0, 0] }}
              dragConfig={{ enabled: true, handle: ".panel-drag-handle" }}
              resizeConfig={{ enabled: true, handles: ["se"] }}
              onLayoutChange={onLayoutChange}
              onDragStart={onStart}
              onResizeStart={onStart}
              onDragStop={onStop}
              onResizeStop={onStop}
            >
              {items.map((item) => {
                const widget = byId.get(item.i);
                if (!widget) return <div key={item.i} />;
                const title = widgetTitle(widget);
                return (
                  <div key={item.i} data-widget={item.i} className="relative min-w-0 rounded-[var(--ds-radius-lg)] outline-2 outline-offset-2 outline-dashed outline-border">
                    {/* Ferramentas flutuando no canto: o gráfico continua com a altura toda. */}
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-md border border-border bg-background/95 p-0.5 shadow-sm">
                      <button
                        type="button"
                        className="panel-drag-handle cursor-grab rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                        aria-label={`${t.dragHandle}: ${title}`}
                        title={t.dragHandle}
                      >
                        <GripVertical aria-hidden="true" className="size-4" />
                      </button>
                      <Button variant="ghost" size="icon" className="size-7" aria-label={`${t.editWidget}: ${title}`} onClick={() => setEditor({ widget })}>
                        <Pencil aria-hidden="true" className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" aria-label={`${t.duplicateWidget}: ${title}`} onClick={() => void duplicate(widget)}>
                        <Copy aria-hidden="true" className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" aria-label={`${t.removeWidget}: ${title}`} onClick={() => setRemoving(widget)}>
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      </Button>
                    </div>
                    <div className="h-full">{slots[item.i]}</div>
                  </div>
                );
              })}
            </ReactGridLayout>
          ) : (
            <ViewGrid layout={items} widgets={byId} slots={slots} />
          )}
        </div>
      )}

      {editor && editorData && (
        <WidgetEditor
          open
          onOpenChange={(open) => !open && setEditor(null)}
          dashboardId={dashboardId}
          panelId={panelId}
          params={params}
          initial={editor.widget}
          data={editorData}
          onSaved={() => {
            setEditor(null);
            router.refresh();
          }}
        />
      )}

      <AlertDialog open={removing != null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removing ? t.removeConfirm(widgetTitle(removing)) : ""}</AlertDialogTitle>
            <AlertDialogDescription>{t.removeDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>{t.removeWidget}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
