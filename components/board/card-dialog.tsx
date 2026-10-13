"use client";

import {
  AlignLeft,
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  BarChart3,
  CalendarClock,
  CheckSquare,
  Copy,
  Eye,
  EyeOff,
  Link2,
  MessageSquare,
  MoreHorizontal,
  PaintBucket,
  Plus,
  Tag,
  Trash2,
  Unlink,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  ChecklistPopover,
  CopyDialog,
  CoverPopover,
  DatesPopover,
  LabelsPopover,
  LinkPopover,
  MembersPopover,
  MoveDialog,
  PersonAvatar,
  type ListOption,
} from "@/components/board/card-popovers";
import { RichEditor, type EditorValue } from "@/components/editor/rich-editor";
import { RichTextView } from "@/components/editor/rich-text-view";
import { DueBadge, MetricBadge } from "@/components/ds/badges";
import { Banner } from "@/components/ds/banner";
import { LabelChip } from "@/components/ds/label-chip";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { dateTime, money, relative, roas } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  addChecklistItem,
  addComment,
  convertItemToCard,
  deleteCard,
  deleteChecklist,
  deleteChecklistItem,
  deleteComment,
  editComment,
  setCardArchived,
  unlinkCard,
  updateCard,
  updateChecklist,
  updateChecklistItem,
} from "@/server/actions/kanban";
import type { CardDetail, LabelView, Person } from "@/server/data/boards";

type Result = { ok: boolean; error?: string };

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error ?? "Não deu certo.");
      else after?.();
      router.refresh();
    });
  return { pending, run };
}

function SectionTitle({ icon: Icon, id, children, actions }: { icon: React.ElementType; id: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <h3 id={id} className="flex-1 text-base font-semibold">
        {children}
      </h3>
      {actions}
    </div>
  );
}

