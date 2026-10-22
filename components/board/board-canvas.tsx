"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { Archive, ArrowDownUp, ArrowRightLeft, CalendarClock, Copy, GripVertical, MoreHorizontal, Palette, Pencil, Plus, Tag, Users, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { AddCard } from "@/components/board/add-card";
import { matches, readFilter, filterCount } from "@/components/board/board-filters";
import { CardFrontView } from "@/components/board/card-front";
import { useBoardLive } from "@/components/board/use-board-live";
import { LABEL_HUES, LABEL_HUE_NAME } from "@/components/ds/label-chip";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { LIST_SORT_LABEL, LIST_SORTS } from "@/lib/list-sort";
import { cn } from "@/lib/utils";
import {
  archiveAllCards,
  copyCard,
  createList,
  moveAllCards,
  moveCard,
  moveList,
  renameList,
  setCardArchived,
  setListArchived,
  setListColor,
  sortList,
  toggleCardLabel,
  toggleCardMember,
  updateBoard,
  updateCard,
} from "@/server/actions/kanban";
import type { BoardView, CardFront, Person } from "@/server/data/boards";

type ListView = BoardView["lists"][number];

/** Prazos prontos da edição rápida: daqui a N dias, às 18h (a mesma hora padrão do verso do card). */
const QUICK_DUES = [
  [0, "Hoje"],
  [1, "Amanhã"],
  [7, "Daqui a uma semana"],
] as const;

function dueInDays(days: number) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 18, 0).toISOString();
}

type Drag ={ type: "card"; id: string; overListId: string; overIndex: number } | { type: "list"; id: string; overIndex: number };
type Patch =
  | { kind: "card"; id: string; listId: string; rank: string }
  | { kind: "list"; id: string; rank: string }
  | { kind: "done"; id: string; done: boolean }
  | { kind: "archive"; id: string }
  | { kind: "archiveList"; id: string };

const byRank = <T extends { rank: string; id: string }>(a: T, b: T) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id.localeCompare(b.id));

function between(before?: string | null, after?: string | null) {
  try {
    return generateKeyBetween(before ?? null, after ?? null);
  } catch {
    return generateKeyBetween(before ?? null, null);
  }
}

