"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ChartFrame } from "@/components/charts/chart-frame";
import { PanelKpi } from "@/components/charts/panel-kpi";
import { useChartTheme } from "@/components/charts/use-chart-theme";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  DIMENSIONS,
  getMetric,
  metricCanBeNegative,
  METRICS,
  metricSupportsDimension,
  type Dimension,
  type MetricDef,
  type MetricFormat,
  type MetricId,
} from "@/lib/charts/catalog";
import { defaultWidget, fromInputValue, inputUnit, newWidgetId, scopeNote, switchWidgetType, toInputValue } from "@/lib/charts/editor";
import { msg } from "@/lib/charts/messages";
import { GRANULARITIES, PANEL_PRESETS } from "@/lib/charts/options";
import {
  PANEL_WIDGET,
  WIDGET_TYPES,
  widgetTitle,
  type BarWidget,
  type ColumnWidget,
  type FunnelWidget,
  type GanttWidget,
  type KpiWidget,
  type LineWidget,
  type PanelWidget,
  type PieWidget,
  type TreemapWidget,
  type WidgetDisplay,
} from "@/lib/charts/widgets";
import { previewWidget, saveWidget, type PreviewResult } from "@/server/actions/panels";
import type { PanelEditorData } from "@/server/data/panel-config";

// Editor de gráfico (painel lateral). Cada mudança atualiza a prévia, montada no
// servidor pela mesma função da página, com o período e os filtros da tela.
// Nada é gravado até "Salvar gráfico".

const e = msg.panels.editor;
const NONE = "__nenhum__";
type SetWidget = (next: PanelWidget) => void;

const isPart = (def: MetricDef) => def.kind === "sum" && !metricCanBeNegative(def);
const isCount = (def: MetricDef) => def.kind === "sum" && def.format === "number";

// ---- campos genéricos --------------------------------------------------------------------------

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div id={id} className="grid gap-2">
        {children}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MetricSelect({
  label,
  value,
  onChange,
  filter = () => true,
  none,
}: {
  label: string;
  value: MetricId | null;
  onChange: (value: MetricId | null) => void;
  filter?: (def: MetricDef) => boolean;
  /** Texto da opção "nenhuma" (sem ela, a métrica é obrigatória). */
  none?: string;
}) {
  const options = METRICS.filter((m) => filter(m) || m.id === value);
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : (v as MetricId))}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {none && <SelectItem value={NONE}>{none}</SelectItem>}
        {options.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.info.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DimensionSelect({ label, value, onChange }: { label: string; value: Dimension; onChange: (value: Dimension) => void }) {
  return <Choice label={label} value={value} options={DIMENSIONS.map((d) => ({ value: d, label: msg.dimension[d] }))} onChange={onChange} />;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      aria-label={label}
      onChange={(ev) => {
        const n = Number(ev.target.value);
        if (Number.isInteger(n)) onChange(Math.min(max, Math.max(min, n)));
      }}
    />
  );
}

/** Valor na unidade da métrica: a pessoa digita reais e % (com vírgula); o gráfico guarda centavos e fração. */
function ValueField({ label, value, format, onChange }: { label: string; value: number | null; format: MetricFormat; onChange: (value: number | null) => void }) {
  const [text, setText] = useState(() => toInputValue(value, format));
  // Valor trocado por fora (outra métrica, outro tipo): o campo acompanha. O que a pessoa está
  // digitando ("1," a caminho de "1,5") fica como está enquanto ainda vale o mesmo número.
  const [prev, setPrev] = useState({ value, format });
  if (prev.value !== value || prev.format !== format) {
    setPrev({ value, format });
    if (prev.format !== format || fromInputValue(text, format) !== value) setText(toInputValue(value, format));
  }
  const unit = inputUnit(format);
  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="decimal"
        value={text}
        aria-label={label}
        placeholder={e.axisAuto}
        onChange={(ev) => {
          setText(ev.target.value);
          const parsed = fromInputValue(ev.target.value, format);
          if (parsed != null || ev.target.value.trim() === "") onChange(parsed);
        }}
      />
      {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
    </div>
  );
}