// S06 Verso do card. Aberto como modal sobre o quadro (/b/<id>?card=<id>); fechar volta ao quadro.
export function CardDialog({
  detail,
  labels,
  members,
  lists,
  dashboards,
  now,
}: {
  detail: CardDetail;
  labels: LabelView[];
  members: Person[];
  lists: ListOption[];
  dashboards: { id: string; name: string }[];
  now: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [moveOpen, setMoveOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const { card } = detail;

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("card");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const cardLabels = labels.filter((l) => card.labelIds.includes(l.id));
  const cardMembers = members.filter((m) => card.memberIds.includes(m.id));
  const edit = detail.canEdit;
  const side = (Icon: React.ElementType, text: string) => (
    <Button variant="secondary" size="sm" className="w-full justify-start" disabled={!edit}>
      <Icon aria-hidden="true" />
      {text}
    </Button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-card-modal" onOpenAutoFocus={(e) => e.preventDefault()}>
        {card.cover && <div aria-hidden="true" className={cn("rounded-t-lg", card.cover.size === "full" ? "h-28" : "h-14")} style={{ background: `var(--ds-label-${card.cover.color})` }} />}
        <div className="grid gap-6 p-4 sm:p-6">
          <CardTitle detail={detail} />

          {card.archived && (
            <Banner variant="warning" title="Este card está arquivado">
              <span className="flex flex-wrap items-center gap-2">
                Ele não aparece no quadro.
                <ArchiveActions cardId={card.id} archived canEdit={edit} onDeleted={close} />
              </span>
            </Banner>
          )}
          {!edit && <p className="text-sm text-muted-foreground">Você só pode ver este card{detail.canComment ? " e comentar" : ""}.</p>}

          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_var(--ds-card-modal-side)] md:gap-8">
            <div className="grid min-w-0 content-start gap-8">
              {(cardLabels.length > 0 || cardMembers.length > 0 || card.dueAt) && (
                <div className="flex flex-wrap gap-x-8 gap-y-4">
                  {cardMembers.length > 0 && (
                    <div className="grid gap-1.5">
                      <p className="text-xs font-semibold text-muted-foreground">Membros</p>
                      <div className="flex flex-wrap gap-1">
                        {cardMembers.map((m) => (
                          <PersonAvatar key={m.id} person={m} size="size-8" />
                        ))}
                        {edit && (
                          <MembersPopover
                            card={card}
                            members={members}
                            trigger={
                              <Button variant="secondary" size="icon" className="size-8 rounded-full" aria-label="Mudar membros">
                                <Plus aria-hidden="true" />
                              </Button>
                            }
                          />
                        )}
                      </div>
                    </div>
                  )}
                  {cardLabels.length > 0 && (
                    <div className="grid gap-1.5">
                      <p className="text-xs font-semibold text-muted-foreground">Etiquetas</p>
                      <div className="flex flex-wrap gap-1">
                        {cardLabels.map((l) => (l.color ? <LabelChip key={l.id} color={l.color} name={l.name} className="h-8 px-3 text-sm" /> : null))}
                        {edit && (
                          <LabelsPopover
                            card={card}
                            boardId={detail.board.id}
                            labels={labels}
                            trigger={
                              <Button variant="secondary" size="icon" className="size-8" aria-label="Mudar etiquetas">
                                <Plus aria-hidden="true" />
                              </Button>
                            }
                          />
                        )}
                      </div>
                    </div>
                  )}
                  {card.dueAt && <DueSummary detail={detail} now={now} />}
                </div>
              )}

              <Description detail={detail} members={members} />

              {detail.checklists.map((c) => (
                <ChecklistBlock key={c.id} checklist={c} canEdit={edit} members={members} />
              ))}

              <Conversation detail={detail} members={members} />
            </div>

            <aside className="grid content-start gap-6" aria-label="Ações do card">
              {edit && (
                <div className="grid gap-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">Adicionar ao card</p>
                  <MembersPopover card={card} members={members} trigger={side(Users, "Membros")} />
                  <LabelsPopover card={card} boardId={detail.board.id} labels={labels} trigger={side(Tag, "Etiquetas")} />
                  <ChecklistPopover card={card} checklists={detail.checklists} trigger={side(CheckSquare, "Checklist")} />
                  <DatesPopover card={card} trigger={side(CalendarClock, "Datas")} />
                  <CoverPopover card={card} trigger={side(PaintBucket, "Capa")} />
                  <LinkPopover cardId={card.id} dashboards={dashboards} trigger={side(Link2, "Vincular métrica")} />
                </div>
              )}

              <MetricsPanel detail={detail} canEdit={edit} />

              {edit && (
                <div className="grid gap-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">Ações</p>
                  <Button variant="secondary" size="sm" className="justify-start" onClick={() => setMoveOpen(true)}>
                    <ArrowRightLeft aria-hidden="true" />
                    Mover
                  </Button>
                  <Button variant="secondary" size="sm" className="justify-start" onClick={() => setCopyOpen(true)}>
                    <Copy aria-hidden="true" />
                    Copiar
                  </Button>
                  {!card.archived && <ArchiveActions cardId={card.id} archived={false} canEdit={edit} onDeleted={close} />}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Card #{card.number} · criado {relative(new Date(card.createdAt))}
              </p>
            </aside>
          </div>
        </div>
        {edit && <MoveDialog card={card} lists={lists} open={moveOpen} onOpenChange={setMoveOpen} />}
        <CopyDialog card={card} lists={lists} open={copyOpen} onOpenChange={setCopyOpen} />
      </DialogContent>
    </Dialog>
  );
}

// ---- título e lista ----------------------------------------------------------------------------------

function CardTitle({ detail }: { detail: CardDetail }) {
  const { card } = detail;
  const { run } = useRun();
  const [name, setName] = useState(card.name);
  const [editing, setEditing] = useState(false);
  const save = () => {
    setEditing(false);
    const value = name.replace(/\s+/g, " ").trim();
    if (!value) {
      setName(card.name);
      return;
    }
    if (value !== card.name) run(() => updateCard({ cardId: card.id, name: value }));
  };
  return (
    <header className="grid gap-1 pr-8">
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-1.5 size-5 rounded-full"
          checked={card.dueComplete}
          disabled={!detail.canEdit}
          aria-label={card.dueComplete ? "Marcar como não concluído" : "Marcar como concluído"}
          onCheckedChange={(v) => run(() => updateCard({ cardId: card.id, dueComplete: !!v }))}
        />
        <div className="min-w-0 flex-1">
          {editing ? (
            <Textarea
              autoFocus
              aria-label="Nome do card"
              value={name}
              rows={1}
              className="min-h-9 resize-none text-lg font-semibold"
              onChange={(e) => setName(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setName(card.name);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <DialogTitle className="text-lg leading-snug break-words">
              {detail.canEdit ? (
                <button type="button" className="w-full rounded-sm text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setEditing(true)}>
                  {card.name}
                </button>
              ) : (
                card.name
              )}
            </DialogTitle>
          )}
          <DialogDescription className="mt-1">
            na lista <span className="font-medium text-foreground">{card.listName}</span> do quadro {detail.board.name}
          </DialogDescription>
        </div>
      </div>
    </header>
  );
}

function DueSummary({ detail, now }: { detail: CardDetail; now: number }) {
  const { card } = detail;
  const { run } = useRun();
  const trigger = (
    <Button variant="secondary" size="sm" disabled={!detail.canEdit} aria-label="Mudar as datas">
      {card.startAt && <span>{new Date(card.startAt).toLocaleDateString("pt-BR")} → </span>}
      {dateTime(new Date(card.dueAt!))}
      <DueBadge due={new Date(card.dueAt!)} complete={card.dueComplete} now={new Date(now)} />
    </Button>
  );
  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-semibold text-muted-foreground">{card.startAt ? "Datas" : "Entrega"}</p>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={card.dueComplete}
          disabled={!detail.canEdit}
          aria-label="Prazo concluído"
          onCheckedChange={(v) => run(() => updateCard({ cardId: card.id, dueComplete: !!v }))}
        />
        {detail.canEdit ? <DatesPopover card={card} trigger={trigger} /> : trigger}
      </div>
    </div>
  );
}

// ---- descrição, com conflito de versão ------------------------------------------------------------------

function Description({ detail, members }: { detail: CardDetail; members: Person[] }) {
  const { card } = detail;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditorValue | null>(null);
  const [baseVersion, setBaseVersion] = useState(card.version);
  const [conflict, setConflict] = useState<{ description: unknown; descriptionText: string; version: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const empty = !card.descriptionText.trim();

  const save = (value: EditorValue | null, version: number) => {
    if (!value) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await updateCard({ cardId: card.id, description: value.doc, descriptionText: value.text, expectedVersion: version });
      if (!result.ok) {
        if ("conflict" in result) setConflict(result.current);
        else toast.error(result.error);
        return;
      }
      setConflict(null);
      setEditing(false);
      setDraft(null);
      router.refresh();
    });
  };

  return (
    <section aria-labelledby="card-desc" className="grid gap-3">
      <SectionTitle
        icon={AlignLeft}
        id="card-desc"
        actions={
          detail.canEdit &&
          !editing &&
          !empty && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setBaseVersion(card.version);
                setEditing(true);
              }}
            >
              Editar
            </Button>
          )
        }
      >
        Descrição
      </SectionTitle>
      <div className="md:pl-8">
        {editing ? (
          <div className="grid gap-2">
            {conflict && (
              <Banner variant="warning" title="Alguém mudou esta descrição enquanto você editava">
                <span className="grid gap-2">
                  <span>Escolha o que fica. O texto que você escreveu continua no editor até você decidir.</span>
                  <span className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => save(draft, conflict.version)}>
                      Manter o meu texto
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setConflict(null);
                        setEditing(false);
                        setDraft(null);
                        router.refresh();
                      }}
                    >
                      Ficar com a versão nova
                    </Button>
                  </span>
                </span>
              </Banner>
            )}
            <RichEditor
              autoFocus
              initial={card.description as never}
              placeholder="Explique o card: objetivo, links, o que precisa ser feito…"
              ariaLabel="Descrição do card"
              people={members}
              onChange={setDraft}
              onSubmit={(v) => save(v, baseVersion)}
              onCancel={() => {
                setEditing(false);
                setDraft(null);
                setConflict(null);
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" loading={pending} onClick={() => save(draft, baseVersion)}>
                Salvar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft(null);
                  setConflict(null);
                }}
              >
                Cancelar
              </Button>
              <span className="ml-auto self-center text-xs text-muted-foreground">Ctrl+Enter salva · Esc cancela</span>
            </div>
          </div>
        ) : empty ? (
          detail.canEdit ? (
            <button
              type="button"
              onClick={() => {
                setBaseVersion(card.version);
                setEditing(true);
              }}
              className="min-h-16 w-full rounded-md bg-muted px-3 py-2 text-left text-sm text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              Adicione uma descrição mais detalhada…
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">Sem descrição.</p>
          )
        ) : (
          <RichTextView doc={card.description} fallback={card.descriptionText} />
        )}
      </div>
    </section>
  );
}

