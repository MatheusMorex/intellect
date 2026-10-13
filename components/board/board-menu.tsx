"use client";

import { Archive, ArrowLeft, Info, Lock, Palette, Settings, Tag, Activity, Trash2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { LABEL_HUES, LABEL_HUE_NAME, LabelChip } from "@/components/ds/label-chip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteBoard, deleteCard, deleteLabel, setBoardClosed, setCardArchived, setListArchived, updateBoard, upsertLabel } from "@/server/actions/kanban";
import type { BoardView, LabelView, Person } from "@/server/data/boards";

export type BoardArchive = {
  cards: { id: string; name: string; listName: string; archivedAt: string }[];
  lists: { id: string; name: string; archivedAt: string }[];
  activity: { id: string; actor: Person; text: string; cardName: string | null; cardId: string | null; isComment: boolean; createdAt: string }[];
};

type Page = "inicio" | "sobre" | "fundo" | "etiquetas" | "configuracoes" | "atividade" | "arquivados";

const PAGES: { id: Exclude<Page, "inicio">; label: string; icon: typeof Info }[] = [
  { id: "sobre", label: "Sobre este quadro", icon: Info },
  { id: "fundo", label: "Mudar o fundo", icon: Palette },
  { id: "etiquetas", label: "Etiquetas", icon: Tag },
  { id: "configuracoes", label: "Configurações", icon: Settings },
  { id: "atividade", label: "Atividade", icon: Activity },
  { id: "arquivados", label: "Itens arquivados", icon: Archive },
];

// S08 Menu do quadro.
export function BoardMenu({ view, archive, open, onOpenChange }: { view: BoardView; archive: BoardArchive; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [page, setPage] = useState<Page>("inicio");
  const title = page === "inicio" ? "Menu do quadro" : PAGES.find((p) => p.id === page)!.label;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPage("inicio");
      }}
    >
      <SheetContent className="w-side-panel gap-0 overflow-y-auto sm:max-w-side-panel">
        <SheetHeader className="flex-row items-center gap-1 border-b">
          {page !== "inicio" && (
            <Button variant="ghost" size="icon-sm" aria-label="Voltar" onClick={() => setPage("inicio")}>
              <ArrowLeft aria-hidden="true" />
            </Button>
          )}
          <SheetTitle className="text-base">{title}</SheetTitle>
          <SheetDescription className="sr-only">Configurações e itens do quadro {view.board.name}</SheetDescription>
        </SheetHeader>
        <div className="p-4">
          {page === "inicio" && (
            <nav aria-label="Menu do quadro" className="grid gap-1">
              {PAGES.map((p) => (
                <Button key={p.id} variant="ghost" className="justify-start" onClick={() => setPage(p.id)}>
                  <p.icon aria-hidden="true" />
                  {p.label}
                </Button>
              ))}
              <div className="my-2 h-px bg-border" />
              <CloseBoard view={view} />
            </nav>
          )}
          {page === "sobre" && <About view={view} />}
          {page === "fundo" && <Background view={view} />}
          {page === "etiquetas" && <Labels view={view} />}
          {page === "configuracoes" && <SettingsPage view={view} />}
          {page === "atividade" && <ActivityPage archive={archive} />}
          {page === "arquivados" && <Archived view={view} archive={archive} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error ?? "Não deu certo.");
      else if (success) toast.success(success);
      router.refresh();
    });
  return { pending, run };
}

function About({ view }: { view: BoardView }) {
  const { pending, run } = useRun();
  const [description, setDescription] = useState(view.board.description);
  const admins = view.members.filter((m) => m.role === "admin" && !m.viaWorkspace);
  return (
    <div className="grid gap-4">
      <section className="grid gap-1">
        <h3 className="text-sm font-semibold">Admins do quadro</h3>
        <p className="text-sm">{admins.map((a) => a.name).join(", ") || "Ninguém"}</p>
      </section>
      <div className="grid gap-1.5">
        <Label htmlFor="board-description">Descrição</Label>
        <Textarea
          id="board-description"
          value={description}
          disabled={!view.canEdit}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Para que serve este quadro?"
        />
      </div>
      {view.canEdit && (
        <div>
          <Button loading={pending} onClick={() => run(() => updateBoard({ boardId: view.board.id, description }), "Descrição salva")}>
            Salvar descrição
          </Button>
        </div>
      )}
    </div>
  );
}