/** Linha de uma lista editável (métricas, etapas, níveis): o campo e os botões de subir, descer e remover. */
function Row({
  children,
  index,
  count,
  min,
  onMove,
  onRemove,
  movable = false,
}: {
  children: ReactNode;
  index: number;
  count: number;
  min: number;
  onMove?: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  movable?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">{children}</div>
      {movable && onMove && (
        <>
          <Button variant="ghost" size="icon" className="size-8" aria-label={e.moveUp} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
            <ArrowUp aria-hidden="true" className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label={e.moveDown} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
            <ArrowDown aria-hidden="true" className="size-4" />
          </Button>
        </>
      )}
      <Button variant="ghost" size="icon" className="size-8" aria-label={e.remove} disabled={count <= min} onClick={() => onRemove(index)}>
        <X aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}

function AddButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="sm" className="w-fit" onClick={onClick} disabled={disabled}>
      <Plus aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

// ---- campos de cada tipo -----------------------------------------------------------------------

function KpiFields({ w, set }: { w: KpiWidget; set: SetWidget }) {
  const format = getMetric(w.metric).format;
  return (
    <>
      <Field label={e.metric}>
        <MetricSelect label={e.metric} value={w.metric} onChange={(metric) => metric && set({ ...w, metric })} />
      </Field>
      <Toggle label={e.sparkline} checked={w.sparkline} onChange={(sparkline) => set({ ...w, sparkline })} />
      <Field label={e.goal}>
        <Choice
          label={e.goal}
          value={w.goal ? w.goal.source : "none"}
          options={[
            { value: "none", label: e.goalNone },
            { value: "dashboard", label: e.goalDashboard },
            { value: "value", label: e.goalValue },
          ]}
          onChange={(source) => set({ ...w, goal: source === "none" ? null : source === "dashboard" ? { source } : { source, value: w.goal?.source === "value" ? w.goal.value : 1 } })}
        />
        {w.goal?.source === "value" && (
          <ValueField label={e.value} value={w.goal.value} format={format} onChange={(value) => set({ ...w, goal: { source: "value", value: value ?? 0 } })} />
        )}
      </Field>
      <Field label={e.alert}>
        <Choice
          label={e.alert}
          value={w.alert ? w.alert.when : "none"}
          options={[
            { value: "none", label: e.alertNone },
            { value: "below", label: e.alertBelow },
            { value: "above", label: e.alertAbove },
          ]}
          onChange={(when) => set({ ...w, alert: when === "none" ? null : { when, value: w.alert?.value ?? 0 } })}
        />
        {w.alert && <ValueField label={e.value} value={w.alert.value} format={format} onChange={(value) => set({ ...w, alert: { when: w.alert!.when, value: value ?? 0 } })} />}
      </Field>
    </>
  );
}

function LineFields({ w, set }: { w: LineWidget; set: SetWidget }) {
  const goalFormat = getMetric((w.series.find((s) => s.axis === (w.goal?.axis ?? "left")) ?? w.series[0]).metric).format;
  return (
    <>
      <Field label={e.metrics}>
        {w.series.map((s, i) => (
          <Row key={i} index={i} count={w.series.length} min={1} onRemove={(index) => set({ ...w, series: w.series.filter((_, j) => j !== index) })}>
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
              <MetricSelect label={`${e.metric} ${i + 1}`} value={s.metric} onChange={(metric) => metric && set({ ...w, series: w.series.map((x, j) => (j === i ? { ...x, metric } : x)) })} />
              <Choice
                label={e.axis}
                value={s.axis}
                options={[
                  { value: "left", label: e.axisLeft },
                  { value: "right", label: e.axisRight },
                ]}
                onChange={(axis) => set({ ...w, series: w.series.map((x, j) => (j === i ? { ...x, axis } : x)) })}
              />
            </div>
          </Row>
        ))}
        <AddButton label={e.addMetric} disabled={w.series.length >= 4} onClick={() => set({ ...w, series: [...w.series, { metric: "spend", axis: "left" }] })} />
      </Field>
      <div className="grid gap-2">
        <Toggle label={e.smooth} checked={w.smooth} onChange={(smooth) => set({ ...w, smooth })} />
        <Toggle label={e.markers} checked={w.markers} onChange={(markers) => set({ ...w, markers })} />
        <Toggle label={e.area} checked={w.area} onChange={(area) => set({ ...w, area })} />
        <Toggle label={e.average} checked={w.average} onChange={(average) => set({ ...w, average })} />
        <Toggle label={e.zoom} checked={w.zoom} onChange={(zoom) => set({ ...w, zoom })} />
        <Toggle label={e.drawCompare} checked={w.compare} onChange={(compare) => set({ ...w, compare })} />
        <Toggle label={e.goalLine} checked={w.goal != null} onChange={(on) => set({ ...w, goal: on ? { value: 0, axis: "left" } : null })} />
      </div>
      {w.goal && (
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
          <ValueField label={e.goalLine} value={w.goal.value} format={goalFormat} onChange={(value) => set({ ...w, goal: { ...w.goal!, value: value ?? 0 } })} />
          <Choice
            label={e.axis}
            value={w.goal.axis}
            options={[
              { value: "left", label: e.axisLeft },
              { value: "right", label: e.axisRight },
            ]}
            onChange={(axis) => set({ ...w, goal: { ...w.goal!, axis } })}
          />
        </div>
      )}
    </>
  );
}

function ColumnFields({ w, set }: { w: ColumnWidget; set: SetWidget }) {
  return (
    <>
      <Field label={e.metrics}>
        {w.series.map((s, i) => (
          <Row key={i} index={i} count={w.series.length} min={1} onRemove={(index) => set({ ...w, series: w.series.filter((_, j) => j !== index) })}>
            <MetricSelect label={`${e.metric} ${i + 1}`} value={s.metric} onChange={(metric) => metric && set({ ...w, series: w.series.map((x, j) => (j === i ? { metric } : x)) })} />
          </Row>
        ))}
        <AddButton label={e.addMetric} disabled={w.series.length >= 4} onClick={() => set({ ...w, series: [...w.series, { metric: "gross" }] })} />
      </Field>
      <Field label={e.mode}>
        <Choice
          label={e.mode}
          value={w.mode}
          options={(["grouped", "stacked", "percent"] as const).map((value) => ({ value, label: e.modes[value] }))}
          onChange={(mode) => set({ ...w, mode })}
        />
      </Field>
      <Field label={e.lineMetric}>
        <MetricSelect label={e.lineMetric} value={w.line?.metric ?? null} none={e.noLine} onChange={(metric) => set({ ...w, line: metric ? { metric } : null })} />
      </Field>
      <div className="grid gap-2">
        <Toggle label={e.labels} checked={w.labels} onChange={(labels) => set({ ...w, labels })} />
        <Toggle label={e.drawCompare} checked={w.compare} onChange={(compare) => set({ ...w, compare })} />
      </div>
    </>
  );
}

function BarFields({ w, set }: { w: BarWidget; set: SetWidget }) {
  const fits = (def: MetricDef) => metricSupportsDimension(def, w.dimension);
  return (
    <>
      <Field label={e.dimension}>
        <DimensionSelect label={e.dimension} value={w.dimension} onChange={(dimension) => set({ ...w, dimension })} />
      </Field>
      <Field label={e.metrics}>
        {w.metrics.map((m, i) => (
          <Row key={i} index={i} count={w.metrics.length} min={1} onRemove={(index) => set({ ...w, metrics: w.metrics.filter((_, j) => j !== index) })}>
            <MetricSelect label={`${e.metric} ${i + 1}`} value={m} filter={fits} onChange={(metric) => metric && set({ ...w, metrics: w.metrics.map((x, j) => (j === i ? metric : x)) })} />
          </Row>
        ))}
        <AddButton label={e.addMetric} disabled={w.metrics.length >= 3} onClick={() => set({ ...w, metrics: [...w.metrics, "gross"] })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={e.mode}>
          <Choice label={e.mode} value={w.mode} options={(["grouped", "stacked"] as const).map((value) => ({ value, label: e.modes[value] }))} onChange={(mode) => set({ ...w, mode })} />
        </Field>
        <Field label={e.order}>
          <Choice
            label={e.order}
            value={w.order}
            options={[
              { value: "desc", label: e.orderDesc },
              { value: "asc", label: e.orderAsc },
            ]}
            onChange={(order) => set({ ...w, order })}
          />
        </Field>
      </div>
      <Field label={e.topN}>
        <NumberField label={e.topN} value={w.topN} min={1} max={50} onChange={(topN) => set({ ...w, topN })} />
      </Field>
      <div className="grid gap-2">
        <Toggle label={e.others} checked={w.others} onChange={(others) => set({ ...w, others })} />
        <Toggle label={e.labels} checked={w.labels} onChange={(labels) => set({ ...w, labels })} />
      </div>
    </>
  );
}

function PieFields({ w, set }: { w: PieWidget; set: SetWidget }) {
  return (
    <>
      <Field label={e.dimension}>
        <DimensionSelect label={e.dimension} value={w.dimension} onChange={(dimension) => set({ ...w, dimension })} />
      </Field>
      <Field label={e.metric}>
        <MetricSelect
          label={e.metric}
          value={w.metric}
          filter={(def) => isPart(def) && metricSupportsDimension(def, w.dimension)}
          onChange={(metric) => metric && set({ ...w, metric })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={e.slices}>
          <NumberField label={e.slices} value={w.slices} min={2} max={8} onChange={(slices) => set({ ...w, slices })} />
        </Field>
        <Field label={e.pieLabels}>
          <Choice
            label={e.pieLabels}
            value={w.labels}
            options={(["both", "value", "percent"] as const).map((value) => ({ value, label: e.pieLabelOptions[value] }))}
            onChange={(labels) => set({ ...w, labels })}
          />
        </Field>
      </div>
    </>
  );
}

function TreemapFields({ w, set }: { w: TreemapWidget; set: SetWidget }) {
  const fitsAll = (def: MetricDef) => w.levels.every((d) => metricSupportsDimension(def, d));
  return (
    <>
      <Field label={e.levels}>
        {w.levels.map((d, i) => (
          <Row key={i} index={i} count={w.levels.length} min={1} onRemove={(index) => set({ ...w, levels: w.levels.filter((_, j) => j !== index) })}>
            <DimensionSelect label={`${e.dimension} ${i + 1}`} value={d} onChange={(dimension) => set({ ...w, levels: w.levels.map((x, j) => (j === i ? dimension : x)) })} />
          </Row>
        ))}
        <AddButton label={e.addLevel} disabled={w.levels.length >= 3} onClick={() => set({ ...w, levels: [...w.levels, w.levels.includes("ad") ? "adSet" : "ad"] })} />
      </Field>
      <Field label={e.size}>
        <MetricSelect label={e.size} value={w.size} filter={(def) => isPart(def) && fitsAll(def)} onChange={(size) => size && set({ ...w, size })} />
      </Field>
      <Field label={e.color}>
        <MetricSelect label={e.color} value={w.color} none={e.noColor} filter={fitsAll} onChange={(color) => set({ ...w, color })} />
      </Field>
      <Field label={e.perLevel}>
        <NumberField label={e.perLevel} value={w.topN} min={1} max={30} onChange={(topN) => set({ ...w, topN })} />
      </Field>
    </>
  );
}

function FunnelFields({ w, set, data }: { w: FunnelWidget; set: SetWidget; data: PanelEditorData }) {
  const source = w.source;
  return (
    <>
      <Field label={e.funnelSource}>
        <Choice
          label={e.funnelSource}
          value={source.kind}
          options={[
            { value: "sales", label: e.funnelSales },
            { value: "kanban", label: e.funnelKanban },
          ]}
          onChange={(kind) =>
            set({
              ...w,
              source: kind === "sales" ? { kind, steps: ["impressions", "clicks", "addToCarts", "orders", "paid"] } : { kind, boardId: null, listIds: null },
            })
          }
        />
      </Field>
      {source.kind === "sales" ? (
        <Field label={e.steps}>
          {source.steps.map((step, i) => (
            <Row
              key={i}
              index={i}
              count={source.steps.length}
              min={2}
              movable
              onMove={(from, to) => set({ ...w, source: { ...source, steps: move(source.steps, from, to) } })}
              onRemove={(index) => set({ ...w, source: { ...source, steps: source.steps.filter((_, j) => j !== index) } })}
            >
              <MetricSelect
                label={`${e.metric} ${i + 1}`}
                value={step}
                filter={isCount}
                onChange={(metric) => metric && set({ ...w, source: { ...source, steps: source.steps.map((x, j) => (j === i ? metric : x)) } })}
              />
            </Row>
          ))}
          <AddButton
            label={e.addStep}
            disabled={source.steps.length >= 6}
            onClick={() => set({ ...w, source: { ...source, steps: [...source.steps, METRICS.find((m) => isCount(m) && !source.steps.includes(m.id))?.id ?? "paid"] } })}
          />
        </Field>
      ) : (
        <>
          <Field label={e.board}>
            <Select value={source.boardId ?? NONE} onValueChange={(v) => set({ ...w, source: { kind: "kanban", boardId: v === NONE ? null : v, listIds: null } })}>
              <SelectTrigger className="w-full" aria-label={e.board}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{e.firstBoard}</SelectItem>
                {data.boards.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {source.boardId && (
            <Field label={e.lists}>
              {(() => {
                const board = data.boards.find((b) => b.id === source.boardId);
                const chosen = source.listIds ?? [];
                const byId = new Map(board?.lists.map((l) => [l.id, l.name]) ?? []);
                return (
                  <>
                    {chosen.map((listId, i) => (
                      <Row
                        key={listId}
                        index={i}
                        count={chosen.length}
                        min={0}
                        movable
                        onMove={(from, to) => set({ ...w, source: { ...source, listIds: move(chosen, from, to) } })}
                        onRemove={(index) => {
                          const rest = chosen.filter((_, j) => j !== index);
                          set({ ...w, source: { ...source, listIds: rest.length ? rest : null } });
                        }}
                      >
                        <span className="text-sm">{byId.get(listId) ?? listId}</span>
                      </Row>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      {board?.lists
                        .filter((l) => !chosen.includes(l.id))
                        .map((l) => (
                          <Button key={l.id} variant="outline" size="sm" onClick={() => set({ ...w, source: { ...source, listIds: [...chosen, l.id] } })}>
                            <Plus aria-hidden="true" className="size-3.5" />
                            {l.name}
                          </Button>
                        ))}
                    </div>
                  </>
                );
              })()}
            </Field>
          )}
        </>
      )}
    </>
  );
}

function GanttFields({ w, set, data }: { w: GanttWidget; set: SetWidget; data: PanelEditorData }) {
  const chosen = new Set(w.boardIds ?? []);
  const toggle = (id: string, on: boolean) => {
    const next = data.boards.map((b) => b.id).filter((b) => (b === id ? on : chosen.has(b)));
    set({ ...w, boardIds: next.length ? next : null });
  };
  return (
    <>
      <Field label={e.boards}>
        {data.boards.map((b) => (
          <label key={b.id} className="flex items-center gap-2 text-sm">
            <Checkbox checked={chosen.has(b.id)} onCheckedChange={(v) => toggle(b.id, v === true)} />
            {b.name}
          </label>
        ))}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={e.groupBy}>
          <Choice label={e.groupBy} value={w.groupBy} options={(["list", "member", "board"] as const).map((value) => ({ value, label: e.groupByOptions[value] }))} onChange={(groupBy) => set({ ...w, groupBy })} />
        </Field>
        <Field label={e.colorBy}>
          <Choice label={e.colorBy} value={w.colorBy} options={(["member", "label", "list"] as const).map((value) => ({ value, label: e.colorByOptions[value] }))} onChange={(colorBy) => set({ ...w, colorBy })} />
        </Field>
      </div>
      <Field label={e.scale}>
        <Choice label={e.scale} value={w.scale} options={(["day", "week", "month"] as const).map((value) => ({ value, label: e.scaleOptions[value] }))} onChange={(scale) => set({ ...w, scale })} />
      </Field>
      <Toggle label={e.showDone} checked={w.showDone} onChange={(showDone) => set({ ...w, showDone })} />
    </>
  );
}

function TypeFields({ w, set, data }: { w: PanelWidget; set: SetWidget; data: PanelEditorData }) {
  switch (w.type) {
    case "kpi":
      return <KpiFields w={w} set={set} />;
    case "line":
      return <LineFields w={w} set={set} />;
    case "column":
      return <ColumnFields w={w} set={set} />;
    case "bar":
      return <BarFields w={w} set={set} />;
    case "pie":
    case "donut":
      return <PieFields w={w} set={set} />;
    case "treemap":
      return <TreemapFields w={w} set={set} />;
    case "funnel":
      return <FunnelFields w={w} set={set} data={data} />;
    case "gantt":
      return <GanttFields w={w} set={set} data={data} />;
  }
}

// ---- período, filtros e aparência --------------------------------------------------------------

function ScopeFields({ w, set }: { w: PanelWidget; set: SetWidget }) {
  const o = w.overrides;
  const setOverride = (patch: Partial<PanelWidget["overrides"]>) => {
    const next = { ...o, ...patch };
    for (const key of Object.keys(next) as (keyof typeof next)[]) if (next[key] === undefined) delete next[key];
    set({ ...w, overrides: next });
  };
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={e.period}>
          <Choice
            label={e.period}
            value={o.periodo ?? NONE}
            options={[{ value: NONE, label: e.panelDefault }, ...PANEL_PRESETS.map((p) => ({ value: p, label: msg.periods[p] }))]}
            onChange={(v) => setOverride({ periodo: v === NONE ? undefined : (v as (typeof PANEL_PRESETS)[number]) })}
          />
        </Field>
        <Field label={e.granularity}>
          <Choice
            label={e.granularity}
            value={o.agrupar ?? NONE}
            options={[{ value: NONE, label: e.panelDefault }, ...GRANULARITIES.map((g) => ({ value: g, label: msg.granularity[g] }))]}
            onChange={(v) => setOverride({ agrupar: v === NONE ? undefined : (v as (typeof GRANULARITIES)[number]) })}
          />
        </Field>
        <Field label={e.compare}>
          <Choice
            label={e.compare}
            value={o.comparar ?? NONE}
            options={[{ value: NONE, label: e.panelCompare }, ...(["off", "previous", "year"] as const).map((c) => ({ value: c, label: msg.compare[c] }))]}
            onChange={(v) => setOverride({ comparar: v === NONE ? undefined : (v as "off" | "previous" | "year") })}
          />
        </Field>
      </div>
      <Toggle label={e.ignoreFilters} checked={w.ignoreFilters} onChange={(ignoreFilters) => set({ ...w, ignoreFilters })} />
    </>
  );
}

/** Quantas cores a pessoa pode escolher: uma por série (ou fatia, etapa, item). */
function colorSlots(w: PanelWidget): number {
  switch (w.type) {
    case "line":
      return w.series.length;
    case "column":
      return w.series.length + (w.line ? 1 : 0);
    case "bar":
      return w.metrics.length;
    case "pie":
    case "donut":
      return w.slices;
    case "funnel":
      return w.source.kind === "sales" ? w.source.steps.length : 6;
    case "treemap":
      return w.color ? 0 : 8;
    case "gantt":
      return 8;
    default:
      return 0;
  }
}

/** Formato do eixo de valores (para o mínimo e o máximo), nos gráficos que têm eixo. */
function axisFormat(w: PanelWidget): MetricFormat | null {
  if (w.type === "line") return getMetric((w.series.find((s) => s.axis === "left") ?? w.series[0]).metric).format;
  if (w.type === "column") return w.mode === "percent" ? null : getMetric(w.series[0].metric).format;
  if (w.type === "bar") return getMetric(w.metrics[0]).format;
  return null;
}

function LookFields({ w, set }: { w: PanelWidget; set: SetWidget }) {
  const theme = useChartTheme();
  const d = w.display;
  const setDisplay = (patch: Partial<WidgetDisplay>) => set({ ...w, display: { ...d, ...patch } });
  const slots = colorSlots(w);
  const format = axisFormat(w);
  const hex = (value: string | undefined) => (value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#888888");
  const colorAt = (i: number) => hex(d.colors[i] || theme?.palette[i % 8]);
  const setColor = (i: number, value: string) => {
    const colors = Array.from({ length: Math.max(d.colors.length, i + 1) }, (_, j) => (j === i ? value : colorAt(j)));
    setDisplay({ colors });
  };
  return (
    <>
      {w.type !== "kpi" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={e.legend}>
            <Choice label={e.legend} value={d.legend} options={(["auto", "top", "bottom", "none"] as const).map((value) => ({ value, label: e.legendOptions[value] }))} onChange={(legend) => setDisplay({ legend })} />
          </Field>
          <Field label={e.numbers}>
            <Choice label={e.numbers} value={d.numbers} options={(["auto", "full", "compact"] as const).map((value) => ({ value, label: e.numberOptions[value] }))} onChange={(numbers) => setDisplay({ numbers })} />
          </Field>
        </div>
      )}
      {w.type === "kpi" && (
        <Field label={e.numbers}>
          <Choice label={e.numbers} value={d.numbers} options={(["auto", "full", "compact"] as const).map((value) => ({ value, label: e.numberOptions[value] }))} onChange={(numbers) => setDisplay({ numbers })} />
        </Field>
      )}
      <Field label={e.decimals}>
        <Choice
          label={e.decimals}
          value={d.decimals == null ? NONE : String(d.decimals)}
          options={[{ value: NONE, label: e.decimalsDefault }, ...[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))]}
          onChange={(v) => setDisplay({ decimals: v === NONE ? null : Number(v) })}
        />
      </Field>
      {slots > 0 && (
        <Field label={e.colors}>
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: slots }, (_, i) => (
              <input
                key={i}
                type="color"
                aria-label={e.colorOf(i + 1)}
                value={colorAt(i)}
                onChange={(ev) => setColor(i, ev.target.value)}
                className="size-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
              />
            ))}
            {d.colors.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setDisplay({ colors: [] })}>
                {e.resetColors}
              </Button>
            )}
          </div>
        </Field>
      )}
      {format && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={e.axisMin}>
              <ValueField label={e.axisMin} value={d.axisMin} format={format} onChange={(axisMin) => setDisplay({ axisMin })} />
            </Field>
            <Field label={e.axisMax}>
              <ValueField label={e.axisMax} value={d.axisMax} format={format} onChange={(axisMax) => setDisplay({ axisMax })} />
            </Field>
          </div>
          <Toggle label={e.grid} checked={d.grid} onChange={(grid) => setDisplay({ grid })} />
        </>
      )}
    </>
  );
}

