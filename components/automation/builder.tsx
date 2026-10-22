"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- o construtor edita gatilhos e ações de formatos variados; o Zod valida no servidor */

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { describeAutomation, LEVEL_LABEL, METRIC_LABEL, metricValue, TYPE_INFO, WINDOW_LABEL } from "@/lib/automation/describe";
import { VARIABLES, type AutomationType } from "@/lib/automation/schema";
import { Banner } from "@/components/ds/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseDecimal } from "@/lib/custom-fields";
import { currencySymbol } from "@/lib/format";
import { LIST_SORT_LABEL, LIST_SORTS } from "@/lib/list-sort";
import { cn } from "@/lib/utils";
import { createAutomation, previewMetric, updateAutomation } from "@/server/actions/automation";
import type { AutomationEditor, AutomationOptions } from "@/server/data/automation";

type Obj = Record<string, any>;
const NONE = "__nenhum";


const RULE_KINDS = [
  ["card_created", "Um card for criado"],
  ["card_moved", "Um card for movido"],
  ["card_archived", "Um card for arquivado"],
  ["label_added", "Uma etiqueta for colocada"],
  ["member_added", "Alguém entrar num card"],
  ["due_completed", "O prazo for concluído"],
  ["checklist_completed", "Uma checklist ficar completa"],
  ["comment_added", "Alguém comentar"],
  ["field_changed", "Um campo mudar"],
] as const;

const CARD_ACTIONS = [
  ["move_card", "Mover o card"],
  ["copy_card", "Copiar o card"],
  ["archive_card", "Arquivar o card"],
  ["add_label", "Colocar etiqueta"],
  ["remove_label", "Tirar etiqueta"],
  ["add_member", "Colocar pessoa"],
  ["remove_member", "Tirar pessoa"],
  ["set_due", "Pôr prazo"],
  ["remove_due", "Tirar prazo"],
  ["complete_due", "Concluir o prazo"],
  ["add_checklist", "Adicionar checklist"],
  ["add_comment", "Comentar"],
  ["rename_card", "Renomear o card"],
  ["set_field", "Preencher um campo"],
] as const;

const BOARD_ACTIONS = [
  ["create_card", "Criar um card"],
  ["move_list_cards", "Mover todos os cards de uma lista"],
  ["archive_list_cards", "Arquivar todos os cards de uma lista"],
  ["sort_list", "Ordenar os cards de uma lista"],
] as const;

const SORT_OPTIONS = LIST_SORTS.map((by) => [by, LIST_SORT_LABEL[by]] as const);

const FILTERS = [
  ["in_list", "O card está na lista"],
  ["has_label", "O card tem a etiqueta"],
  ["not_label", "O card não tem a etiqueta"],
  ["has_member", "A pessoa está no card"],
  ["name_contains", "O nome do card tem"],
] as const;

const usesBoardActions = (t: AutomationType) => t === "scheduled" || t === "board_button";
const usesFilters = (t: AutomationType) => t === "rule" || t === "due_date" || t === "card_button";

export function defaultTrigger(type: AutomationType, o: AutomationOptions): Obj {
  switch (type) {
    case "rule":
      return { kind: "card_moved", toListId: o.lists.at(-1)?.id ?? null, fromListId: null };
    case "metric":
      return {
        kind: "metric",
        dashboardId: o.dashboards[0]?.id ?? "",
        level: "campaign",
        status: "active",
        provider: "any",
        nameContains: "",
        conditions: [{ metric: "roas", op: "lt", value: 1.5 }],
        window: "7d",
        everyMinutes: 60,
        createInListId: null,
      };
    case "scheduled":
      return { kind: "schedule", every: "week", time: "09:00", weekday: 1, monthDay: 1 };
    case "due_date":
      return { kind: "due", when: "before", amount: 1, unit: "days" };
    default:
      return { kind: "button", label: "" };
  }
}

function ruleTrigger(kind: string, o: AutomationOptions): Obj {
  switch (kind) {
    case "card_created":
      return { kind, listId: null };
    case "card_moved":
      return { kind, toListId: o.lists.at(-1)?.id ?? null, fromListId: null };
    case "label_added":
      return { kind, labelId: null };
    case "member_added":
      return { kind, userId: null };
    case "comment_added":
      return { kind, contains: "" };
    case "field_changed":
      return { kind, fieldId: o.fields[0]?.id ?? "", value: null };
    default:
      return { kind };
  }
}