// ---- checklists --------------------------------------------------------------------------------------------

type Checklist = CardDetail["checklists"][number];

function ChecklistBlock({ checklist, canEdit, members }: { checklist: Checklist; canEdit: boolean; members: Person[] }) {
  const { run } = useRun();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(checklist.name);
  const [adding, setAdding] = useState(false);
  const [itemName, setItemName] = useState("");
  const done = checklist.items.filter((i) => i.done).length;
  const total = checklist.items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const shown = checklist.hideChecked ? checklist.items.filter((i) => !i.done) : checklist.items;
  const titleId = `cl-${checklist.id}`;

  const rename = () => {
    setRenaming(false);
    const value = name.trim();
    if (!value) setName(checklist.name);
    else if (value !== checklist.name) run(() => updateChecklist(checklist.id, { name: value }));
  };

  return (
    <section aria-labelledby={titleId} className="grid gap-3">
      <SectionTitle
        icon={CheckSquare}
        id={titleId}
        actions={
          <div className="flex gap-1">
            {done > 0 && (
              <Button variant="secondary" size="sm" onClick={() => run(() => updateChecklist(checklist.id, { hideChecked: !checklist.hideChecked }))}>
                {checklist.hideChecked ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                {checklist.hideChecked ? `Mostrar marcados (${done})` : "Ocultar marcados"}
              </Button>
            )}
            {canEdit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="secondary" size="sm">
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir a checklist {checklist.name}?</AlertDialogTitle>
                    <AlertDialogDescription>Os {total} itens somem junto. Não tem como desfazer.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => run(() => deleteChecklist(checklist.id))}>
                      Excluir checklist
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      >
        {renaming ? (
          <Input
            autoFocus
            aria-label="Nome da checklist"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename();
              if (e.key === "Escape") {
                e.stopPropagation();
                setName(checklist.name);
                setRenaming(false);
              }
            }}
          />
        ) : canEdit ? (
          <button type="button" className="rounded-sm text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setRenaming(true)}>
            {checklist.name}
          </button>
        ) : (
          checklist.name
        )}
      </SectionTitle>

      <div className="grid gap-1 md:pl-8">
        <div className="flex items-center gap-3">
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
          <Progress value={pct} aria-label={`${done} de ${total} itens concluídos`} className={cn("flex-1", pct === 100 && "[&>*]:bg-success")} />
        </div>
        {checklist.hideChecked && done === total && total > 0 && <p className="py-1 text-sm text-muted-foreground">Tudo concluído.</p>}
        <ul className="grid">
          {shown.map((item) => (
            <ChecklistItem key={item.id} item={item} canEdit={canEdit} members={members} />
          ))}
        </ul>
        {canEdit &&
          (adding ? (
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const value = itemName.trim();
                if (!value) return;
                setItemName("");
                run(() => addChecklistItem(checklist.id, value));
              }}
            >
              <Textarea
                autoFocus
                rows={2}
                aria-label="Novo item"
                placeholder="Adicionar um item"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setAdding(false);
                  }
                }}
              />
              <div className="flex gap-2">
                <Button size="sm" type="submit">
                  Adicionar
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setAdding(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="secondary" size="sm" className="w-fit" onClick={() => setAdding(true)}>
              Adicionar um item
            </Button>
          ))}
      </div>
    </section>
  );
}