function Background({ view }: { view: BoardView }) {
  const { run } = useRun();
  return (
    <div role="radiogroup" aria-label="Fundo do quadro" className="grid grid-cols-3 gap-2">
      {LABEL_HUES.map((hue) => {
        const active = view.board.background === hue;
        return (
          <button
            key={hue}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={LABEL_HUE_NAME[hue]}
            disabled={!view.canEdit}
            onClick={() => run(() => updateBoard({ boardId: view.board.id, background: hue }))}
            className={cn("h-16 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", active && "ring-2 ring-ring ring-offset-2 ring-offset-popover")}
            style={{ background: `var(--ds-label-${hue}-bold)` }}
          />
        );
      })}
    </div>
  );
}

const LABEL_COLORS = LABEL_HUES.flatMap((h) => [`${h}_light`, h, `${h}_dark`]);

export function LabelEditor({ boardId, label, onDone }: { boardId: string; label?: LabelView; onDone: () => void }) {
  const { pending, run } = useRun();
  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState<string | null>(label?.color ?? "green");
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await upsertLabel({ boardId, labelId: label?.id, name, color });
          if (r.ok) onDone();
          return r;
        });
      }}
    >
      <div className="grid place-items-center rounded-md bg-muted p-3">{color ? <LabelChip color={color} name={name} className="h-7 min-w-32 justify-center text-sm" /> : <span className="text-sm">{name || "Sem cor"}</span>}</div>
      <div className="grid gap-1.5">
        <Label htmlFor="label-name">Nome</Label>
        <Input id="label-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Cor</legend>
        <div role="radiogroup" aria-label="Cor da etiqueta" className="grid grid-cols-5 gap-1.5">
          {LABEL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`${LABEL_HUE_NAME[c.split("_")[0] as keyof typeof LABEL_HUE_NAME]} ${c.endsWith("_light") ? "sutil" : c.endsWith("_dark") ? "forte" : ""}`}
              onClick={() => setColor(c)}
              className={cn("h-8 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", color === c && "ring-2 ring-ring ring-offset-2 ring-offset-popover")}
              style={{ background: `var(--ds-label-${c.replace("_light", "-subtle").replace("_dark", "-bold").replace(/_/g, "-")})` }}
            />
          ))}
        </div>
        <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setColor(null)}>
          Sem cor
        </Button>
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          {label ? "Salvar" : "Criar etiqueta"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        {label && (
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-danger"
            onClick={() =>
              run(async () => {
                const r = await deleteLabel(label.id);
                if (r.ok) onDone();
                return r;
              }, "Etiqueta excluída")
            }
          >
            Excluir
          </Button>
        )}
      </div>
    </form>
  );
}

function Labels({ view }: { view: BoardView }) {
  const [editing, setEditing] = useState<LabelView | "new" | null>(null);
  if (editing) return <LabelEditor boardId={view.board.id} label={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />;
  return (
    <div className="grid gap-2">
      {view.labels.map((l) => (
        <div key={l.id} className="flex items-center gap-2">
          {l.color ? <LabelChip color={l.color} name={l.name} className="h-8 flex-1 text-sm" /> : <span className="flex-1 text-sm">{l.name}</span>}
          {view.canEdit && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(l)}>
              Editar
            </Button>
          )}
        </div>
      ))}
      {view.canEdit && (
        <Button variant="secondary" onClick={() => setEditing("new")}>
          Criar uma etiqueta
        </Button>
      )}
    </div>
  );
}

function SettingsPage({ view }: { view: BoardView }) {
  const { run } = useRun();
  const prefs = view.board.prefs;
  const toggle = (label: string, help: string, value: boolean, patch: Partial<typeof prefs>) => (
    <Label className="items-start justify-between gap-4 font-normal">
      <span className="grid gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{help}</span>
      </span>
      <Switch checked={value} disabled={!view.isAdmin} onCheckedChange={() => run(() => updateBoard({ boardId: view.board.id, prefs: patch }))} />
    </Label>
  );
  return (
    <div className="grid gap-5">
      {!view.isAdmin && <p className="text-sm text-muted-foreground">Só os admins do quadro mudam as configurações.</p>}
      {toggle("Observadores comentam", "Por padrão, só os membros comentam.", prefs.comments === "observers", { comments: prefs.comments === "observers" ? "members" : "observers" })}
      {toggle("O workspace edita", "Em quadro do workspace, qualquer membro do workspace pode editar.", prefs.workspaceCanEdit, { workspaceCanEdit: !prefs.workspaceCanEdit })}
      {toggle("Concluído na frente do card", "Mostra o círculo para marcar o prazo como concluído.", prefs.showCompleteOnFront, { showCompleteOnFront: !prefs.showCompleteOnFront })}
      {toggle("Capas dos cards", "Mostra as capas coloridas na frente dos cards.", prefs.cardCovers, { cardCovers: !prefs.cardCovers })}
    </div>
  );
}

