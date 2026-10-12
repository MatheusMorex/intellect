import { AlertCircle, ArrowDown, ArrowUp, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EMPTY } from "@/lib/format";
import { cn } from "@/lib/utils";

// Card de métrica (components.md, "Card de métrica (KPI)").
// polarity diz se subir é bom (faturamento, lucro, ROAS) ou ruim (gasto, CPA).

type Delta = { text: string; direction: "up" | "down" };

export function KpiCard({
  label,
  value,
  negative = false,
  delta,
  polarity = "up-good",
  formula,
  state = "ready",
  size = "md",
  onRetry,
}: {
  label: string;
  value?: string;
  negative?: boolean;
  delta?: Delta;
  polarity?: "up-good" | "down-good" | "neutral";
  formula?: string;
  state?: "ready" | "loading" | "empty" | "error";
  size?: "md" | "sm";
  onRetry?: () => void;
}) {
  const good = !delta || polarity === "neutral" ? null : (delta.direction === "up") === (polarity === "up-good");
  const deltaColor = good == null ? "text-muted-foreground" : good ? "text-success" : "text-danger";
  const DeltaIcon = delta?.direction === "down" ? ArrowDown : ArrowUp;
  const spoken =
    state === "ready" && value
      ? `${label}: ${value}${delta ? `, ${delta.text} ${delta.direction === "up" ? "maior" : "menor"} que no período anterior` : ""}`
      : undefined;

  return (
    <div
      role="group"
      aria-label={spoken ?? label}
      aria-busy={state === "loading" || undefined}
      className={cn("rounded-lg border bg-card text-card-foreground", size === "md" ? "p-4" : "p-3")}
    >
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {formula && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="rounded-sm" aria-label={`Como ${label} é calculado`}>
                <Info aria-hidden="true" className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{formula}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {state === "loading" && (
        <>
          <span className="sr-only">Carregando…</span>
          <Skeleton className={cn("my-1", size === "md" ? "h-10 w-3/5" : "h-8 w-1/2")} />
          <Skeleton className="h-3 w-4/5" />
        </>
      )}

      {state === "empty" && (
        <>
          <p className={cn("my-1 font-bold tabular", size === "md" ? "text-display" : "text-xl")} aria-label="sem dados">
            {EMPTY}
          </p>
          <p className="text-xs text-muted-foreground">Sem vendas no período</p>
        </>
      )}

      {state === "error" && (
        <div className="mt-2 flex flex-col items-start gap-2">
          <p className="flex items-center gap-1.5 text-sm text-danger">
            <AlertCircle aria-hidden="true" className="size-4" />
            Não deu para carregar
          </p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Tentar de novo
          </Button>
        </div>
      )}

      {state === "ready" && (
        <>
          <p
            className={cn(
              "my-1 font-bold tabular",
              size === "md" ? "text-display" : "text-xl",
              negative && "text-danger",
            )}
          >
            {value}
          </p>
          {delta && (
            <p className={cn("flex items-center gap-1 text-xs", deltaColor)}>
              <DeltaIcon aria-hidden="true" className="size-3" />
              {delta.text} vs. período anterior
            </p>
          )}
        </>
      )}
    </div>
  );
}