function newAction(kind: string, o: AutomationOptions): Obj {
  const list = o.lists[0]?.id ?? "";
  const label = o.labels[0]?.id ?? "";
  const person = o.people[0]?.id ?? "";
  switch (kind) {
    case "move_card":
      return { kind, listId: o.lists.at(-1)?.id ?? list, position: "bottom" };
    case "copy_card":
      return { kind, listId: list };
    case "add_label":
    case "remove_label":
      return { kind, labelId: label };
    case "add_member":
    case "remove_member":
      return { kind, userId: person };
    case "set_due":
      return { kind, days: 1 };
    case "add_checklist":
      return { kind, name: "Checklist", items: [] };
    case "add_comment":
      return { kind, text: "" };
    case "rename_card":
      return { kind, name: "{cardname}" };
    case "set_field":
      return { kind, fieldId: o.fields[0]?.id ?? "", value: null };
    case "create_card":
      return { kind, listId: list, name: "" };
    case "move_list_cards":
      return { kind, fromListId: list, toListId: o.lists.at(-1)?.id ?? list };
    case "archive_list_cards":
      return { kind, listId: o.lists.at(-1)?.id ?? list };
    case "sort_list":
      return { kind, listId: list, by: "prazo" };
    default:
      return { kind };
  }
}

function newFilter(kind: string, o: AutomationOptions): Obj {
  switch (kind) {
    case "in_list":
      return { kind, listId: o.lists[0]?.id ?? "" };
    case "has_label":
    case "not_label":
      return { kind, labelId: o.labels[0]?.id ?? "" };
    case "has_member":
      return { kind, userId: o.people[0]?.id ?? "" };
    default:
      return { kind, text: "" };
  }
}

// ---- campos pequenos ----------------------------------------------------------------------------------

