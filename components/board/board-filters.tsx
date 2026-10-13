"use client";

import { Filter, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { LabelChip } from "@/components/ds/label-chip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { CardFront, LabelView, Person } from "@/server/data/boards";

// Filtro do quadro (S10, F06): palavra, membros, prazo, etiquetas e atividade,
// no modo "qualquer" ou "todas". Fica na URL e filtra os cards já carregados.

export type BoardFilter = {
  q: string;
  members: string[]; // ids, "nenhum" ou "eu"
  labels: string[]; // ids ou "nenhuma"
  due: string[]; // sem, atrasado, dia, semana, mes, concluido, aberto
  activity: string; // "", 1, 2, 4, parado
  mode: "any" | "all";
};

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function readFilter(params: URLSearchParams): BoardFilter {
  return {
    q: params.get("q") ?? "",
    members: list(params.get("membros")),
    labels: list(params.get("etiquetas")),
    due: list(params.get("prazo")),
    activity: params.get("atividade") ?? "",
    mode: params.get("modo") === "todas" ? "all" : "any",
  };
}

export function filterCount(f: BoardFilter) {
  return (f.q ? 1 : 0) + f.members.length + f.labels.length + f.due.length + (f.activity ? 1 : 0);
}

const DAY = 86_400_000;

export function matches(card: CardFront, f: BoardFilter, me: string, now: number): boolean {
  const tests: boolean[] = [];
  if (f.q) {
    const fold = (s: string) =>
      s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
    tests.push(fold(card.name).includes(fold(f.q)) || `#${card.number}` === f.q.trim());
  }
  for (const m of f.members) {
    if (m === "nenhum") tests.push(card.memberIds.length === 0);
    else tests.push(card.memberIds.includes(m === "eu" ? me : m));
  }
  for (const l of f.labels) tests.push(l === "nenhuma" ? card.labelIds.length === 0 : card.labelIds.includes(l));
  for (const d of f.due) {
    const due = card.dueAt ? new Date(card.dueAt).getTime() : null;
    if (d === "sem") tests.push(due == null);
    else if (d === "atrasado") tests.push(due != null && !card.dueComplete && due < now);
    else if (d === "dia") tests.push(due != null && !card.dueComplete && due >= now && due < now + DAY);
    else if (d === "semana") tests.push(due != null && !card.dueComplete && due >= now && due < now + 7 * DAY);
    else if (d === "mes") tests.push(due != null && !card.dueComplete && due >= now && due < now + 30 * DAY);
    else if (d === "concluido") tests.push(due != null && card.dueComplete);
    else if (d === "aberto") tests.push(due != null && !card.dueComplete);
  }
  if (f.activity) {
    const last = new Date(card.lastActivityAt).getTime();
    if (f.activity === "parado") tests.push(last < now - 28 * DAY);
    else tests.push(last >= now - Number(f.activity) * 7 * DAY);
  }
  if (tests.length === 0) return true;
  return f.mode === "all" ? tests.every(Boolean) : tests.some(Boolean);
}

export function BoardFilterButton({
  labels,
  members,
  open,
  onOpenChange,
}: {
  labels: LabelView[];
  members: Person[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = readFilter(new URLSearchParams(params.toString()));
  const count = filterCount(filter);
  const [q, setQ] = useState(filter.q);

  function update(next: Partial<BoardFilter>) {
    const merged = { ...filter, ...next };
    const query = new URLSearchParams(params.toString());
    const set = (k: string, v: string) => (v ? query.set(k, v) : query.delete(k));
    set("q", merged.q);
    set("membros", merged.members.join(","));
    set("etiquetas", merged.labels.join(","));
    set("prazo", merged.due.join(","));
    set("atividade", merged.activity);
    set("modo", merged.mode === "all" ? "todas" : "");
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  }
  const toggle = (key: "members" | "labels" | "due", value: string, on: boolean) =>
    update({ [key]: on ? [...filter[key], value] : filter[key].filter((x) => x !== value) } as Partial<BoardFilter>);

  const check = (key: "members" | "labels" | "due", value: string, label: React.ReactNode) => (
    <Label key={value} className="flex h-8 items-center gap-2 rounded-md px-1 font-normal hover:bg-accent">
      <Checkbox checked={filter[key].includes(value)} onCheckedChange={(v) => toggle(key, value, !!v)} />
      {label}
    </Label>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setQ(filter.q);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-white hover:bg-white/15 hover:text-white" aria-keyshortcuts="F">
          <Filter aria-hidden="true" />
          Filtros
          {count > 0 && <span className="rounded-full bg-white/25 px-1.5 text-xs tabular">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[80dvh] w-80 overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Filtrar cards</p>
          {count > 0 && (
            <Button variant="ghost" size="sm" onClick={() => update({ q: "", members: [], labels: [], due: [], activity: "", mode: "any" })}>
              <X aria-hidden="true" />
              Limpar
            </Button>
          )}
        </div>
        <div className="mt-3 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="filtro-q">Palavra</Label>
            <Input
              id="filtro-q"
              value={q}
              placeholder="Buscar nos títulos…"
              onChange={(e) => {
                setQ(e.target.value);
                update({ q: e.target.value });
              }}
            />
          </div>
          <fieldset className="grid">
            <legend className="mb-1 text-xs font-semibold text-muted-foreground">Membros</legend>
            {check("members", "nenhum", "Sem membros")}
            {check("members", "eu", "Cards atribuídos a mim")}
            {members.map((m) => check("members", m.id, m.name))}
          </fieldset>
          <fieldset className="grid">
            <legend className="mb-1 text-xs font-semibold text-muted-foreground">Prazo</legend>
            {check("due", "sem", "Sem prazo")}
            {check("due", "atrasado", "Atrasados")}
            {check("due", "dia", "Vencem em 1 dia")}
            {check("due", "semana", "Vencem em 1 semana")}
            {check("due", "mes", "Vencem em 1 mês")}
            {check("due", "concluido", "Concluídos")}
            {check("due", "aberto", "Não concluídos")}
          </fieldset>
          <fieldset className="grid">
            <legend className="mb-1 text-xs font-semibold text-muted-foreground">Etiquetas</legend>
            {check("labels", "nenhuma", "Sem etiquetas")}
            {labels
              .filter((l) => l.color)
              .map((l) => check("labels", l.id, <LabelChip color={l.color!} name={l.name} className="h-6" />))}
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-semibold text-muted-foreground">Atividade</legend>
            <RadioGroup value={filter.activity || "todas"} onValueChange={(v) => update({ activity: v === "todas" ? "" : v })} className="gap-1">
              {[
                ["todas", "Qualquer data"],
                ["1", "Na última semana"],
                ["2", "Nas últimas 2 semanas"],
                ["4", "Nas últimas 4 semanas"],
                ["parado", "Sem atividade há 4 semanas"],
              ].map(([v, text]) => (
                <Label key={v} className="flex h-8 items-center gap-2 px-1 font-normal">
                  <RadioGroupItem value={v} /> {text}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-semibold text-muted-foreground">Quando houver mais de um filtro</legend>
            <RadioGroup value={filter.mode} onValueChange={(v) => update({ mode: v as "any" | "all" })} className="gap-1">
              <Label className="flex h-8 items-center gap-2 px-1 font-normal">
                <RadioGroupItem value="any" /> Mostrar cards com qualquer um
              </Label>
              <Label className="flex h-8 items-center gap-2 px-1 font-normal">
                <RadioGroupItem value="all" /> Mostrar só cards com todos
              </Label>
            </RadioGroup>
          </fieldset>
        </div>
      </PopoverContent>
    </Popover>
  );
}
