"use client";

import { MessageSquareText } from "lucide-react";
import { useState } from "react";

import { HelpTip } from "@/components/ds/help-tip";
import { Button } from "@/components/ui/button";
import type { Sentence } from "@/lib/ad-insights";
import { OUTLINE_BOX } from "@/lib/surfaces";
import { cn } from "@/lib/utils";

// Balões de leitura dos anúncios (lib/ad-insights.ts): contorno e fundo de
// vidro fosco, com os números em destaque. Mostra os 3 que mais gastaram e
// abre o resto num clique.

const FIRST = 3;

type Item = { id: string; name: string; sentences: Sentence[] };

function Balloon({ item }: { item: Item }) {
  return (
    <li className={cn("grid content-start gap-2 p-4", OUTLINE_BOX, "rounded-2xl rounded-bl-sm")}>
      <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
        <MessageSquareText aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="truncate" title={item.name}>
          {item.name}
        </span>
      </p>
      <div className="grid gap-1.5 text-sm leading-relaxed text-pretty text-muted-foreground">
        {item.sentences.map((sentence, i) => (
          <p key={i}>
            {sentence.map((part, j) =>
              typeof part === "string" ? (
                part
              ) : (
                <strong key={j} className="font-semibold text-foreground">
                  {part.strong}
                </strong>
              ),
            )}
          </p>
        ))}
      </div>
    </li>
  );
}

export function AdInsightBalloons({ items, noun }: { items: Item[]; noun: string }) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return null;
  const shown = showAll ? items : items.slice(0, FIRST);
  return (
    <section aria-labelledby="leitura-anuncios" className="grid gap-3">
      <div className="grid gap-1">
        <div className="flex items-center gap-1">
          <h2 id="leitura-anuncios" className="text-base font-semibold">
            Leitura dos anúncios
          </h2>
          <HelpTip topic="leitura-anuncios" className="size-5" />
        </div>
        <p className="text-sm text-muted-foreground">O que os números de cada {noun} estão dizendo neste período, do que mais gastou para o que menos gastou.</p>
      </div>
      <ul className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {shown.map((item) => (
          <Balloon key={item.id} item={item} />
        ))}
      </ul>
      {items.length > FIRST && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
            {showAll ? "Mostrar só os 3 primeiros" : `Ver a leitura de todos (${items.length})`}
          </Button>
        </div>
      )}
    </section>
  );
}
