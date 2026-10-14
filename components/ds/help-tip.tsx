"use client";

import { CircleHelp } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HELP, type HelpTopic } from "@/lib/help";
import { cn } from "@/lib/utils";

// Botão "?" com a explicação do que a pessoa está vendo. Abre com clique ou
// toque (funciona no celular, ao contrário de um tooltip de passar o mouse).
// O texto vem de lib/help.ts, num lugar só, ou direto por title e children.

export function HelpTip({
  topic,
  title,
  children,
  className,
  side = "bottom",
  align = "start",
}: {
  topic?: HelpTopic;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  const entry = topic ? HELP[topic] : null;
  const heading = title ?? entry?.title ?? "Ajuda";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Ajuda: ${heading}`}
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <CircleHelp aria-hidden="true" className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-[min(22rem,calc(100vw-2rem))] text-sm">
        <p className="font-semibold text-foreground">{heading}</p>
        <div className="mt-1.5 grid gap-1.5 leading-relaxed text-muted-foreground">
          {entry?.body.map((p) => <p key={p}>{p}</p>)}
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