function ChecklistItem({ item, canEdit, members }: { item: Checklist["items"][number]; canEdit: boolean; members: Person[] }) {
  const router = useRouter();
  const { run } = useRun();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [dueOpen, setDueOpen] = useState(false);
  const [due, setDue] = useState(item.dueAt ? item.dueAt.slice(0, 10) : "");

  const save = () => {
    setEditing(false);
    const value = name.trim();
    if (!value) setName(item.name);
    else if (value !== item.name) run(() => updateChecklistItem(item.id, { name: value }));
  };

  return (
    <li className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-accent/60">
      <Checkbox
        className="mt-1"
        checked={item.done}
        disabled={!canEdit}
        aria-label={item.name}
        onCheckedChange={(v) => run(() => updateChecklistItem(item.id, { done: !!v }))}
      />
      <div className="min-w-0 flex-1">
        {editing ? (
          <Textarea
            autoFocus
            rows={2}
            aria-label="Texto do item"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") {
                e.stopPropagation();
                setName(item.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setEditing(true)}
            className={cn("w-full rounded-sm text-left text-sm break-words outline-none focus-visible:ring-2 focus-visible:ring-ring", item.done && "text-muted-foreground line-through")}
          >
            {item.name}
          </button>
        )}
        {(item.assignee || item.dueAt) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {item.assignee && (
              <span className="inline-flex items-center gap-1">
                <PersonAvatar person={item.assignee} size="size-5" /> {item.assignee.name}
              </span>
            )}
            {item.dueAt && <span>até {new Date(item.dueAt).toLocaleDateString("pt-BR")}</span>}
          </div>
        )}
      </div>
      {canEdit && (
        <Popover open={dueOpen} onOpenChange={setDueOpen}>
          <DropdownMenu>
            <PopoverAnchor asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Opções do item ${item.name}`} className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 data-[state=open]:opacity-100">
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
            </PopoverAnchor>
            <DropdownMenuContent align="end" className="w-60">
              <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Responsável</p>
              {members.map((m) => (
                <DropdownMenuItem key={m.id} onSelect={() => run(() => updateChecklistItem(item.id, { assigneeId: item.assignee?.id === m.id ? null : m.id }))}>
                  <PersonAvatar person={m} size="size-5" />
                  {m.name}
                  {item.assignee?.id === m.id && <span className="ml-auto text-xs text-muted-foreground">tirar</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTimeout(() => setDueOpen(true), 0)}>
                <CalendarClock aria-hidden="true" />
                {item.dueAt ? "Mudar o prazo" : "Dar um prazo"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  run(
                    () => convertItemToCard(item.id),
                    () => {
                      toast.success("Item virou card");
                      router.refresh();
                    },
                  )
                }
              >
                <ArrowRightLeft aria-hidden="true" />
                Transformar em card
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => run(() => deleteChecklistItem(item.id))}>
                <Trash2 aria-hidden="true" />
                Excluir item
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PopoverContent align="end" className="w-64">
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => updateChecklistItem(item.id, { dueAt: due ? new Date(`${due}T18:00:00`).toISOString() : null }), () => setDueOpen(false));
              }}
            >
              <Label htmlFor={`due-${item.id}`}>Prazo do item</Label>
              <Input id={`due-${item.id}`} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" type="submit">
                  Salvar
                </Button>
                {item.dueAt && (
                  <Button size="sm" variant="ghost" type="button" onClick={() => run(() => updateChecklistItem(item.id, { dueAt: null }), () => setDueOpen(false))}>
                    Remover
                  </Button>
                )}
              </div>
            </form>
          </PopoverContent>
        </Popover>
      )}
    </li>
  );
}

// ---- comentários e atividade -------------------------------------------------------------------------------

type Comment = CardDetail["comments"][number];

function Conversation({ detail, members }: { detail: CardDetail; members: Person[] }) {
  const router = useRouter();
  const [details, setDetails] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<EditorValue | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [pending, startTransition] = useTransition();

  const send = (value: EditorValue | null) => {
    if (!value || !value.text.trim()) return;
    startTransition(async () => {
      const result = await addComment(detail.card.id, { body: value.doc, bodyText: value.text, mentions: value.mentions });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDraft(null);
      setComposing(false);
      setEditorKey((k) => k + 1);
      router.refresh();
    });
  };

  type Entry = { kind: "comment"; at: string; comment: Comment } | { kind: "activity"; at: string; item: CardDetail["activity"][number] };
  const entries: Entry[] = [
    ...detail.comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, comment: c })),
    ...(details ? detail.activity.map((a) => ({ kind: "activity" as const, at: a.createdAt, item: a })) : []),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section aria-labelledby="card-activity" className="grid gap-3">
      <SectionTitle
        icon={MessageSquare}
        id="card-activity"
        actions={
          <Button variant="secondary" size="sm" aria-pressed={details} onClick={() => setDetails((d) => !d)}>
            {details ? "Ocultar detalhes" : "Mostrar detalhes"}
          </Button>
        }
      >
        Comentários e atividade
      </SectionTitle>

      {detail.canComment && (
        <div className="md:pl-8">
          {composing ? (
            <div className="grid gap-2">
              <RichEditor
                key={editorKey}
                autoFocus
                placeholder="Escreva um comentário. Use @ para chamar alguém."
                ariaLabel="Novo comentário"
                people={members}
                onChange={setDraft}
                onSubmit={send}
                onCancel={() => setComposing(false)}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" loading={pending} disabled={!draft?.text.trim()} onClick={() => send(draft)}>
                  Comentar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setComposing(false)}>
                  Cancelar
                </Button>
                <span className="ml-auto text-xs text-muted-foreground">Ctrl+Enter envia</span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-left text-sm text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              Escreva um comentário…
            </button>
          )}
        </div>
      )}

      <ol className="grid gap-4 md:pl-8">
        {entries.map((e) =>
          e.kind === "comment" ? (
            <CommentItem key={e.comment.id} comment={e.comment} members={members} />
          ) : (
            <li key={e.item.id} className="flex items-start gap-2 text-sm">
              <PersonAvatar person={e.item.actor} size="size-7" />
              <p className="min-w-0 flex-1">
                <span className="font-semibold">{e.item.actor.name}</span> {e.item.text}
                {e.item.kind === "automation" && <span className="ml-1 rounded-sm bg-primary-subtle px-1 text-xs text-primary">automação</span>}
                <br />
                <time dateTime={e.item.createdAt} title={dateTime(new Date(e.item.createdAt))} className="text-xs text-muted-foreground">
                  {relative(new Date(e.item.createdAt))}
                </time>
              </p>
            </li>
          ),
        )}
        {entries.length === 0 && <li className="text-sm text-muted-foreground">{details ? "Nada aconteceu neste card ainda." : "Nenhum comentário ainda."}</li>}
      </ol>
    </section>
  );
}

function CommentItem({ comment, members }: { comment: Comment; members: Person[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditorValue | null>(null);
  const [pending, startTransition] = useTransition();
  const save = (value: EditorValue | null) => {
    if (!value || !value.text.trim()) return;
    startTransition(async () => {
      const result = await editComment(comment.id, { body: value.doc, bodyText: value.text, mentions: value.mentions });
      if (!result.ok) toast.error(result.error);
      else setEditing(false);
      router.refresh();
    });
  };
  return (
    <li className="flex items-start gap-2">
      <PersonAvatar person={comment.author} size="size-7" />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="text-sm">
          <span className="font-semibold">{comment.author.name}</span>{" "}
          <time dateTime={comment.createdAt} title={dateTime(new Date(comment.createdAt))} className="text-xs text-muted-foreground">
            {relative(new Date(comment.createdAt))}
          </time>
          {comment.editedAt && <span className="text-xs text-muted-foreground"> (editado)</span>}
        </p>
        {editing ? (
          <div className="grid gap-2">
            <RichEditor autoFocus initial={comment.body as never} placeholder="Comentário" ariaLabel="Editar comentário" people={members} onChange={setDraft} onSubmit={save} onCancel={() => setEditing(false)} />
            <div className="flex gap-2">
              <Button size="sm" loading={pending} onClick={() => save(draft)}>
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border bg-card px-3 py-2 text-sm shadow-card">
            <RichTextView doc={comment.body} fallback={comment.bodyText} />
          </div>
        )}
        {comment.mine && !editing && (
          <div className="flex gap-1 text-xs">
            <Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground">
                  Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir o comentário?</AlertDialogTitle>
                  <AlertDialogDescription>Ele some para todo mundo. Não tem como desfazer.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteComment(comment.id);
                        if (!result.ok) toast.error(result.error);
                        router.refresh();
                      })
                    }
                  >
                    Excluir comentário
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </li>
  );
}

// ---- métricas (S25) -------------------------------------------------------------------------------------

const LEVEL = { campaign: "Campanha", ad_set: "Conjunto", ad: "Anúncio", product: "Produto", dashboard: "Dashboard" } as const;

function MetricsPanel({ detail, canEdit }: { detail: CardDetail; canEdit: boolean }) {
  const { run } = useRun();
  const { metric, links } = detail;
  if (links.length === 0) return null;
  return (
    <section aria-labelledby="card-metrics" className="grid gap-2 rounded-md bg-muted p-3">
      <h3 id="card-metrics" className="flex items-center gap-2 text-sm font-semibold">
        <BarChart3 aria-hidden="true" className="size-4" />
        Métricas
      </h3>
      {metric && (
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <MetricBadge label="ROAS" value={roas(metric.value)} trend={metric.trend ?? undefined} period="nos últimos 7 dias" />
            <span className="text-xs text-muted-foreground">últimos 7 dias</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Gasto</dt>
            <dd className="text-right tabular-nums">{money(metric.spendCents)}</dd>
            <dt className="text-muted-foreground">Faturamento</dt>
            <dd className="text-right tabular-nums">{money(metric.revenueCents)}</dd>
            <dt className="text-muted-foreground">Vendas</dt>
            <dd className="text-right tabular-nums">{metric.sales}</dd>
          </dl>
          <Button asChild size="sm" variant="outline" className="bg-card">
            <Link href={`/d/${metric.dashboardId}/${metric.provider ?? "meta"}?periodo=7d`}>Abrir no relatório</Link>
          </Button>
        </div>
      )}
      <ul className="grid gap-1">
        {links.map((l) => (
          <li key={l.id} className="flex items-center gap-1 text-xs">
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground">{LEVEL[l.targetType]}</span> ·{" "}
              {l.provider && <span className="font-medium">{l.provider === "meta" ? "Meta" : "Google"} · </span>}
              <span className={cn(l.missing && "text-muted-foreground italic")}>{l.name}</span>
            </span>
            {canEdit && (
              <Button variant="ghost" size="icon-sm" aria-label={`Desvincular ${l.name}`} onClick={() => run(() => unlinkCard(l.id))}>
                <Unlink aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!metric && <p className="text-xs text-muted-foreground">Ligue o card a uma campanha, conjunto ou anúncio para ver o ROAS aqui.</p>}
    </section>
  );
}

// ---- arquivar, restaurar e excluir ------------------------------------------------------------------------

function ArchiveActions({ cardId, archived, canEdit, onDeleted }: { cardId: string; archived: boolean; canEdit: boolean; onDeleted: () => void }) {
  const { run } = useRun();
  if (!canEdit) return null;
  if (!archived) {
    return (
      <Button variant="secondary" size="sm" className="justify-start" onClick={() => run(() => setCardArchived(cardId, true), () => toast.success("Card arquivado"))}>
        <Archive aria-hidden="true" />
        Arquivar
      </Button>
    );
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => run(() => setCardArchived(cardId, false), () => toast.success("Card restaurado"))}>
        <ArchiveRestore aria-hidden="true" />
        Restaurar
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm">
            <X aria-hidden="true" />
            Excluir
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o card para sempre?</AlertDialogTitle>
            <AlertDialogDescription>Comentários, checklists e vínculos somem junto. Não tem como desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run(() => deleteCard(cardId), onDeleted)}>
              Excluir card
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