// ---- prévia ------------------------------------------------------------------------------------

function Preview({ result, loading, widget }: { result: PreviewResult | null; loading: boolean; widget: PanelWidget }) {
  if (!result) return <Skeleton className="h-72 w-full rounded-md" />;
  if (!result.ok) {
    return (
      <div className="grid gap-2 rounded-md border border-dashed border-border p-4 text-sm">
        <p className="font-medium">{e.previewInvalid}</p>
        <ul className="list-disc pl-5 text-muted-foreground">
          {(result.issues.length ? result.issues : [result.error]).map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className={loading ? "opacity-60 transition-opacity" : undefined} aria-busy={loading}>
      {result.data.kind === "kpi" ? (
        <PanelKpi view={result.data.view} />
      ) : (
        <ChartFrame spec={result.data.spec} title={result.data.title} subtitle={result.data.subtitle || undefined} help={result.data.help} scope={scopeNote(widget)} />
      )}
    </div>
  );
}

// ---- editor ------------------------------------------------------------------------------------

export function WidgetEditor({
  open,
  onOpenChange,
  dashboardId,
  panelId,
  params,
  initial,
  data,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  panelId: string;
  params: Record<string, string>;
  /** null: gráfico novo. */
  initial: PanelWidget | null;
  data: PanelEditorData;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<PanelWidget>(() => initial ?? defaultWidget("line", newWidgetId()));
  // A prévia guarda para qual configuração foi montada: se a configuração mudou, ela está carregando.
  const [preview, setPreview] = useState<{ for: PanelWidget; result: PreviewResult } | null>(null);
  const loading = preview?.for !== draft;
  const [saving, setSaving] = useState(false);
  const valid = useMemo(() => PANEL_WIDGET.safeParse(draft).success, [draft]);

  // Prévia montada no servidor, um instante depois da última mudança.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      const result = await previewWidget({ dashboardId, params, widget: draft });
      if (!cancelled) setPreview({ for: draft, result });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft, dashboardId, params]);

  const save = async () => {
    setSaving(true);
    const result = await saveWidget({ panelId, widget: draft });
    setSaving(false);
    if (!result.ok) toast.error(result.error);
    else onSaved();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Largura fixa aqui: a classe padrão do painel lateral (max-w-side-panel) é estreita demais para o formulário e a prévia lado a lado. */}
      <SheetContent side="right" className="overflow-y-auto" style={{ width: "100%", maxWidth: "min(1100px, 100vw)" }}>
        <SheetHeader>
          <SheetTitle>{initial ? e.editTitle : e.newTitle}</SheetTitle>
          <SheetDescription>{e.description}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 px-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid content-start gap-5">
            <Field label={e.type}>
              <Choice label={e.type} value={draft.type} options={WIDGET_TYPES.map((type) => ({ value: type, label: msg.widgetType[type].label }))} onChange={(type) => setDraft(switchWidgetType(draft, type))} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={e.title}>
                <Input value={draft.title} maxLength={80} placeholder={widgetTitle({ ...draft, title: "" })} aria-label={e.title} onChange={(ev) => setDraft({ ...draft, title: ev.target.value })} />
              </Field>
              <Field label={e.subtitle}>
                <Input value={draft.subtitle} maxLength={160} aria-label={e.subtitle} onChange={(ev) => setDraft({ ...draft, subtitle: ev.target.value })} />
              </Field>
            </div>
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold">{e.sections.data}</h3>
              <TypeFields w={draft} set={setDraft} data={data} />
            </section>
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold">{e.sections.scope}</h3>
              <ScopeFields w={draft} set={setDraft} />
            </section>
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold">{e.sections.look}</h3>
              <LookFields w={draft} set={setDraft} />
            </section>
          </div>
          <div className="grid content-start gap-2 lg:sticky lg:top-0">
            <h3 className="text-sm font-semibold">
              {e.preview}
              {loading && <span className="ml-2 text-xs font-normal text-muted-foreground">{e.previewLoading}</span>}
            </h3>
            <Preview result={preview?.result ?? null} loading={loading} widget={draft} />
          </div>
        </div>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {e.cancel}
          </Button>
          <Button onClick={() => void save()} disabled={!valid || saving}>
            {saving ? e.saving : e.save}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
