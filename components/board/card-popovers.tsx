"use client";

import { format } from "date-fns";
import { Check, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ptBR } from "react-day-picker/locale";
import { toast } from "sonner";

import { LabelEditor } from "@/components/board/board-menu";
import { LABEL_HUES, LABEL_HUE_NAME, LabelChip } from "@/components/ds/label-chip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import { copyCard, createChecklist, linkCard, moveCard, searchLinkTargets, toggleCardLabel, toggleCardMember, updateCard } from "@/server/actions/kanban";
import type { CardDetail, LabelView, Person } from "@/server/data/boards";

export type ListOption = { boardId: string; boardName: string; listId: string; listName: string };

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error ?? "Não deu certo.");
      else after?.();
      router.refresh();
    });
  return { pending, run };
}

function PopoverHeader({ title }: { title: string }) {
  return <p className="mb-3 text-center text-sm font-semibold">{title}</p>;
}

export function PersonAvatar({ person, size = "size-7" }: { person: Person; size?: string }) {
  return (
    <Avatar className={size} title={person.name}>
      <AvatarFallback className="text-[11px] font-semibold" style={{ background: `var(--ds-label-${person.avatarColor}-bold)`, color: "var(--ds-label-text-bold)" }}>
        {initials(person.name)}
      </AvatarFallback>
    </Avatar>
  );
}

// ---- membros ------------------------------------------------------------------------------------