function ActivityPage({ archive }: { archive: BoardArchive }) {
  const [onlyComments, setOnlyComments] = useState(false);
  const items = archive.activity.filter((a) => !onlyComments || a.isComment);
  return (
    <div className="grid gap-3">
      <div className="flex gap-1 rounded-md bg-muted p-1" role="group" aria-label="Mostrar">
        {[
          [false, "Tudo"],
          [true, "Só comentários"],
        ].map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={onlyComments === v}
            onClick={() => setOnlyComments(v as boolean)}
            className={cn("h-7 flex-1 rounded-sm text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring", onlyComments === v && "bg-card font-semibold text-foreground shadow-card")}
          >
            {text as string}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>
      ) : (
        <ol className="grid gap-3">
          {items.map((a) => (
            <li key={a.id} className="text-sm">
              <span className="font-semibold">{a.actor.name}</span> {a.text}
              {a.cardName && <span className="text-muted-foreground"> · {a.cardName}</span>}
              <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                {relative(new Date(a.createdAt))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Archived({ view, archive }: { view: BoardView; archive: BoardArchive }) {
  const { run } = useRun();
  const [tab, setTab] = useState<"cards" | "lists">("cards");
  const [q, setQ] = useState("");
  const cards = archive.cards.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const lists = archive.lists.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid gap-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nos arquivados…" aria-label="Buscar nos itens arquivados" />
      <div className="flex gap-1 rounded-md bg-muted p-1" role="group" aria-label="Tipo">
        {(["cards", "lists"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={cn("h-7 flex-1 rounded-sm text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t && "bg-card font-semibold text-foreground shadow-card")}
          >
            {t === "cards" ? `Cards (${archive.cards.length})` : `Listas (${archive.lists.length})`}
          </button>
        ))}
      </div>
      {tab === "cards" &&
        (cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum card arquivado.</p>
        ) : (
          <ul className="grid gap-2">
            {cards.map((c) => (
              <li key={c.id} className="grid gap-1 rounded-md border p-2">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">em {c.listName}</span>
                {view.canEdit && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => run(() => setCardArchived(c.id, false), "Card restaurado")}>
                      <RotateCcw aria-hidden="true" />
                      Restaurar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-danger">
                          <Trash2 aria-hidden="true" />
                          Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir o card {c.name}?</AlertDialogTitle>
                          <AlertDialogDescription>O card, os comentários e as checklists somem para sempre. Não dá para desfazer.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => run(() => deleteCard(c.id), "Card excluído")}>
                            Excluir card
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
      {tab === "lists" &&
        (lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma lista arquivada.</p>
        ) : (
          <ul className="grid gap-2">
            {lists.map((l) => (
              <li key={l.id} className="flex items-center gap-2 rounded-md border p-2">
                <span className="flex-1 text-sm font-medium">{l.name}</span>
                {view.canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => run(() => setListArchived(l.id, false), "Lista restaurada")}>
                    <RotateCcw aria-hidden="true" />
                    Restaurar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function CloseBoard({ view }: { view: BoardView }) {
  const router = useRouter();
  const { run } = useRun();
  const [confirmName, setConfirmName] = useState("");
  if (!view.isAdmin) return null;
  if (!view.board.closed) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" className="justify-start text-danger">
            <Lock aria-hidden="true" />
            Fechar quadro
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar o quadro {view.board.name}?</AlertDialogTitle>
            <AlertDialogDescription>O quadro sai do Início e fica só de leitura. Dá para reabrir depois em Quadros fechados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run(() => setBoardClosed(view.board.id, true), "Quadro fechado")}>
              Fechar quadro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
  return (
    <div className="grid gap-2">
      <Button variant="ghost" className="justify-start" onClick={() => run(() => setBoardClosed(view.board.id, false), "Quadro reaberto")}>
        <RotateCcw aria-hidden="true" />
        Reabrir quadro
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" className="justify-start text-danger">
            <Trash2 aria-hidden="true" />
            Excluir quadro para sempre
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o quadro {view.board.name}?</AlertDialogTitle>
            <AlertDialogDescription>Listas, cards, comentários e anexos somem para todos. Não dá para desfazer. Digite o nome do quadro para confirmar.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} aria-label="Nome do quadro para confirmar" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={confirmName.trim() !== view.board.name}
              onClick={() =>
                run(async () => {
                  const r = await deleteBoard(view.board.id);
                  if (r.ok) router.push(`/w/${view.board.workspaceSlug}`);
                  return r;
                }, "Quadro excluído")
              }
            >
              Excluir quadro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
