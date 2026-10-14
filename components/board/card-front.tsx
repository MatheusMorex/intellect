"use client";

import { AlignLeft, Check, MessageSquare } from "lucide-react";

import { ChecklistBadge, DueBadge, MetricBadge } from "@/components/ds/badges";
import { LabelChip } from "@/components/ds/label-chip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { roas } from "@/lib/format";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type { CardFront, LabelView, Person } from "@/server/data/boards";

// Frente do card (components.md, "Card (frente)"). Só desenha: arrastar, abrir
// e editar ficam com o BoardCanvas.

export function CardFrontView({
  card,
  labels,
  people,
  now,
  labelsExpanded,
  showComplete,
  showCovers,
  onToggleLabels,
  onToggleDone,
  className,
}: {
  card: CardFront;
  labels: LabelView[];
  people: Map<string, Person>;
  now: number;
  labelsExpanded: boolean;
  showComplete: boolean;
  showCovers: boolean;
  onToggleLabels?: () => void;
  onToggleDone?: () => void;
  className?: string;
}) {
  const cardLabels = card.labelIds.map((id) => labels.find((l) => l.id === id)).filter((l): l is LabelView => !!l && !!l.color);
  const members = card.memberIds.map((id) => people.get(id)).filter((p): p is Person => !!p);
  const full = showCovers && card.cover?.size === "full";
  const strip = showCovers && card.cover?.size === "strip";
  const hasBadges = card.dueAt || card.hasDescription || card.comments > 0 || card.checklist || card.metric || members.length;

  return (
    <div
      className={cn("grid gap-1.5 rounded-md bg-card px-3 py-2 text-left shadow-card", full && "pt-3 pb-2.5", className)}
      style={full && card.cover ? { background: `var(--ds-label-${card.cover.color})`, color: "var(--ds-label-text)" } : undefined}
    >
      {strip && card.cover && (
        <div aria-hidden="true" className="-mx-3 -mt-2 mb-0.5 h-8 rounded-t-md" style={{ background: `var(--ds-label-${card.cover.color})` }} />
      )}
      {cardLabels.length > 0 && (
        <div className="relative z-10 flex flex-wrap gap-1">
          {cardLabels.map((l) =>
            onToggleLabels ? (
              <button
                key={l.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLabels();
                }}
                className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={labelsExpanded ? "Mostrar etiquetas só com a cor" : "Mostrar o nome das etiquetas"}
                tabIndex={-1}
              >
                <LabelChip color={l.color!} name={l.name} compact={!labelsExpanded} />
              </button>
            ) : (
              <LabelChip key={l.id} color={l.color!} name={l.name} compact={!labelsExpanded} />
            ),
          )}
        </div>
      )}
      <div className="flex items-start gap-2">
        {showComplete && card.dueAt && (
          <button
            type="button"
            role="checkbox"
            aria-checked={card.dueComplete}
            aria-label={card.dueComplete ? "Marcar como não concluído" : "Marcar como concluído"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone?.();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "relative z-10 mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-ring",
              card.dueComplete ? "border-success bg-success text-on-success" : "border-input",
            )}
          >
            {card.dueComplete && <Check aria-hidden="true" className="size-3" />}
          </button>
        )}
        <span className={cn("min-w-0 text-sm break-words", card.dueComplete && showComplete && "text-muted-foreground")}>{card.name}</span>
      </div>
      {hasBadges ? (
        <div className="flex flex-wrap items-center gap-1">
          {card.dueAt && <DueBadge due={new Date(card.dueAt)} complete={card.dueComplete} now={new Date(now)} />}
          {card.hasDescription && (
            <span className="inline-flex h-5 items-center text-muted-foreground" aria-label="Tem descrição">
              <AlignLeft aria-hidden="true" className="size-3.5" />
            </span>
          )}
          {card.comments > 0 && (
            <span className="inline-flex h-5 items-center gap-0.5 text-xs text-muted-foreground tabular" aria-label={`${card.comments} comentários`}>
              <MessageSquare aria-hidden="true" className="size-3.5" />
              {card.comments}
            </span>
          )}
          {card.checklist && <ChecklistBadge done={card.checklist.done} total={card.checklist.total} />}
          {card.metric && (
            <span title={`${card.metric.targetName} · últimos 7 dias`}>
              <MetricBadge label="ROAS" value={roas(card.metric.value)} trend={card.metric.trend ?? undefined} period="nos últimos 7 dias" />
            </span>
          )}
          {members.length > 0 && (
            <span className="ml-auto flex -space-x-1" aria-label={`Membros: ${members.map((m) => m.name).join(", ")}`}>
              {members.slice(0, 3).map((m) => (
                <Avatar key={m.id} className="size-6 ring-2 ring-card" title={m.name}>
                  {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt="" className="object-cover" />}
                  <AvatarFallback className="text-[10px] font-semibold" style={{ background: `var(--ds-label-${m.avatarColor}-bold)`, color: "var(--ds-label-text-bold)" }}>
                    {initials(m.name)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {members.length > 3 && (
                <Avatar className="size-6 ring-2 ring-card">
                  <AvatarFallback className="bg-muted text-[10px] font-semibold text-muted-foreground">+{members.length - 3}</AvatarFallback>
                </Avatar>
              )}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