export function MembersPopover({ card, members, trigger }: { card: CardDetail["card"]; members: Person[]; trigger: React.ReactNode }) {
  const { run } = useRun();
  const [q, setQ] = useState("");
  const shown = members.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader title="Membros" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar membros…" aria-label="Buscar membros" />
        <ul className="mt-2 grid gap-0.5">
          {shown.map((m) => {
            const on = card.memberIds.includes(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => run(() => toggleCardMember(card.id, m.id, !on))}
                  className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PersonAvatar person={m} size="size-6" />
                  <span className="flex-1 truncate">{m.name}</span>
                  {on && <Check aria-hidden="true" className="size-4 text-primary" />}
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="py-3 text-center text-sm text-muted-foreground">Ninguém com esse nome.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// ---- etiquetas ------------------------------------------------------------------------------------

export function LabelsPopover({ card, boardId, labels, trigger }: { card: CardDetail["card"]; boardId: string; labels: LabelView[]; trigger: React.ReactNode }) {
  const { run } = useRun();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<LabelView | "new" | null>(null);
  const shown = labels.filter((l) => (l.name || l.color || "").toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover onOpenChange={(o) => !o && setEditing(null)}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start">
        {editing ? (
          <>
            <PopoverHeader title={editing === "new" ? "Criar etiqueta" : "Editar etiqueta"} />
            <LabelEditor boardId={boardId} label={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
          </>
        ) : (
          <>
            <PopoverHeader title="Etiquetas" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar etiquetas…" aria-label="Buscar etiquetas" />
            <ul className="mt-2 grid gap-1">
              {shown.map((l) => {
                const on = card.labelIds.includes(l.id);
                return (
                  <li key={l.id} className="flex items-center gap-2">
                    <Label className="flex flex-1 items-center gap-2 font-normal">
                      <Checkbox checked={on} onCheckedChange={(v) => run(() => toggleCardLabel(card.id, l.id, !!v))} />
                      {l.color ? <LabelChip color={l.color} name={l.name} className="h-8 flex-1 text-sm" /> : <span className="text-sm">{l.name}</span>}
                    </Label>
                    <Button variant="ghost" size="icon-sm" aria-label={`Editar a etiqueta ${l.name || l.color}`} onClick={() => setEditing(l)}>
                      <Pencil aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
              {shown.length === 0 && <li className="py-3 text-center text-sm text-muted-foreground">Nenhuma etiqueta com esse nome.</li>}
            </ul>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => setEditing("new")}>
              Criar uma etiqueta
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---- datas ------------------------------------------------------------------------------------------

const REMINDERS = [
  ["none", "Nenhum"],
  ["0", "Na hora"],
  ["5", "5 minutos antes"],
  ["10", "10 minutos antes"],
  ["15", "15 minutos antes"],
  ["60", "1 hora antes"],
  ["120", "2 horas antes"],
  ["1440", "1 dia antes"],
  ["2880", "2 dias antes"],
] as const;

export function DatesPopover({ card, trigger }: { card: CardDetail["card"]; trigger: React.ReactNode }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const due = card.dueAt ? new Date(card.dueAt) : null;
  const [date, setDate] = useState<Date | undefined>(due ?? undefined);
  const [time, setTime] = useState(due ? format(due, "HH:mm") : "18:00");
  const [hasStart, setHasStart] = useState(!!card.startAt);
  const [start, setStart] = useState(card.startAt ? format(new Date(card.startAt), "yyyy-MM-dd") : "");
  const [reminder, setReminder] = useState(card.dueReminderMinutes == null ? "none" : String(card.dueReminderMinutes));
  const [recurrence, setRecurrence] = useState(card.dueRecurrence ?? "never");
  const [error, setError] = useState<string | null>(null);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[340px]">
        <PopoverHeader title="Datas" />
        <Calendar mode="single" locale={ptBR} selected={date} onSelect={setDate} defaultMonth={date} className="mx-auto p-0" />
        <div className="mt-3 grid gap-3">
          <Label className="font-normal">
            <Checkbox checked={hasStart} onCheckedChange={(v) => setHasStart(!!v)} /> Data de início
          </Label>
          {hasStart && <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Data de início" />}
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="due-date">Entrega</Label>
              <Input id="due-date" value={date ? format(date, "dd/MM/yyyy") : ""} readOnly aria-describedby="due-help" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="due-time">Hora</Label>
              <Input id="due-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <p id="due-help" className="text-xs text-muted-foreground">
            Escolha o dia no calendário.
          </p>
          <div className="grid gap-1">
            <Label htmlFor="due-repeat">Repetir</Label>
            <Select value={recurrence} onValueChange={setRecurrence}>
              <SelectTrigger id="due-repeat" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Nunca</SelectItem>
                <SelectItem value="daily">Todo dia</SelectItem>
                <SelectItem value="weekly">Toda semana</SelectItem>
                <SelectItem value="monthly">Todo mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="due-reminder">Lembrete</Label>
            <Select value={reminder} onValueChange={setReminder}>
              <SelectTrigger id="due-reminder" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDERS.map(([v, t]) => (
                  <SelectItem key={v} value={v}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              loading={pending}
              onClick={() => {
                if (!date) {
                  setError("Escolha o dia da entrega.");
                  return;
                }
                const [h, m] = time.split(":").map(Number);
                const dueAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h || 0, m || 0).toISOString();
                const startAt = hasStart && start ? new Date(`${start}T00:00:00`).toISOString() : null;
                run(
                  () =>
                    updateCard({
                      cardId: card.id,
                      dueAt,
                      startAt,
                      dueReminderMinutes: reminder === "none" ? null : (Number(reminder) as 0),
                      dueRecurrence: recurrence === "never" ? null : (recurrence as "daily"),
                    }),
                  () => setOpen(false),
                );
              }}
            >
              Salvar
            </Button>
            {card.dueAt && (
              <Button variant="ghost" onClick={() => run(() => updateCard({ cardId: card.id, dueAt: null, startAt: null, dueReminderMinutes: null, dueRecurrence: null }), () => setOpen(false))}>
                Remover
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---- checklist e capa ---------------------------------------------------------------------------------

export function ChecklistPopover({ card, checklists, trigger }: { card: CardDetail["card"]; checklists: { id: string; name: string }[]; trigger: React.ReactNode }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Checklist");
  const [copyFrom, setCopyFrom] = useState("none");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader title="Adicionar checklist" />
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createChecklist(card.id, name, copyFrom === "none" ? null : copyFrom), () => setOpen(false));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="checklist-name">Nome</Label>
            <Input id="checklist-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {checklists.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="checklist-copy">Copiar os itens de</Label>
              <Select value={copyFrom} onValueChange={setCopyFrom}>
                <SelectTrigger id="checklist-copy" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {checklists.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="submit" loading={pending}>
            Adicionar
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function CoverPopover({ card, trigger }: { card: CardDetail["card"]; trigger: React.ReactNode }) {
  const { run } = useRun();
  const size = card.cover?.size ?? "strip";
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader title="Capa" />
        <fieldset className="mb-3">
          <legend className="mb-2 text-xs font-semibold text-muted-foreground">Tamanho</legend>
          <RadioGroup
            value={size}
            className="flex gap-4"
            onValueChange={(v) => card.cover && run(() => updateCard({ cardId: card.id, cover: { color: card.cover!.color, size: v as "strip" | "full" } }))}
          >
            <Label className="font-normal">
              <RadioGroupItem value="strip" disabled={!card.cover} /> Faixa no topo
            </Label>
            <Label className="font-normal">
              <RadioGroupItem value="full" disabled={!card.cover} /> Card inteiro
            </Label>
          </RadioGroup>
        </fieldset>
        <div role="radiogroup" aria-label="Cor da capa" className="grid grid-cols-5 gap-1.5">
          {LABEL_HUES.map((hue) => (
            <button
              key={hue}
              type="button"
              role="radio"
              aria-checked={card.cover?.color === hue}
              aria-label={LABEL_HUE_NAME[hue]}
              onClick={() => run(() => updateCard({ cardId: card.id, cover: { color: hue, size } }))}
              className={cn("h-8 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", card.cover?.color === hue && "ring-2 ring-ring ring-offset-2 ring-offset-popover")}
              style={{ background: `var(--ds-label-${hue})` }}
            />
          ))}
        </div>
        {card.cover && (
          <Button variant="ghost" className="mt-3 w-full" onClick={() => run(() => updateCard({ cardId: card.id, cover: null }))}>
            Remover capa
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---- mover e copiar -------------------------------------------------------------------------------------

function ListPicker({ lists, value, onChange, id }: { lists: ListOption[]; value: string; onChange: (v: string) => void; id: string }) {
  const boards = [...new Map(lists.map((l) => [l.boardId, l.boardName])).entries()];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {boards.map(([boardId, boardName]) => (
          <SelectGroup key={boardId}>
            <SelectLabel>{boardName}</SelectLabel>
            {lists
              .filter((l) => l.boardId === boardId)
              .map((l) => (
                <SelectItem key={l.listId} value={l.listId}>
                  {l.listName}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

export function MoveDialog({ card, lists, open, onOpenChange }: { card: CardDetail["card"]; lists: ListOption[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [listId, setListId] = useState(card.listId);
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Mover card</DialogTitle>
          <DialogDescription>Escolha o quadro, a lista e a posição.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="move-list">Lista</Label>
          <ListPicker id="move-list" lists={lists} value={listId} onChange={setListId} />
        </div>
        <RadioGroup value={position} onValueChange={(v) => setPosition(v as "top" | "bottom")} className="flex gap-4">
          <Label className="font-normal">
            <RadioGroupItem value="top" /> No topo
          </Label>
          <Label className="font-normal">
            <RadioGroupItem value="bottom" /> No fim
          </Label>
        </RadioGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await moveCard({ cardId: card.id, toListId: listId, position });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                onOpenChange(false);
                toast.success("Card movido");
                router.push(`/b/${result.data.boardId}?card=${card.id}`);
                router.refresh();
              })
            }
          >
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CopyDialog({ card, lists, open, onOpenChange }: { card: CardDetail["card"]; lists: ListOption[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(card.name);
  const [listId, setListId] = useState(card.listId);
  const [keep, setKeep] = useState({ labels: true, members: true, checklists: true, links: true });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Copiar card</DialogTitle>
          <DialogDescription>A cópia nasce no fim da lista escolhida.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="copy-name">Nome</Label>
          <Input id="copy-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Manter</legend>
          {(
            [
              ["labels", "Etiquetas (no mesmo quadro)"],
              ["members", "Membros"],
              ["checklists", "Checklists"],
              ["links", "Vínculos com campanhas"],
            ] as const
          ).map(([k, t]) => (
            <Label key={k} className="font-normal">
              <Checkbox checked={keep[k]} onCheckedChange={(v) => setKeep((s) => ({ ...s, [k]: !!v }))} /> {t}
            </Label>
          ))}
        </fieldset>
        <div className="grid gap-1.5">
          <Label htmlFor="copy-list">Lista</Label>
          <ListPicker id="copy-list" lists={lists} value={listId} onChange={setListId} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await copyCard({ cardId: card.id, toListId: listId, name, keep });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                onOpenChange(false);
                toast.success("Card copiado", { action: { label: "Abrir a cópia", onClick: () => router.push(`/b/${result.data.boardId}?card=${result.data.id}`) } });
                router.refresh();
              })
            }
          >
            Copiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- vincular a métrica (S24) ----------------------------------------------------------------------------

type Target = { id: string; name: string; provider: "meta" | "google" | null; parent: string | null };

export function LinkPopover({ cardId, dashboards, trigger }: { cardId: string; dashboards: { id: string; name: string }[]; trigger: React.ReactNode }) {
  const { run } = useRun();
  const [dashboardId, setDashboardId] = useState(dashboards[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ campaigns: Target[]; adSets: Target[]; ads: Target[]; products: Target[] } | null>(null);
  const [loading, startSearch] = useTransition();

  useEffect(() => {
    if (!dashboardId) return;
    const t = setTimeout(() => startSearch(async () => setResults(await searchLinkTargets(dashboardId, q))), 200);
    return () => clearTimeout(t);
  }, [dashboardId, q]);

  const group = (title: string, type: "campaign" | "ad_set" | "ad" | "product", items: Target[]) =>
    items.length > 0 && (
      <div role="group" aria-label={title} className="grid gap-0.5">
        <p className="px-2 pt-2 text-xs font-semibold text-muted-foreground">{title}</p>
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => run(() => linkCard({ cardId, dashboardId, targetType: type, targetId: t.id }), () => toast.success(`Card ligado a ${t.name}`))}
            className="grid rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center gap-1.5 text-sm">
              {t.provider && <span className="rounded-sm border px-1 text-[11px] font-medium">{t.provider === "meta" ? "Meta" : "Google"}</span>}
              <span className="truncate">{t.name}</span>
            </span>
            {t.parent && <span className="truncate text-xs text-muted-foreground">{t.parent}</span>}
          </button>
        ))}
      </div>
    );

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-96">
        <PopoverHeader title="Vincular a uma métrica" />
        {dashboards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você não tem acesso a nenhum dashboard de vendas.</p>
        ) : (
          <div className="grid gap-2">
            {dashboards.length > 1 && (
              <Select value={dashboardId} onValueChange={setDashboardId}>
                <SelectTrigger className="w-full" aria-label="Dashboard">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dashboards.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar campanha, conjunto, anúncio ou produto…" aria-label="Buscar o que vincular" />
            <div className="max-h-72 overflow-y-auto" aria-busy={loading || undefined}>
              {results && (
                <>
                  {group("Campanhas", "campaign", results.campaigns)}
                  {group("Conjuntos e grupos", "ad_set", results.adSets)}
                  {group("Anúncios", "ad", results.ads)}
                  {group("Produtos", "product", results.products)}
                  {results.campaigns.length + results.adSets.length + results.ads.length + results.products.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">Nada encontrado com esse nome.</p>
                  )}
                </>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => run(() => linkCard({ cardId, dashboardId, targetType: "dashboard", targetId: null }), () => toast.success("Card ligado ao dashboard"))}>
              Vincular ao dashboard inteiro
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