export function BoardCanvas({ view, now }: { view: BoardView; now: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [drag, setDrag] = useState<Drag | null>(null);
  const justDropped = useRef(false);
  // id estável: sem ele, o dnd-kit gera ids diferentes no servidor e no navegador.
  const dndId = useId();
  const [state, apply] = useOptimistic({ lists: view.lists, cards: view.cards }, (s, p: Patch) => {
    if (p.kind === "card") return { ...s, cards: s.cards.map((c) => (c.id === p.id ? { ...c, listId: p.listId, rank: p.rank } : c)) };
    if (p.kind === "list") return { ...s, lists: s.lists.map((l) => (l.id === p.id ? { ...l, rank: p.rank } : l)) };
    if (p.kind === "done") return { ...s, cards: s.cards.map((c) => (c.id === p.id ? { ...c, dueComplete: p.done } : c)) };
    if (p.kind === "archive") return { ...s, cards: s.cards.filter((c) => c.id !== p.id) };
    return { ...s, lists: s.lists.filter((l) => l.id !== p.id) };
  });

  useBoardLive(view.board.id, view.board.stamp, drag != null);

  const filter = readFilter(new URLSearchParams(params.toString()));
  const filtering = filterCount(filter) > 0;
  const me = view.meId;
  const people = useMemo(() => new Map<string, Person>(view.members.map((m) => [m.id, m])), [view.members]);
  const canDrag = view.canEdit && !filtering;

  // Colunas como aparecem agora (com a prévia do arrastar).
  const lists = useMemo(() => {
    const sorted = [...state.lists].sort(byRank);
    if (drag?.type === "list") {
      const from = sorted.findIndex((l) => l.id === drag.id);
      const [moved] = sorted.splice(from, 1);
      sorted.splice(drag.overIndex, 0, moved);
    }
    return sorted;
  }, [state.lists, drag]);

  const columns = useMemo(() => {
    const map = new Map<string, CardFront[]>(lists.map((l) => [l.id, []]));
    for (const c of [...state.cards].sort(byRank)) map.get(c.listId)?.push(c);
    if (drag?.type === "card") {
      const card = state.cards.find((c) => c.id === drag.id);
      if (card) {
        for (const [, arr] of map) {
          const i = arr.findIndex((c) => c.id === card.id);
          if (i >= 0) arr.splice(i, 1);
        }
        map.get(drag.overListId)?.splice(drag.overIndex, 0, card);
      }
    }
    return map;
  }, [lists, state.cards, drag]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  const cardName = (id: string) => state.cards.find((c) => c.id === id)?.name ?? "card";
  const listName = (id: string) => state.lists.find((l) => l.id === id)?.name ?? "lista";
  const where = (listId: string, index: number) => `lista ${listName(listId)}, posição ${index + 1} de ${columns.get(listId)?.length ?? 0}`;

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const id = String(active.id);
      if (id.startsWith("list:")) return `Lista ${listName(id.slice(5))} pega.`;
      const card = state.cards.find((c) => c.id === id.slice(5));
      if (!card) return "";
      return `Card ${card.name} pego. ${where(card.listId, columns.get(card.listId)?.findIndex((c) => c.id === card.id) ?? 0)}.`;
    },
    onDragOver: ({ active }) => {
      if (drag?.type === "card") return `Card ${cardName(drag.id)} na ${where(drag.overListId, drag.overIndex)}.`;
      if (drag?.type === "list") return `Lista ${listName(String(active.id).slice(5))} na posição ${drag.overIndex + 1} de ${lists.length}.`;
      return "";
    },
    onDragEnd: ({ active }) => {
      if (drag?.type === "card") return `Card ${cardName(drag.id)} solto na ${where(drag.overListId, drag.overIndex)}.`;
      return `Lista ${listName(String(active.id).slice(5))} solta.`;
    },
    onDragCancel: ({ active }) => `Movimento cancelado. ${String(active.id).startsWith("list:") ? "A lista" : "O card"} voltou para onde estava.`,
  };

  function listOf(overId: string): { listId: string; cardId: string | null } | null {
    if (overId.startsWith("list:") || overId.startsWith("listdrop:")) return { listId: overId.split(":")[1], cardId: null };
    if (overId.startsWith("card:")) {
      const id = overId.slice(5);
      for (const [listId, arr] of columns) if (arr.some((c) => c.id === id)) return { listId, cardId: id };
    }
    return null;
  }

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (id.startsWith("card:")) {
      const card = state.cards.find((c) => c.id === id.slice(5));
      if (!card) return;
      setDrag({ type: "card", id: card.id, overListId: card.listId, overIndex: columns.get(card.listId)?.findIndex((c) => c.id === card.id) ?? 0 });
    } else {
      setDrag({ type: "list", id: id.slice(5), overIndex: lists.findIndex((l) => l.id === id.slice(5)) });
    }
  }

  function onDragOver(event: DragOverEvent) {
    if (!event.over || !drag) return;
    const target = listOf(String(event.over.id));
    if (!target) return;
    if (drag.type === "list") {
      const index = lists.findIndex((l) => l.id === target.listId);
      if (index >= 0 && index !== drag.overIndex) setDrag({ ...drag, overIndex: index });
      return;
    }
    const arr = (columns.get(target.listId) ?? []).filter((c) => c.id !== drag.id);
    let index = arr.length;
    if (target.cardId && target.cardId !== drag.id) {
      index = arr.findIndex((c) => c.id === target.cardId);
      const activeRect = event.active.rect.current.translated;
      const overRect = event.over.rect;
      if (activeRect && activeRect.top + activeRect.height / 2 > overRect.top + overRect.height / 2) index += 1;
    } else if (target.cardId === drag.id) {
      return;
    }
    if (target.listId !== drag.overListId || index !== drag.overIndex) setDrag({ ...drag, overListId: target.listId, overIndex: index });
  }

  function onDragEnd(event: DragEndEvent) {
    const current = drag;
    setDrag(null);
    justDropped.current = true;
    setTimeout(() => (justDropped.current = false), 250);
    if (!current || !event.over) return;
    if (current.type === "card") {
      const original = state.cards.find((c) => c.id === current.id);
      if (!original) return;
      const arr = (columns.get(current.overListId) ?? []).filter((c) => c.id !== current.id);
      const before = arr[current.overIndex - 1] ?? null;
      const after = arr[current.overIndex] ?? null;
      const origArr = [...state.cards].filter((c) => c.listId === original.listId).sort(byRank);
      const origIndex = origArr.findIndex((c) => c.id === original.id);
      if (original.listId === current.overListId && origArr[origIndex - 1]?.id === before?.id && origArr[origIndex + 1]?.id === after?.id) return;
      const rank = between(before?.rank, after?.rank);
      startTransition(async () => {
        apply({ kind: "card", id: original.id, listId: current.overListId, rank });
        const result = await moveCard({ cardId: original.id, toListId: current.overListId, beforeId: before?.id ?? null, afterId: after?.id ?? null });
        if (!result.ok) toast.error(result.error);
      });
    } else {
      const sorted = [...state.lists].sort(byRank);
      const from = sorted.findIndex((l) => l.id === current.id);
      if (from === current.overIndex) return;
      const rest = sorted.filter((l) => l.id !== current.id);
      const before = rest[current.overIndex - 1] ?? null;
      const after = rest[current.overIndex] ?? null;
      const rank = between(before?.rank, after?.rank);
      startTransition(async () => {
        apply({ kind: "list", id: current.id, rank });
        const result = await moveList(current.id, before?.id ?? null, after?.id ?? null);
        if (!result.ok) toast.error(result.error);
      });
    }
  }

  function openCard(cardId: string) {
    if (justDropped.current) return;
    const query = new URLSearchParams(params.toString());
    query.set("card", cardId);
    router.push(`${pathname}?${query.toString()}`, { scroll: false });
  }

  function toggleDone(card: CardFront) {
    startTransition(async () => {
      apply({ kind: "done", id: card.id, done: !card.dueComplete });
      const result = await updateCard({ cardId: card.id, dueComplete: !card.dueComplete });
      if (!result.ok) toast.error(result.error);
    });
  }

  function toggleLabels() {
    startTransition(async () => {
      await updateBoard({ boardId: view.board.id, prefs: { labelsExpanded: !view.board.prefs.labelsExpanded } });
    });
  }

  const draggedCard = drag?.type === "card" ? state.cards.find((c) => c.id === drag.id) : null;
  const draggedList = drag?.type === "list" ? state.lists.find((l) => l.id === drag.id) : null;
  const visibleCount = filtering ? state.cards.filter((c) => matches(c, filter, me, now)).length : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {filtering && (
        <p role="status" className="mx-4 mt-3 w-fit rounded-md bg-black/30 px-3 py-1.5 text-sm text-white">
          {visibleCount === 1 ? "1 card corresponde" : `${visibleCount} cards correspondem`} ao filtro. Arrastar fica desligado enquanto o filtro estiver ativo.
        </p>
      )}
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "Para mover, aperte Espaço. Use as setas para escolher o lugar e Espaço para soltar. Esc cancela. Enter abre o card.",
          },
        }}
      >
        <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-4" role="region" aria-label="Listas do quadro">
          <SortableContext items={lists.map((l) => `list:${l.id}`)} strategy={horizontalListSortingStrategy}>
            {lists.map((list) => {
              const cards = (columns.get(list.id) ?? []).filter((c) => !filtering || matches(c, filter, me, now));
              return (
                <SortableList
                  key={list.id}
                  list={list}
                  lists={lists}
                  cards={cards}
                  count={(columns.get(list.id) ?? []).length}
                  view={view}
                  disabled={!canDrag}
                  dimmed={drag?.type === "list" && drag.id === list.id}
                  onArchive={() =>
                    startTransition(async () => {
                      apply({ kind: "archiveList", id: list.id });
                      const result = await setListArchived(list.id, true);
                      if (!result.ok) toast.error(result.error);
                      else
                        toast(`Lista ${list.name} arquivada`, {
                          action: { label: "Desfazer", onClick: () => void setListArchived(list.id, false) },
                        });
                    })
                  }
                >
                  {cards.map((card) => (
                    <SortableCard
                      key={card.id}
                      card={card}
                      view={view}
                      people={people}
                      now={now}
                      disabled={!canDrag}
                      dimmed={drag?.type === "card" && drag.id === card.id}
                      lists={lists}
                      onOpen={() => openCard(card.id)}
                      onToggleDone={view.canEdit ? () => toggleDone(card) : undefined}
                      onToggleLabels={toggleLabels}
                      onArchive={() =>
                        startTransition(async () => {
                          apply({ kind: "archive", id: card.id });
                          const result = await setCardArchived(card.id, true);
                          if (!result.ok) toast.error(result.error);
                          else toast("Card arquivado", { action: { label: "Desfazer", onClick: () => void setCardArchived(card.id, false) } });
                        })
                      }
                      onMove={(toListId) =>
                        startTransition(async () => {
                          const target = columns.get(toListId) ?? [];
                          apply({ kind: "card", id: card.id, listId: toListId, rank: between(target.at(-1)?.rank, null) });
                          const result = await moveCard({ cardId: card.id, toListId, position: "bottom" });
                          if (!result.ok) toast.error(result.error);
                        })
                      }
                    />
                  ))}
                </SortableList>
              );
            })}
          </SortableContext>
          {view.canEdit && <AddList boardId={view.board.id} />}
          {lists.length === 0 && !view.canEdit && <p className="rounded-lg bg-card p-4 text-muted-foreground">Este quadro ainda não tem listas.</p>}
        </div>
        <DragOverlay dropAnimation={null}>
          {draggedCard ? (
            <div className="w-[256px] rotate-2 motion-reduce:rotate-0">
              <CardFrontView
                card={draggedCard}
                labels={view.labels}
                people={people}
                now={now}
                labelsExpanded={view.board.prefs.labelsExpanded}
                showComplete={view.board.prefs.showCompleteOnFront}
                showCovers={view.board.prefs.cardCovers}
                className="shadow-pop"
              />
            </div>
          ) : draggedList ? (
            <div className="w-list rotate-2 rounded-lg bg-muted p-3 font-semibold shadow-pop motion-reduce:rotate-0">{draggedList.name}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function SortableList({
  list,
  lists,
  cards,
  count,
  view,
  disabled,
  dimmed,
  onArchive,
  children,
}: {
  list: ListView;
  lists: ListView[];
  cards: CardFront[];
  count: number;
  view: BoardView;
  disabled: boolean;
  dimmed: boolean;
  onArchive: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({
    id: `list:${list.id}`,
    disabled,
    attributes: { roleDescription: "lista arrastável" },
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: `listdrop:${list.id}`, disabled });
  const [confirmArchiveAll, setConfirmArchiveAll] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, background: list.color ? `var(--ds-label-${list.color}-subtle)` : undefined }}
      aria-label={`Lista ${list.name}`}
      className={cn("flex max-h-full w-list shrink-0 flex-col gap-2 rounded-lg bg-muted p-2", dimmed && "opacity-40")}
    >
      <header className="flex items-center gap-1 px-1 pt-1">
        {!disabled && (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Mover a lista ${list.name}`}
            className="grid size-6 shrink-0 cursor-grab place-items-center rounded-sm text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
        )}
        <ListTitle list={list} canEdit={view.canEdit} />
        <span className="text-xs text-muted-foreground tabular" aria-label={`${count} cards`}>
          {count}
        </span>
        {view.canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Ações da lista ${list.name}`}>
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ArrowRightLeft aria-hidden="true" />
                  Mover todos os cards para…
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {lists
                    .filter((l) => l.id !== list.id)
                    .map((l) => (
                      <DropdownMenuItem
                        key={l.id}
                        disabled={count === 0}
                        onSelect={() =>
                          startTransition(async () => {
                            const result = await moveAllCards(list.id, l.id);
                            if (!result.ok) toast.error(result.error);
                            else toast(`${result.data.count} cards foram para ${l.name}`);
                          })
                        }
                      >
                        {l.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={count < 2}>
                  <ArrowDownUp aria-hidden="true" />
                  Ordenar cards por…
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {LIST_SORTS.map((by) => (
                    <DropdownMenuItem
                      key={by}
                      onSelect={() =>
                        startTransition(async () => {
                          const result = await sortList(list.id, by);
                          if (!result.ok) toast.error(result.error);
                          else toast(`Lista ${list.name} ordenada`);
                        })
                      }
                    >
                      {LIST_SORT_LABEL[by]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette aria-hidden="true" />
                  Cor da lista
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="grid grid-cols-5 gap-1 p-2">
                  {LABEL_HUES.map((hue) => (
                    <DropdownMenuItem
                      key={hue}
                      aria-label={LABEL_HUE_NAME[hue]}
                      className="h-8 w-10 justify-center p-0"
                      onSelect={() => startTransition(async () => void (await setListColor(list.id, hue)))}
                    >
                      <span aria-hidden="true" className="h-5 w-8 rounded-sm" style={{ background: `var(--ds-label-${hue})` }} />
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem className="col-span-5 justify-center" onSelect={() => startTransition(async () => void (await setListColor(list.id, null)))}>
                    Sem cor
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={count === 0} onSelect={() => setConfirmArchiveAll(true)}>
                <Archive aria-hidden="true" />
                Arquivar todos os cards desta lista
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onArchive}>
                <Archive aria-hidden="true" />
                Arquivar esta lista
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <div ref={setDropRef} className="-mx-1 grid min-h-2 content-start gap-2 overflow-y-auto px-1 py-0.5">
        <SortableContext items={cards.map((c) => `card:${c.id}`)} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </div>
      {view.canEdit && <AddCard boardId={view.board.id} listId={list.id} listName={list.name} />}
      <AlertDialog open={confirmArchiveAll} onOpenChange={setConfirmArchiveAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar os {count} cards de {list.name}?</AlertDialogTitle>
            <AlertDialogDescription>Os cards saem do quadro e ficam em Itens arquivados, no menu do quadro. Dá para restaurar depois.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                startTransition(async () => {
                  const result = await archiveAllCards(list.id);
                  if (!result.ok) toast.error(result.error);
                  else toast(`${result.data.count} cards arquivados`);
                })
              }
            >
              Arquivar cards
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ListTitle({ list, canEdit }: { list: ListView; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(list.name);
  const [, startTransition] = useTransition();
  if (!canEdit) return <h2 className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{list.name}</h2>;
  if (!editing) {
    return (
      <h2 className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => {
            setValue(list.name);
            setEditing(true);
          }}
          className="w-full truncate rounded-sm px-1 text-left text-sm font-semibold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Renomear a lista ${list.name}`}
        >
          {list.name}
        </button>
      </h2>
    );
  }
  const save = () => {
    setEditing(false);
    const name = value.trim();
    if (!name) {
      toast.error("O nome da lista não pode ficar vazio.");
      return;
    }
    if (name === list.name) return;
    startTransition(async () => {
      const result = await renameList(list.id, name);
      if (!result.ok) toast.error(result.error);
    });
  };
  return (
    <Input
      autoFocus
      value={value}
      maxLength={512}
      aria-label="Nome da lista"
      className="h-7 flex-1 px-1 text-sm font-semibold"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

function SortableCard({
  card,
  view,
  people,
  now,
  disabled,
  dimmed,
  lists,
  onOpen,
  onToggleDone,
  onToggleLabels,
  onArchive,
  onMove,
}: {
  card: CardFront;
  view: BoardView;
  people: Map<string, Person>;
  now: number;
  disabled: boolean;
  dimmed: boolean;
  lists: ListView[];
  onOpen: () => void;
  onToggleDone?: () => void;
  onToggleLabels: () => void;
  onArchive: () => void;
  onMove: (listId: string) => void;
}) {
  const router = useRouter();
  const [, startQuick] = useTransition();
  /** Etiqueta e membro pelo menu de edição rápida: grava e atualiza o quadro. */
  const quick = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startQuick(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error ?? "Não deu certo.");
      router.refresh();
    });
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: `card:${card.id}`,
    disabled,
    attributes: { roleDescription: "card arrastável" },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring", dimmed && "opacity-40")}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={card.name}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onOpen();
          return;
        }
        listeners?.onKeyDown?.(event);
      }}
    >
      <CardFrontView
        card={card}
        labels={view.labels}
        people={people}
        now={now}
        labelsExpanded={view.board.prefs.labelsExpanded}
        showComplete={view.board.prefs.showCompleteOnFront}
        showCovers={view.board.prefs.cardCovers}
        onToggleLabels={onToggleLabels}
        onToggleDone={onToggleDone}
        className="transition-shadow group-hover:shadow-[var(--ds-shadow-card),0_0_0_1px_var(--ds-border-input)]"
      />
      {view.canEdit && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon-sm" aria-label={`Edição rápida de ${card.name}`} onKeyDown={(e) => e.stopPropagation()}>
                <Pencil aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={onOpen}>Abrir card</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ArrowRightLeft aria-hidden="true" />
                  Mover para…
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {lists
                    .filter((l) => l.id !== card.listId)
                    .map((l) => (
                      <DropdownMenuItem key={l.id} onSelect={() => onMove(l.id)}>
                        {l.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {view.labels.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Tag aria-hidden="true" />
                    Etiquetas
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                    {view.labels.map((l) => (
                      <DropdownMenuCheckboxItem
                        key={l.id}
                        checked={card.labelIds.includes(l.id)}
                        // Fica aberto para marcar várias de uma vez.
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(on) => quick(() => toggleCardLabel(card.id, l.id, on === true))}
                      >
                        {l.color && <span aria-hidden="true" className="h-3 w-6 shrink-0 rounded-sm" style={{ background: `var(--ds-label-${l.color})` }} />}
                        {l.name || "Sem nome"}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {view.members.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Users aria-hidden="true" />
                    Membros
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                    {view.members.map((m) => (
                      <DropdownMenuCheckboxItem
                        key={m.id}
                        checked={card.memberIds.includes(m.id)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(on) => quick(() => toggleCardMember(card.id, m.id, on === true))}
                      >
                        {m.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <CalendarClock aria-hidden="true" />
                  Prazo
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {QUICK_DUES.map(([days, label]) => (
                    <DropdownMenuItem key={days} onSelect={() => quick(() => updateCard({ cardId: card.id, dueAt: dueInDays(days) }))}>
                      {label}, 18h
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onSelect={onOpen}>Outra data…</DropdownMenuItem>
                  {card.dueAt && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => quick(() => updateCard({ cardId: card.id, dueAt: null, startAt: null, dueReminderMinutes: null, dueRecurrence: null }))}>
                        Tirar o prazo
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette aria-hidden="true" />
                  Capa
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                  {LABEL_HUES.map((hue) => (
                    <DropdownMenuCheckboxItem
                      key={hue}
                      checked={card.cover?.color === hue}
                      onCheckedChange={() => quick(() => updateCard({ cardId: card.id, cover: { color: hue, size: card.cover?.size ?? "strip" } }))}
                    >
                      <span aria-hidden="true" className="h-3 w-6 shrink-0 rounded-sm" style={{ background: `var(--ds-label-${hue})` }} />
                      {LABEL_HUE_NAME[hue].charAt(0).toUpperCase() + LABEL_HUE_NAME[hue].slice(1)}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {card.cover && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => quick(() => updateCard({ cardId: card.id, cover: null }))}>Tirar a capa</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onSelect={() =>
                  quick(async () => {
                    const result = await copyCard({ cardId: card.id, toListId: card.listId, name: card.name, keep: { labels: true, members: true, checklists: true, links: true, attachments: true } });
                    if (result.ok) toast.success("Card copiado");
                    return result;
                  })
                }
              >
                <Copy aria-hidden="true" />
                Copiar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onArchive}>
                <Archive aria-hidden="true" />
                Arquivar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

function AddList({ boardId }: { boardId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button
        variant="ghost"
        className="w-list shrink-0 justify-start bg-white/20 text-white hover:bg-white/30 hover:text-white"
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden="true" />
        Adicionar outra lista
      </Button>
    );
  }
  const submit = () => {
    const value = name.trim();
    if (!value) return;
    startTransition(async () => {
      const result = await createList(boardId, value);
      if (!result.ok) toast.error(result.error);
      else setName("");
    });
  };
  return (
    <form
      className="grid w-list shrink-0 gap-2 rounded-lg bg-muted p-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        autoFocus
        value={name}
        maxLength={512}
        aria-label="Nome da nova lista"
        placeholder="Nome da lista"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Adicionar lista
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar" onClick={() => setOpen(false)}>
          <X aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
