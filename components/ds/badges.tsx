import { AlertTriangle, ArrowDown, ArrowUp, Check, CheckSquare, Clock } from "lucide-react";

import { shortDate, ZERO_RATIO } from "@/lib/format";
import { cn } from "@/lib/utils";

// Badges da frente do card e pills de status (components.md, "Badge" e "Pill de status").

const badgeBase = "inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-xs font-medium tabular whitespace-nowrap";

export type DueState = "normal" | "near" | "over" | "done";

export function dueState(due: Date, complete: boolean, now: Date): DueState {
  if (complete) return "done";
  const left = due.getTime() - now.getTime();
  if (left < 0) return "over";
  if (left < 24 * 60 * 60 * 1000) return "near";
  return "normal";
}

const DUE_STYLE: Record<DueState, string> = {
  normal: "bg-muted text-muted-foreground",
  near: "bg-warning-subtle text-warning",
  over: "bg-destructive text-on-danger",
  done: "bg-success text-on-success",
};

const DUE_SPOKEN: Record<DueState, string> = {
  normal: "",
  near: ", vence em menos de 24 horas",
  over: ", vencida",
  done: ", concluída",
};

export function DueBadge({ due, complete = false, now }: { due: Date; complete?: boolean; now: Date }) {
  const state = dueState(due, complete, now);
  const Icon = state === "over" ? AlertTriangle : state === "done" ? Check : Clock;
  const text = shortDate(due);
  return (
    <span className={cn(badgeBase, DUE_STYLE[state])} aria-label={`Entrega ${text}${DUE_SPOKEN[state]}`}>
      <Icon aria-hidden="true" className="size-3" />
      {text}
    </span>
  );
}

export function ChecklistBadge({ done, total }: { done: number; total: number }) {
  const complete = total > 0 && done === total;
  return (
    <span
      className={cn(badgeBase, complete ? "bg-success-subtle text-success" : "bg-muted text-muted-foreground")}
      aria-label={`Checklist ${done} de ${total}`}
    >
      <CheckSquare aria-hidden="true" className="size-3" />
      {done}/{total}
    </span>
  );
}

// Badge de métrica do card ligado a uma campanha. trend diz se o resultado é bom
// (up) ou ruim (down); sem valor, mostra 0,00 em cinza, sem seta.
export function MetricBadge({
  label,
  value,
  trend,
  period,
}: {
  label: string;
  value: string | null;
  trend?: "up" | "down";
  period?: string;
}) {
  const style =
    value == null
      ? "bg-muted text-muted-foreground"
      : trend === "down"
        ? "bg-danger-subtle text-danger"
        : "bg-success-subtle text-success";
  const Icon = value == null ? null : trend === "down" ? ArrowDown : ArrowUp;
  const spoken = `${label} ${value ?? "sem dados"}${period ? ` ${period}` : ""}`;
  return (
    <span className={cn(badgeBase, style)} aria-label={spoken}>
      {Icon && <Icon aria-hidden="true" className="size-3" />}
      {label} {value ?? ZERO_RATIO}
    </span>
  );
}

export type PillStatus =
  | "paid"
  | "pending"
  | "refused"
  | "refunded"
  | "chargeback"
  | "test"
  | "connected"
  | "expiring"
  | "error"
  | "waiting";

const PILL: Record<PillStatus, { label: string; className: string }> = {
  paid: { label: "Pago", className: "bg-success-subtle text-success" },
  pending: { label: "Pendente", className: "bg-warning-subtle text-warning" },
  refused: { label: "Recusado", className: "bg-muted text-muted-foreground" },
  refunded: { label: "Reembolsado", className: "bg-muted text-muted-foreground" },
  chargeback: { label: "Chargeback", className: "bg-danger-subtle text-danger" },
  test: { label: "Teste", className: "border border-dashed border-input text-muted-foreground" },
  connected: { label: "Conectada", className: "bg-success-subtle text-success" },
  expiring: { label: "Expira em breve", className: "bg-warning-subtle text-warning" },
  error: { label: "Erro na conexão", className: "bg-danger-subtle text-danger" },
  waiting: { label: "Aguardando", className: "bg-muted text-muted-foreground" },
};

export function StatusPill({ status, children }: { status: PillStatus; children?: React.ReactNode }) {
  const pill = PILL[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        pill.className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children ?? pill.label}
    </span>
  );
}
