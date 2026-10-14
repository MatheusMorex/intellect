"use client";

import { Clock, LayoutGrid, Search, SquareKanban, Tag, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { LabelChip } from "@/components/ds/label-chip";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { boardBackgroundStyle } from "@/lib/board-backgrounds";
import { useStoredList } from "@/lib/use-stored-list";
import { globalSearch } from "@/server/actions/shell";

type Results = Awaited<ReturnType<typeof globalSearch>>;

export function isTyping(target: EventTarget | null) {
  const t = target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

// S10 Busca global: quadros, cards, pessoas e etiquetas. Atalho "/".
export function GlobalSearch({ singleKeyShortcuts, workspaceSlug }: { singleKeyShortcuts: boolean; workspaceSlug: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, startSearch] = useTransition();
  const [recent, setRecent] = useStoredList("itl-buscas-recentes", []);

  useEffect(() => {
    if (!singleKeyShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [singleKeyShortcuts]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => startSearch(async () => setResults(await globalSearch(q))), 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (href: string) => {
    const term = q.trim();
    if (term.length >= 2) setRecent([term, ...recent.filter((r) => r !== term)].slice(0, 5));
    setOpen(false);
    setQ("");
    setResults(null);
    router.push(href);
  };

  const shown = q.trim().length >= 2 ? results : null;
  const total = shown ? shown.boards.length + shown.cards.length + shown.members.length + shown.labels.length : 0;

  return (
    <>
      <Button variant="outline" className="hidden h-9 w-64 justify-start gap-2 bg-background text-muted-foreground md:flex" onClick={() => setOpen(true)}>
        <Search aria-hidden="true" />
        <span className="flex-1 text-left">Buscar</span>
        {singleKeyShortcuts && <Kbd>/</Kbd>}
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buscar" onClick={() => setOpen(true)}>
        <Search aria-hidden="true" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setQ("");
            setResults(null);
          }
        }}
      >
        <DialogContent className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[600px]" showCloseButton={false}>
          <DialogTitle className="sr-only">Buscar</DialogTitle>
          <DialogDescription className="sr-only">Busque quadros, cards, pessoas e etiquetas.</DialogDescription>
          <Command shouldFilter={false} label="Busca global">
            <CommandInput value={q} onValueChange={setQ} placeholder="Buscar quadros, cards, pessoas e etiquetas…" />
            <CommandList className="max-h-[60dvh]" aria-busy={loading || undefined}>
              {!shown && recent.length > 0 && (
                <CommandGroup heading="Buscas recentes">
                  {recent.map((r) => (
                    <CommandItem key={r} value={`recente-${r}`} onSelect={() => setQ(r)}>
                      <Clock aria-hidden="true" />
                      {r}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!shown && recent.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Digite pelo menos 2 letras.</p>}
              {shown && total === 0 && !loading && <CommandEmpty>Nada encontrado para “{q.trim()}”.</CommandEmpty>}
              {shown && shown.cards.length > 0 && (
                <CommandGroup heading="Cards">
                  {shown.cards.map((c) => (
                    <CommandItem key={c.id} value={`card-${c.id}`} onSelect={() => go(`/b/${c.boardId}?card=${c.id}`)}>
                      <SquareKanban aria-hidden="true" />
                      <span className="grid min-w-0">
                        <span className="truncate">{c.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {c.boardName} · {c.listName}
                          {c.archived && " · arquivado"}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {shown && shown.boards.length > 0 && (
                <CommandGroup heading="Quadros">
                  {shown.boards.map((b) => (
                    <CommandItem key={b.id} value={`board-${b.id}`} onSelect={() => go(`/b/${b.id}`)}>
                      <span aria-hidden="true" className="size-4 rounded-sm" style={boardBackgroundStyle(b.background)} />
                      {b.name}
                      {b.closed && <span className="text-xs text-muted-foreground">fechado</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {shown && shown.labels.length > 0 && (
                <CommandGroup heading="Etiquetas">
                  {shown.labels.map((l) => (
                    <CommandItem key={l.id} value={`label-${l.id}`} onSelect={() => go(`/b/${l.boardId}?etiquetas=${l.id}`)}>
                      <Tag aria-hidden="true" />
                      {l.color ? <LabelChip color={l.color} name={l.name} /> : l.name}
                      <span className="text-xs text-muted-foreground">em {l.boardName}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {shown && shown.members.length > 0 && workspaceSlug && (
                <CommandGroup heading="Pessoas">
                  {shown.members.map((m) => (
                    <CommandItem key={m.id} value={`person-${m.id}`} onSelect={() => go(`/w/${workspaceSlug}/members`)}>
                      <User aria-hidden="true" />
                      {m.name}
                      {m.username && <span className="text-xs text-muted-foreground">@{m.username}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
          <div className="flex items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
            <LayoutGrid aria-hidden="true" className="size-3.5" />
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> navegam · <Kbd>Enter</Kbd> abre · <Kbd>Esc</Kbd> fecha
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
