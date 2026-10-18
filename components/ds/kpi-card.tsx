import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp } from "lucide-react";

import { HelpTip } from "@/components/ds/help-tip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ZERO_RATIO } from "@/lib/format";
import { OUTLINE_BOX } from "@/lib/surfaces";
import { cn } from "@/lib/utils";

// Card de métrica (components.md, "Card de métrica (KPI)").
// Sem cor própria: contorno de 2 px e fundo de vidro fosco, para os números se
// destacarem sobre qualquer plano de fundo. polarity diz se subir é bom
// (faturamento, lucro, ROAS) ou ruim (gasto, CPA).
// Explicação em dois lugares: parando o mouse 3 segundos em cima do card, ou no
// "?" (que funciona também no toque e no teclado). Cada card tem o próprio
// provider: sem ele, a dica do card vizinho abriria na hora logo depois de
// outra fechar (skipDelay do provider global) e ficaria aberta enquanto o mouse
// passa por cima dela, cobrindo os cards de cima.

/** Tempo com o mouse parado em cima do card até a explicação aparecer. */
export const KPI_EXPLAIN_DELAY_MS = 3000;

/** flat: sem seta (variação "Novo" ou zerada). */
type Delta = { text: string; direction: "up" | "down" | "flat" };

function Explanation({ explain, purpose, formula }: { explain?: string; purpose?: string; formula?: string }) {
  return (
    <>
      {explain && (
        <p>
          <span className="font-semibold text-foreground">O que é:</span> {explain}
        </p>
      )}
      {purpose && (
        <p>
          <span className="font-semibold text-foreground">Para que serve:</span> {purpose}
        </p>
      )}
      {formula && (
        <p>
          <span className="font-semibold text-foreground">Como é calculado:</span> {formula}.
        </p>
      )}
    </>
  );
}

export function KpiCard({
  label,
  value,
  negative = false,
  delta,
  polarity = "up-good",
  formula,
  explain,
  purpose,
  state = "ready",
  size = "md",
  onRetry,
  deltaSuffix = "vs. período anterior",
  deltaTone,
  caption,
  alert,
  children,
}: {
  label: string;
  value?: string;
  negative?: boolean;
  delta?: Delta;
  polarity?: "up-good" | "down-good" | "neutral";
  formula?: string;
  /** O que o número quer dizer, em linguagem simples. */
  explain?: string;
  /** Para que a métrica serve na hora de decidir. */
  purpose?: string;
  state?: "ready" | "loading" | "empty" | "error";
  size?: "md" | "sm";
  onRetry?: () => void;
  /** Com o que a variação compara ("vs. mesmo período do ano anterior"). */
  deltaSuffix?: string;
  /** Cor da variação já decidida (Painéis: pelo sentido da métrica); sem ela, sai de polarity. */
  deltaTone?: "good" | "bad" | "neutral";
  /** Linha pequena embaixo do nome (o período, nos Painéis). */
  caption?: string;
  /** Cartão em alerta: o texto diz o limite que passou (ROAS abaixo de 1,00x). */
  alert?: string;
  /** Extras embaixo do valor: minigráfico de tendência, barra de meta. */
  children?: React.ReactNode;
}) {
  const good =
    deltaTone != null
      ? deltaTone === "neutral"
        ? null
        : deltaTone === "good"
      : !delta || polarity === "neutral" || delta.direction === "flat"
        ? null
        : (delta.direction === "up") === (polarity === "up-good");
  const deltaColor = good == null ? "text-muted-foreground" : good ? "text-success" : "text-danger";
  const DeltaIcon = delta?.direction === "down" ? ArrowDown : delta?.direction === "up" ? ArrowUp : null;
  const shown = state === "empty" ? (value ?? ZERO_RATIO) : value;
  const spokenDelta = !delta
    ? ""
    : delta.direction === "flat"
      ? `, ${delta.text} ${deltaSuffix}`
      : `, ${delta.text} ${delta.direction === "up" ? "maior" : "menor"} ${deltaSuffix.replace(/^vs\. /, "que no ")}`;
  const spoken =
    (state === "ready" || state === "empty") && shown ? `${label}: ${shown}${spokenDelta}${alert ? `. ${alert}` : ""}` : undefined;
  const hasExplanation = !!(formula || explain || purpose);

  const card = (
    <div
      role="group"
      aria-label={spoken ?? label}
      aria-busy={state === "loading" || undefined}
      className={cn("@container text-foreground", OUTLINE_BOX, size === "md" ? "p-4" : "p-3", alert && "border-danger")}
    >
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {hasExplanation && (
          <HelpTip title={label} className="-my-1 size-5">
            <Explanation explain={explain} purpose={purpose} formula={formula} />
          </HelpTip>
        )}
      </div>
      {caption && <p className="text-xs text-muted-foreground/80">{caption}</p>}

      {state === "loading" && (
        <>
          <span className="sr-only">Carregando…</span>
          <Skeleton className={cn("my-1", size === "md" ? "h-8 w-3/5 @xs:h-10" : "h-8 w-1/2")} />
          <Skeleton className="h-3 w-4/5" />
        </>
      )}

      {state === "empty" && (
        <>
          <p className={cn("my-1 font-bold whitespace-nowrap tabular", size === "md" ? "text-xl @xs:text-display" : "text-xl")}>{shown}</p>
          <p className="text-xs text-muted-foreground">Sem dados no período</p>
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
              // O valor fica numa linha só; em card estreito (menos de 320 px) usa o tamanho xl.
              "my-1 font-bold whitespace-nowrap tabular",
              size === "md" ? "text-xl @xs:text-display" : "text-xl",
              negative && "text-danger",
            )}
          >
            {value}
          </p>
          {delta && (
            <p className={cn("flex items-center gap-1 text-xs", deltaColor)}>
              {DeltaIcon && <DeltaIcon aria-hidden="true" className="size-3" />}
              {delta.text} {deltaSuffix}
            </p>
          )}
          {alert && (
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-danger">
              <AlertTriangle aria-hidden="true" className="size-3" />
              {alert}
            </p>
          )}
          {children}
        </>
      )}
    </div>
  );

  if (!hasExplanation) return card;
  return (
    <TooltipProvider delayDuration={KPI_EXPLAIN_DELAY_MS} skipDelayDuration={0} disableHoverableContent>
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="grid max-w-sm gap-1.5 rounded-lg border-2 border-input bg-popover/90 p-3 text-left text-sm leading-relaxed text-pretty text-muted-foreground shadow-pop backdrop-blur-md"
        >
          <p className="font-semibold text-foreground">{label}</p>
          <Explanation explain={explain} purpose={purpose} formula={formula} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