function Pick({
  label,
  value,
  onChange,
  options,
  none,
  className,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: any) => void;
  options: readonly (readonly [string | number, string])[];
  none?: string;
  className?: string;
}) {
  const id = useId();
  const current = value == null || value === "" ? (none ? NONE : "") : String(value);
  return (
    <div className={cn("grid min-w-40 gap-1", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select
        value={current}
        onValueChange={(v) => {
          if (v === NONE) return onChange(null);
          const opt = options.find(([k]) => String(k) === v);
          onChange(opt ? opt[0] : v);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Escolha…" />
        </SelectTrigger>
        <SelectContent>
          {none && <SelectItem value={NONE}>{none}</SelectItem>}
          {options.map(([k, t]) => (
            <SelectItem key={String(k)} value={String(k)}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, multiline, variables }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; variables?: boolean }) {
  const id = useId();
  return (
    <div className="grid min-w-48 flex-1 gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {multiline ? <Textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /> : <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
      {variables && (
        <div className="flex flex-wrap gap-1" aria-label="Inserir variável">
          {VARIABLES.map(([v, hint]) => (
            <button
              key={v}
              type="button"
              title={hint}
              onClick={() => onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${v}`)}
              className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NumberField({ label, value, onChange, min = 0, max = 1e9, decimals = false, suffix }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; decimals?: boolean; suffix?: string }) {
  const id = useId();
  const [text, setText] = useState(String(value).replace(".", ","));
  return (
    <div className="grid w-32 gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          inputMode={decimals ? "decimal" : "numeric"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(/\./g, "").replace(",", "."));
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, decimals ? n : Math.round(n))));
          }}
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`passo-${step}`} className="grid gap-3 rounded-lg border bg-card p-4 sm:p-5">
      <div>
        <h2 id={`passo-${step}`} className="flex items-center gap-2 text-base font-semibold">
          <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-primary-subtle text-xs text-primary">
            {step}
          </span>
          {title}
        </h2>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function RowControls({ index, total, onMove, onRemove, label }: { index: number; total: number; onMove: (to: number) => void; onRemove: () => void; label: string }) {
  return (
    <div className="ml-auto flex items-end gap-1 self-end">
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Subir ${label}`} disabled={index === 0} onClick={() => onMove(index - 1)}>
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Descer ${label}`} disabled={index === total - 1} onClick={() => onMove(index + 1)}>
        <ArrowDown aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remover ${label}`} onClick={onRemove}>
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}

// ---- o construtor --------------------------------------------------------------------------------------

export function AutomationBuilder({ type, editor }: { type: AutomationType; editor: AutomationEditor }) {
  const router = useRouter();
  const o = editor.options;
  const existing = editor.automation;
  const [name, setName] = useState(existing?.name ?? "");
  const [trigger, setTrigger] = useState<Obj>((existing?.trigger as Obj) ?? defaultTrigger(type, o));
  const [filters, setFilters] = useState<Obj[]>((existing?.filters as Obj[]) ?? []);
  const [actions, setActions] = useState<Obj[]>((existing?.actions as Obj[]) ?? [newAction(usesBoardActions(type) ? "create_card" : type === "metric" ? "add_comment" : "add_comment", o)]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewMetric>> | null>(null);
  const [previewing, startPreview] = useTransition();
  const metricCurrency = o.dashboards.find((d) => d.id === trigger.dashboardId)?.currency ?? "BRL";

  const lists = o.lists.map((l) => [l.id, l.name] as const);
  const labels = o.labels.map((l) => [l.id, l.name || `Etiqueta ${l.color ?? "sem cor"}`] as const);
  const people = o.people.map((p) => [p.id, p.name] as const);
  const setT = (patch: Obj) => setTrigger((t) => ({ ...t, ...patch }));
  const move = <T,>(arr: T[], from: number, to: number) => {
    const next = [...arr];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    return next;
  };
  const sentence = (() => {
    try {
      return describeAutomation({ type, trigger, filters: filters as never, actions: actions as never }, editor.names);
    } catch {
      return "";
    }
  })();

  const save = () =>
    startTransition(async () => {
      setError(null);
      const input = { type, name: name.trim(), trigger, filters, actions } as never;
      const result = existing ? await updateAutomation(existing.id, input) : await createAutomation(editor.board.id, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(existing ? "Automação salva" : "Automação criada");
      router.push(`/b/${editor.board.id}/automation?aba=${TYPE_INFO[type].tab}`);
      router.refresh();
    });

  const actionKinds = usesBoardActions(type) ? BOARD_ACTIONS : CARD_ACTIONS;

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Section step={1} title="Nome">
        <div className="grid max-w-lg gap-1">
          <Label htmlFor="auto-name">Nome da automação</Label>
          <Input id="auto-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "metric" ? "Ex.: ROAS baixo no Meta" : "Ex.: Concluir ao chegar em Feito"} maxLength={200} />
        </div>
      </Section>

      <Section step={2} title={type === "card_button" || type === "board_button" ? "O botão" : "Quando"} hint={TYPE_INFO[type].hint}>
        <div className="flex flex-wrap items-end gap-3">
          {type === "rule" && (
            <>
              <Pick label="Quando" value={trigger.kind} onChange={(k) => setTrigger(ruleTrigger(k, o))} options={RULE_KINDS} className="min-w-56" />
              {trigger.kind === "card_created" && <Pick label="Na lista" value={trigger.listId} none="Qualquer lista" onChange={(v) => setT({ listId: v })} options={lists} />}
              {trigger.kind === "card_moved" && (
                <>
                  <Pick label="De" value={trigger.fromListId} none="Qualquer lista" onChange={(v) => setT({ fromListId: v })} options={lists} />
                  <Pick label="Para" value={trigger.toListId} none="Qualquer lista" onChange={(v) => setT({ toListId: v })} options={lists} />
                </>
              )}
              {trigger.kind === "label_added" && <Pick label="Etiqueta" value={trigger.labelId} none="Qualquer etiqueta" onChange={(v) => setT({ labelId: v })} options={labels} />}
              {trigger.kind === "member_added" && <Pick label="Pessoa" value={trigger.userId} none="Qualquer pessoa" onChange={(v) => setT({ userId: v })} options={people} />}
              {trigger.kind === "comment_added" && <TextField label="Com o texto (opcional)" value={trigger.contains ?? ""} onChange={(v) => setT({ contains: v })} placeholder="Ex.: aprovado" />}
              {trigger.kind === "field_changed" && <FieldPick fieldId={trigger.fieldId} value={trigger.value} fields={o.fields} anyValue onChange={(patch) => setT(patch)} />}
            </>
          )}

          {type === "scheduled" && (
            <>
              <Pick
                label="Repetir"
                value={trigger.every}
                onChange={(v) => setT({ every: v })}
                options={[
                  ["day", "Todo dia"],
                  ["weekday", "De segunda a sexta"],
                  ["week", "Toda semana"],
                  ["month", "Todo mês"],
                ]}
              />
              {trigger.every === "week" && (
                <Pick
                  label="Dia da semana"
                  value={trigger.weekday}
                  onChange={(v) => setT({ weekday: Number(v) })}
                  options={["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"].map((d, i) => [i, d] as const)}
                />
              )}
              {trigger.every === "month" && <NumberField label="Dia do mês" value={trigger.monthDay} min={1} max={31} onChange={(v) => setT({ monthDay: v })} />}
              <div className="grid w-32 gap-1">
                <Label htmlFor="auto-time" className="text-xs text-muted-foreground">
                  Hora
                </Label>
                <Input id="auto-time" type="time" value={trigger.time} onChange={(e) => setT({ time: e.target.value })} />
              </div>
            </>
          )}

          {type === "due_date" && (
            <>
              <NumberField label="Quanto" value={trigger.amount} max={365} onChange={(v) => setT({ amount: v })} />
              <Pick
                label="Unidade"
                value={trigger.unit}
                onChange={(v) => setT({ unit: v })}
                options={[
                  ["hours", "horas"],
                  ["days", "dias"],
                ]}
              />
              <Pick
                label="Em relação ao prazo"
                value={trigger.when}
                onChange={(v) => setT({ when: v })}
                options={[
                  ["before", "antes do prazo"],
                  ["after", "depois do prazo"],
                ]}
              />
            </>
          )}

          {(type === "card_button" || type === "board_button") && <TextField label="Texto do botão" value={trigger.label ?? ""} onChange={(v) => setT({ label: v })} placeholder="Ex.: Pedir revisão" />}

          {type === "metric" && <MetricTriggerFields trigger={trigger} setT={setT} o={o} lists={lists} />}
        </div>

        {type === "metric" && (
          <div className="grid gap-2">
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={previewing}
                onClick={() => startPreview(async () => setPreview(await previewMetric(editor.board.id, trigger as never)))}
              >
                Ver quem bate as condições agora
              </Button>
            </div>
            {preview && !preview.ok && <p className="text-sm text-danger">{preview.error}</p>}
            {preview && preview.ok && (
              <div className="grid gap-1">
                <p className="text-sm" role="status">
                  {preview.matched} de {preview.total} {preview.total === 1 ? LEVEL_LABEL[trigger.level as "campaign"] : `${LEVEL_LABEL[trigger.level as "campaign"]}s`} batem as condições agora.
                </p>
                {preview.rows.length > 0 && (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead className="text-right">Gasto</TableHead>
                          <TableHead className="text-right">Faturamento</TableHead>
                          <TableHead className="text-right">ROAS</TableHead>
                          <TableHead className="text-right">CPA</TableHead>
                          <TableHead className="text-right">Vendas</TableHead>
                          <TableHead>Bate?</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="max-w-64 truncate">{r.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{metricValue("spend", r.values.spend ?? 0, metricCurrency)}</TableCell>
                            <TableCell className="text-right tabular-nums">{metricValue("revenue", r.values.revenue ?? 0, metricCurrency)}</TableCell>
                            <TableCell className="text-right tabular-nums">{metricValue("roas", r.values.roas ?? 0)}</TableCell>
                            <TableCell className="text-right tabular-nums">{metricValue("cpa", r.values.cpa ?? 0, metricCurrency)}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.values.sales}</TableCell>
                            <TableCell>{r.matched ? <span className="font-medium text-success">Sim</span> : <span className="text-muted-foreground">Não</span>}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      {usesFilters(type) && (
        <Section step={3} title="Só se (opcional)" hint="Filtros: a automação só age nos cards que passam em todos.">
          {filters.map((f, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3 rounded-md bg-muted/60 p-3">
              <Pick label="Condição" value={f.kind} onChange={(k) => setFilters((all) => all.map((x, j) => (j === i ? newFilter(k, o) : x)))} options={FILTERS} className="min-w-56" />
              {f.kind === "in_list" && <Pick label="Lista" value={f.listId} onChange={(v) => setFilters((all) => all.map((x, j) => (j === i ? { ...x, listId: v } : x)))} options={lists} />}
              {(f.kind === "has_label" || f.kind === "not_label") && <Pick label="Etiqueta" value={f.labelId} onChange={(v) => setFilters((all) => all.map((x, j) => (j === i ? { ...x, labelId: v } : x)))} options={labels} />}
              {f.kind === "has_member" && <Pick label="Pessoa" value={f.userId} onChange={(v) => setFilters((all) => all.map((x, j) => (j === i ? { ...x, userId: v } : x)))} options={people} />}
              {f.kind === "name_contains" && <TextField label="Texto" value={f.text} onChange={(v) => setFilters((all) => all.map((x, j) => (j === i ? { ...x, text: v } : x)))} />}
              <RowControls index={i} total={filters.length} label={`a condição ${i + 1}`} onMove={(to) => setFilters((all) => move(all, i, to))} onRemove={() => setFilters((all) => all.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div>
            <Button type="button" variant="secondary" size="sm" disabled={filters.length >= 10} onClick={() => setFilters((all) => [...all, newFilter("in_list", o)])}>
              <Plus aria-hidden="true" />
              Adicionar condição
            </Button>
          </div>
        </Section>
      )}

      <Section step={usesFilters(type) ? 4 : 3} title="Então" hint={type === "metric" ? "Age em cada card ligado ao que bater as condições. Use {campaign}, {roas} e {spend} nos textos." : "As ações rodam na ordem, até 20."}>
        {actions.map((a, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3 rounded-md bg-muted/60 p-3">
            <Pick label={`Ação ${i + 1}`} value={a.kind} onChange={(k) => setActions((all) => all.map((x, j) => (j === i ? newAction(k, o) : x)))} options={actionKinds} className="min-w-56" />
            <ActionFields a={a} set={(patch) => setActions((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)))} lists={lists} labels={labels} people={people} fields={o.fields} />
            <RowControls index={i} total={actions.length} label={`a ação ${i + 1}`} onMove={(to) => setActions((all) => move(all, i, to))} onRemove={() => setActions((all) => all.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div>
          <Button type="button" variant="secondary" size="sm" disabled={actions.length >= 20} onClick={() => setActions((all) => [...all, newAction(usesBoardActions(type) ? "create_card" : "add_label", o)])}>
            <Plus aria-hidden="true" />
            Adicionar ação
          </Button>
          {actions.length >= 20 && <span className="ml-2 text-xs text-muted-foreground">Chegou no máximo de 20 ações.</span>}
        </div>
      </Section>

      <section aria-labelledby="previa" className="grid gap-1 rounded-lg border border-dashed p-4">
        <h2 id="previa" className="text-sm font-semibold">
          Prévia
        </h2>
        <p className="text-sm">{sentence}</p>
      </section>

      {error && (
        <Banner variant="error" title="Não deu para salvar" live>
          {error}
        </Banner>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          {existing ? "Salvar automação" : "Criar automação"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/b/${editor.board.id}/automation?aba=${TYPE_INFO[type].tab}`}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}

function MetricTriggerFields({ trigger, setT, o, lists }: { trigger: Obj; setT: (p: Obj) => void; o: AutomationOptions; lists: readonly (readonly [string, string])[] }) {
  const conditions: Obj[] = trigger.conditions ?? [];
  const setCond = (i: number, patch: Obj) => setT({ conditions: conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <div className="grid w-full gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Pick label="Dashboard" value={trigger.dashboardId} onChange={(v) => setT({ dashboardId: v })} options={o.dashboards.map((d) => [d.id, d.name] as const)} />
        <Pick label="Olhar cada" value={trigger.level} onChange={(v) => setT({ level: v })} options={Object.entries(LEVEL_LABEL)} />
        <Pick
          label="Situação"
          value={trigger.status}
          onChange={(v) => setT({ status: v })}
          options={[
            ["active", "ativos"],
            ["paused", "pausados"],
            ["any", "ativos ou pausados"],
          ]}
        />
        <Pick
          label="Plataforma"
          value={trigger.provider}
          onChange={(v) => setT({ provider: v })}
          options={[
            ["any", "Meta e Google"],
            ["meta", "Só Meta"],
            ["google", "Só Google"],
          ]}
        />
        <TextField label="Com no nome (opcional)" value={trigger.nameContains ?? ""} onChange={(v) => setT({ nameContains: v })} placeholder="Ex.: [Vendas]" />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Condições (todas precisam bater)</legend>
        {conditions.map((c, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <Pick label="Métrica" value={c.metric} onChange={(v) => setCond(i, { metric: v })} options={Object.entries(METRIC_LABEL)} className="min-w-36" />
            <Pick
              label="Operador"
              value={c.op}
              onChange={(v) => setCond(i, { op: v })}
              options={[
                ["lt", "abaixo de"],
                ["gt", "acima de"],
              ]}
              className="min-w-36"
            />
            <NumberField
              label={c.metric === "roas" ? "Valor" : c.metric === "sales" ? "Quantidade" : `Valor (${currencySymbol(o.dashboards.find((d) => d.id === trigger.dashboardId)?.currency ?? "BRL")})`}
              value={c.value}
              decimals
              onChange={(v) => setCond(i, { value: v })}
            />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remover a condição ${i + 1}`} disabled={conditions.length === 1} onClick={() => setT({ conditions: conditions.filter((_, j) => j !== i) })}>
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="secondary" size="sm" disabled={conditions.length >= 5} onClick={() => setT({ conditions: [...conditions, { metric: "spend", op: "gt", value: 100 }] })}>
            <Plus aria-hidden="true" />
            Adicionar condição
          </Button>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <Pick label="Período do cálculo" value={trigger.window} onChange={(v) => setT({ window: v })} options={Object.entries(WINDOW_LABEL)} />
        <Pick
          label="Checar a cada"
          value={trigger.everyMinutes}
          onChange={(v) => setT({ everyMinutes: Number(v) })}
          options={[
            [15, "15 minutos"],
            [30, "30 minutos"],
            [60, "1 hora"],
            [360, "6 horas"],
            [1440, "1 dia"],
          ]}
        />
        <Pick label="Sem card ligado" value={trigger.createInListId} none="Não fazer nada" onChange={(v) => setT({ createInListId: v })} options={lists.map(([id, n]) => [id, `Criar card em ${n}`] as const)} className="min-w-56" />
      </div>
      <p className="text-xs text-muted-foreground">Cada campanha, conjunto ou anúncio aciona a regra no máximo uma vez por período de cálculo, mesmo que a checagem rode várias vezes.</p>
    </div>
  );
}

function ItemsField({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const id = useId();
  const [text, setText] = useState(items.join("\n"));
  return (
    <div className="grid min-w-48 flex-1 gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        Itens (um por linha)
      </Label>
      <Textarea
        id={id}
        rows={3}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean)
              .slice(0, 50),
          );
        }}
      />
    </div>
  );
}

type FieldOption = AutomationOptions["fields"][number];

/**
 * O campo e o valor (gatilho "um campo mudar" e ação "preencher um campo"). O valor
 * segue o tipo do campo: texto, número, data, caixa ou uma opção da lista.
 */
function FieldPick({ fieldId, value, fields, anyValue, onChange }: { fieldId: string; value: any; fields: FieldOption[]; anyValue?: boolean; onChange: (patch: Obj) => void }) {
  const field = fields.find((f) => f.id === fieldId);
  const id = useId();
  if (fields.length === 0) {
    return <p className="max-w-sm text-sm text-muted-foreground">Este quadro ainda não tem campos. Crie no menu do quadro → Campos personalizados.</p>;
  }
  const empty = anyValue ? "Qualquer valor" : "Limpar o campo";
  return (
    <>
      <Pick label="Campo" value={fieldId} onChange={(v) => onChange({ fieldId: v, value: null })} options={fields.map((f) => [f.id, f.name] as const)} />
      {field?.type === "list" && (
        <Pick label={anyValue ? "Ficar com" : "Valor"} value={value} none={empty} onChange={(v) => onChange({ value: v })} options={field.options.map((op) => [op.id, op.label] as const)} />
      )}
      {field?.type === "checkbox" && (
        <Pick
          label={anyValue ? "Ficar" : "Valor"}
          value={value === true ? "sim" : null}
          none={anyValue ? "Marcada ou desmarcada" : "Desmarcar"}
          onChange={(v) => onChange({ value: v === "sim" ? true : null })}
          options={[["sim", anyValue ? "Marcada" : "Marcar"]]}
        />
      )}
      {field?.type === "date" && (
        <div className="grid w-44 gap-1">
          <Label htmlFor={id} className="text-xs text-muted-foreground">
            {anyValue ? "Ficar com a data (opcional)" : "Data (vazio limpa)"}
          </Label>
          <Input id={id} type="date" value={typeof value === "string" ? value : ""} onChange={(e) => onChange({ value: e.target.value || null })} />
        </div>
      )}
      {field?.type === "number" && (
        <div className="grid w-44 gap-1">
          <Label htmlFor={id} className="text-xs text-muted-foreground">
            {anyValue ? "Ficar com o valor (opcional)" : "Número (vazio limpa)"}
          </Label>
          <Input
            id={id}
            inputMode="decimal"
            defaultValue={typeof value === "number" ? value.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 6 }) : ""}
            onChange={(e) => onChange({ value: e.target.value.trim() ? (parseDecimal(e.target.value) ?? e.target.value) : null })}
            placeholder="Ex.: 1.500,00"
          />
        </div>
      )}
      {field?.type === "text" &&
        (anyValue ? (
          <TextField label="Ficar com o texto (opcional)" value={typeof value === "string" ? value : ""} onChange={(v) => onChange({ value: v.trim() ? v : null })} />
        ) : (
          <TextField label="Texto (vazio limpa)" value={typeof value === "string" ? value : ""} variables onChange={(v) => onChange({ value: v.trim() ? v : null })} />
        ))}
    </>
  );
}

function ActionFields({
  a,
  set,
  lists,
  labels,
  people,
  fields,
}: {
  a: Obj;
  set: (patch: Obj) => void;
  lists: readonly (readonly [string, string])[];
  labels: readonly (readonly [string, string])[];
  people: readonly (readonly [string, string])[];
  fields: FieldOption[];
}) {
  switch (a.kind) {
    case "set_field":
      return <FieldPick fieldId={a.fieldId} value={a.value} fields={fields} onChange={set} />;
    case "move_card":
      return (
        <>
          <Pick label="Para a lista" value={a.listId} onChange={(v) => set({ listId: v })} options={lists} />
          <Pick
            label="Posição"
            value={a.position}
            onChange={(v) => set({ position: v })}
            options={[
              ["top", "no topo"],
              ["bottom", "no fim"],
            ]}
          />
        </>
      );
    case "copy_card":
    case "archive_list_cards":
      return <Pick label="Lista" value={a.listId} onChange={(v) => set({ listId: v })} options={lists} />;
    case "sort_list":
      return (
        <>
          <Pick label="Lista" value={a.listId} onChange={(v) => set({ listId: v })} options={lists} />
          <Pick label="Ordem" value={a.by} onChange={(v) => set({ by: v })} options={SORT_OPTIONS} />
        </>
      );
    case "add_label":
    case "remove_label":
      return <Pick label="Etiqueta" value={a.labelId} onChange={(v) => set({ labelId: v })} options={labels} />;
    case "add_member":
    case "remove_member":
      return <Pick label="Pessoa" value={a.userId} onChange={(v) => set({ userId: v })} options={people} />;
    case "set_due":
      return <NumberField label="Daqui a" value={a.days} max={365} suffix="dias (às 18h)" onChange={(v) => set({ days: v })} />;
    case "add_checklist":
      return (
        <>
          <TextField label="Nome da checklist" value={a.name} onChange={(v) => set({ name: v })} />
          <ItemsField items={a.items ?? []} onChange={(items) => set({ items })} />
        </>
      );
    case "add_comment":
      return <TextField label="Comentário" value={a.text} multiline variables onChange={(v) => set({ text: v })} placeholder="Ex.: Card concluído em {date} por {username}." />;
    case "rename_card":
      return <TextField label="Novo nome" value={a.name} variables onChange={(v) => set({ name: v })} />;
    case "create_card":
      return (
        <>
          <Pick label="Na lista" value={a.listId} onChange={(v) => set({ listId: v })} options={lists} />
          <TextField label="Nome do card" value={a.name} variables onChange={(v) => set({ name: v })} placeholder="Ex.: Revisão semanal ({date})" />
        </>
      );
    case "move_list_cards":
      return (
        <>
          <Pick label="De" value={a.fromListId} onChange={(v) => set({ fromListId: v })} options={lists} />
          <Pick label="Para" value={a.toListId} onChange={(v) => set({ toListId: v })} options={lists} />
        </>
      );
    default:
      return null;
  }
}
