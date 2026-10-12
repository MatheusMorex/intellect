import { MoreHorizontal, Pencil, Plus } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChecklistBadge, DueBadge, MetricBadge } from "@/components/ds/badges";
import { LabelChip } from "@/components/ds/label-chip";
import { cn } from "@/lib/utils";

// Frente do card e coluna de lista (components.md, "Kanban"). O arrastar e soltar
// (@dnd-kit) entra no build do quadro; aqui ficam a forma e os estados.

export type CardPreview = {
  title: string;
  href?: string;
  cover?: string; // cor de etiqueta, ex.: "orange"
  labels?: { color: string; name?: string }[];
  due?: { at: Date; complete?: boolean };
  checklist?: { done: number; total: number };
  metric?: { label: string; value: string | null; trend?: "up" | "down" };
  members?: { initials: string; color: string; name: string }[];
  done?: boolean;
};

export function KanbanCard({
  card,
  now,
  compactLabels = true,
  demoState,
}: {
  card: CardPreview;
  now: Date;
  compactLabels?: boolean;
  demoState?: "hover" | "focus" | "dragging";
}) {
  return (
    <article
      className={cn(
        "group relative grid gap-1.5 rounded-md bg-card px-3 py-2 shadow-card",
        "hover:ring-1 hover:ring-input focus-within:ring-2 focus-within:ring-ring",
        demoState === "hover" && "ring-1 ring-input",
        demoState === "focus" && "ring-2 ring-ring ring-offset-2 ring-offset-muted",
        demoState === "dragging" && "rotate-2 shadow-pop motion-reduce:rotate-0",
      )}
    >
      {card.cover && (
        <div
          aria-hidden="true"
          className="-mx-3 -mt-2 mb-0.5 h-8 rounded-t-md"
          style={{ background: `var(--ds-label-${card.cover})` }}
        />
      )}
      {card.labels && card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <LabelChip key={label.color + label.name} color={label.color} name={label.name} compact={compactLabels} />
          ))}
        </div>
      )}
      <div className="flex items-start gap-2 pr-6">
        {card.done !== undefined && (
          <span
            aria-hidden="true"
            className={cn(
              "relative z-10 mt-0.5 size-4 shrink-0 rounded-full border",
              card.done ? "border-success bg-success" : "border-input",
            )}
          />
        )}
        {/* O link cobre o card inteiro; os botões ficam por cima dele. */}
        <a href={card.href ?? "#"} className="text-sm outline-none after:absolute after:inset-0 after:rounded-md">
          {card.title}
        </a>
      </div>
      {(card.due || card.checklist || card.metric || card.members) && (
        <div className="flex flex-wrap items-center gap-1">
          {card.due && <DueBadge due={card.due.at} complete={card.due.complete} now={now} />}
          {card.checklist && <ChecklistBadge {...card.checklist} />}
          {card.metric && <MetricBadge {...card.metric} period="nos últimos 7 dias" />}
          {card.members && (
            <div className="ml-auto flex -space-x-1">
              {card.members.map((member) => (
                <Avatar key={member.initials} className="size-6 ring-2 ring-card" title={member.name}>
                  <AvatarFallback
                    className="text-[10px] font-semibold"
                    style={{ background: `var(--ds-label-${member.color}-bold)`, color: "var(--ds-label-text-bold)" }}
                  >
                    {member.initials}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          )}
        </div>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Editar ${card.title}`}
        className={cn(
          "absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          demoState === "hover" && "opacity-100",
        )}
      >
        <Pencil aria-hidden="true" />
      </Button>
    </article>
  );
}

export function ListColumn({
  name,
  count,
  children,
  color,
}: {
  name: string;
  count: number;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <section
      aria-label={`Lista ${name}`}
      className="grid w-list shrink-0 content-start gap-2 rounded-lg bg-muted p-2"
      style={color ? { background: `var(--ds-label-${color}-subtle)` } : undefined}
    >
      <header className="flex items-center gap-2 px-1 pt-1">
        <h3 className="flex-1 truncate text-sm font-semibold">{name}</h3>
        <span className="text-xs text-muted-foreground tabular">{count}</span>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações da lista ${name}`}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </header>
      {children}
      <Button variant="ghost" className="justify-start text-muted-foreground">
        <Plus aria-hidden="true" />
        Adicionar card
      </Button>
    </section>
  );
}

export function DropPlaceholder() {
  return <div aria-hidden="true" className="h-14 rounded-md border border-dashed border-input" />;
}
