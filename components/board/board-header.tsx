"use client";

import { Globe, Lock, Menu, Star, UserPlus, Workflow } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { BoardFilterButton } from "@/components/board/board-filters";
import { BoardMenu, type BoardArchive } from "@/components/board/board-menu";
import { ShareDialog, type BoardSharing } from "@/components/board/share-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import { starBoard, updateBoard } from "@/server/actions/kanban";
import type { BoardView } from "@/server/data/boards";

const onBoard = "text-white hover:bg-white/15 hover:text-white";

export function BoardHeader({
  view,
  archive,
  sharing,
  singleKeyShortcuts,
}: {
  view: BoardView;
  archive: BoardArchive;
  sharing: BoardSharing;
  singleKeyShortcuts: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(view.board.name);
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Atalho F abre o filtro (desligável no perfil; não dispara digitando num campo).
  useEffect(() => {
    if (!singleKeyShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setFilterOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [singleKeyShortcuts]);

  const saveName = () => {
    setEditing(false);
    const value = name.trim();
    if (!value || value === view.board.name) {
      setName(view.board.name);
      return;
    }
    startTransition(async () => {
      const result = await updateBoard({ boardId: view.board.id, name: value });
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });
  };

  const people = view.members.filter((m) => !m.viaWorkspace);

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2" style={{ background: "var(--ds-board-header)" }}>
      {editing ? (
        <Input
          autoFocus
          value={name}
          aria-label="Nome do quadro"
          className="h-8 w-72 text-lg font-semibold"
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveName();
            if (e.key === "Escape") {
              setName(view.board.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <h1 className="text-lg text-white">
          {view.canEdit ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-sm px-1 outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
              aria-label={`Renomear o quadro ${view.board.name}`}
            >
              {view.board.name}
            </button>
          ) : (
            view.board.name
          )}
        </h1>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className={onBoard}
        aria-pressed={view.board.starred}
        aria-label={view.board.starred ? "Tirar dos favoritos" : "Favoritar quadro"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await starBoard(view.board.id, !view.board.starred);
            router.refresh();
          })
        }
      >
        <Star aria-hidden="true" className={cn(view.board.starred && "fill-current text-[var(--ds-label-yellow)]")} />
      </Button>
      <VisibilityControl view={view} />
      {view.board.closed && <span className="rounded-sm bg-black/40 px-2 py-0.5 text-xs text-white">Quadro fechado</span>}
      {view.role === "observer" && <span className="rounded-sm bg-black/40 px-2 py-0.5 text-xs text-white">Somente leitura</span>}

      <div className="flex-1" />

      <BoardFilterButton labels={view.labels} members={view.members} open={filterOpen} onOpenChange={setFilterOpen} />
      <Button asChild variant="ghost" size="sm" className={onBoard}>
        <Link href={`/b/${view.board.id}/automation`}>
          <Workflow aria-hidden="true" />
          Automação
        </Link>
      </Button>
      <div className="flex -space-x-1" aria-label={`Membros: ${people.map((m) => m.name).join(", ")}`}>
        {people.slice(0, 5).map((m) => (
          <Avatar key={m.id} className="size-7 ring-2 ring-black/20" title={`${m.name}${m.role === "admin" ? " (admin)" : m.role === "observer" ? " (observador)" : ""}`}>
            <AvatarFallback className="text-[11px] font-semibold" style={{ background: `var(--ds-label-${m.avatarColor}-bold)`, color: "var(--ds-label-text-bold)" }}>
              {initials(m.name)}
            </AvatarFallback>
          </Avatar>
        ))}
        {people.length > 5 && (
          <Avatar className="size-7 ring-2 ring-black/20">
            <AvatarFallback className="bg-muted text-[11px] font-semibold text-muted-foreground">+{people.length - 5}</AvatarFallback>
          </Avatar>
        )}
      </div>
      <Button size="sm" className="bg-white/90 text-[var(--ds-brand-ink)] hover:bg-white" onClick={() => setShareOpen(true)}>
        <UserPlus aria-hidden="true" />
        Compartilhar
      </Button>
      <Button variant="ghost" size="icon-sm" className={onBoard} aria-label="Menu do quadro" onClick={() => setMenuOpen(true)}>
        <Menu aria-hidden="true" />
      </Button>

      <ShareDialog view={view} sharing={sharing} open={shareOpen} onOpenChange={setShareOpen} />
      <BoardMenu view={view} archive={archive} open={menuOpen} onOpenChange={setMenuOpen} />
    </div>
  );
}

function VisibilityControl({ view }: { view: BoardView }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const isPrivate = view.board.visibility === "private";
  const label = isPrivate ? "Privado" : `Workspace ${view.board.workspaceName}`;
  const Icon = isPrivate ? Lock : Globe;
  if (!view.isAdmin) {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-white/90">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </span>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={onBoard} aria-label={`Visibilidade: ${label}. Mudar`}>
          <Icon aria-hidden="true" />
          <span className="hidden md:inline">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <p className="mb-2 text-sm font-semibold">Quem vê este quadro</p>
        <RadioGroup
          value={view.board.visibility}
          onValueChange={(v) =>
            startTransition(async () => {
              const result = await updateBoard({ boardId: view.board.id, visibility: v as "private" | "workspace" });
              if (!result.ok) toast.error(result.error);
              router.refresh();
            })
          }
        >
          <Label className="items-start gap-3 rounded-md p-2 font-normal hover:bg-accent">
            <RadioGroupItem value="private" className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="font-medium">Privado</span>
              <span className="text-xs text-muted-foreground">Só os membros do quadro veem e editam.</span>
            </span>
          </Label>
          <Label className="items-start gap-3 rounded-md p-2 font-normal hover:bg-accent">
            <RadioGroupItem value="workspace" className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="font-medium">Workspace</span>
              <span className="text-xs text-muted-foreground">Todo o workspace {view.board.workspaceName} vê. Edita quem é membro.</span>
            </span>
          </Label>
        </RadioGroup>
      </PopoverContent>
    </Popover>
  );
}
