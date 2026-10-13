import type { Metadata } from "next";

import { AddCard } from "@/components/board/add-card";
import { KanbanCard, ListColumn } from "@/components/ds/kanban";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";
import { roas } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getBoardView } from "@/server/data/boards";

export async function generateMetadata({ params }: { params: Promise<{ boardId: string }> }): Promise<Metadata> {
  const { boardId } = await params;
  const user = await requireUser();
  const view = await getBoardView({ user }, boardId);
  return { title: view.board.name };
}

// S05 Quadro. Nesta etapa: listas e cards, criar card e o badge de métrica (S25).
// Arrastar e soltar, verso do card e filtros chegam na fase do kanban.
export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const user = await requireUser();
  const view = await getBoardView({ user }, boardId);
  const now = new Date();

  return (
    <div
      className="flex min-h-[calc(100dvh-3.5rem)] flex-col"
      style={{ background: `var(--ds-label-${view.board.background}-bold)` }}
    >
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-white"
        style={{ background: "var(--ds-board-header)" }}
      >
        <h1 className="text-lg text-white">{view.board.name}</h1>
        {view.role === "observer" && (
          <span className="rounded-sm bg-black/30 px-2 py-0.5 text-xs">Somente leitura</span>
        )}
        <div className="flex-1" />
        <div className="flex -space-x-1" aria-label={`Membros: ${view.members.map((m) => m.name).join(", ")}`}>
          {view.members.slice(0, 5).map((m) => (
            <Avatar key={m.id} className="size-7 ring-2 ring-black/20" title={m.name}>
              <AvatarFallback
                className="text-[11px] font-semibold"
                style={{ background: `var(--ds-label-${m.avatarColor}-bold)`, color: "var(--ds-label-text-bold)" }}
              >
                {initials(m.name)}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-start gap-3 overflow-x-auto p-4" role="region" aria-label="Listas do quadro" tabIndex={0}>
        {view.lists.map((list) => (
          <ListColumn
            key={list.id}
            name={list.name}
            count={list.cards.length}
            footer={view.canEdit ? <AddCard boardId={view.board.id} listId={list.id} listName={list.name} /> : null}
          >
            {list.cards.map((card) => (
              <KanbanCard
                key={card.id}
                now={now}
                card={{
                  title: card.name,
                  href: `/c/${card.id}`,
                  cover: card.cover ?? undefined,
                  due: card.dueAt ? { at: new Date(card.dueAt), complete: card.dueComplete } : undefined,
                  done: card.dueComplete ? true : undefined,
                  metric: card.metric
                    ? { label: card.metric.label, value: roas(card.metric.value), trend: card.metric.trend ?? undefined }
                    : undefined,
                }}
              />
            ))}
          </ListColumn>
        ))}
        {view.lists.length === 0 && (
          <p className="rounded-lg bg-card p-4 text-muted-foreground">Este quadro ainda não tem listas.</p>
        )}
      </div>
    </div>
  );
}
