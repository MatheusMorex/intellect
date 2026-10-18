"use client";

import { format, parseISO } from "date-fns";
import { CalendarRange } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { DateRange } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { msg } from "@/lib/charts/messages";
import { COMPARE_MODES, COMPARE_PARAM, GRANULARITIES, GRANULARITY_PARAM, type CompareMode, type Granularity } from "@/lib/charts/options";
import { cn } from "@/lib/utils";

// Seletores dos Painéis: agrupar por (hora, dia, semana...) e comparar com
// (período anterior, ano anterior, datas escolhidas). Tudo vai para o endereço
// da página: um link abre a mesma visão, e a escolha vale só para quem está vendo.

const AUTO = "auto";

export function PanelControls({
  granularity,
  granularityChosen,
  autoGranularity,
  allowed,
  compareMode,
  compareRange,
  today,
}: {
  granularity: Granularity;
  granularityChosen: boolean;
  autoGranularity: Granularity;
  allowed: Granularity[];
  compareMode: CompareMode;
  compareRange: { from: string; to: string } | null;
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [datesOpen, setDatesOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(
    compareRange ? { from: parseISO(compareRange.from), to: parseISO(compareRange.to) } : undefined,
  );

  function go(update: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(update)) {
      if (v == null) query.delete(k);
      else query.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${query.toString()}`, { scroll: false }));
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-70")} aria-busy={pending || undefined}>
      <Select value={granularityChosen ? GRANULARITY_PARAM[granularity] : AUTO} onValueChange={(v) => go({ agrupar: v === AUTO ? null : v })}>
        <SelectTrigger aria-label={msg.panel.granularity}>
          <span className="text-muted-foreground">{msg.panel.granularity}:</span>
          {/* Texto já pronto: aparece antes de o seletor terminar de carregar no navegador. */}
          <SelectValue>{granularityChosen ? msg.granularity[granularity] : msg.panel.automatic(msg.granularity[autoGranularity])}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO}>{msg.panel.automatic(msg.granularity[autoGranularity])}</SelectItem>
          {GRANULARITIES.map((g) => (
            <SelectItem key={g} value={GRANULARITY_PARAM[g]} disabled={!allowed.includes(g)}>
              {msg.granularity[g]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={datesOpen} onOpenChange={setDatesOpen}>
        <PopoverAnchor asChild>
          <div className="flex items-center gap-2">
            <Select
              value={COMPARE_PARAM[compareMode]}
              onValueChange={(v) => {
                if (v === COMPARE_PARAM.custom) setDatesOpen(true);
                else go({ comparar: v, cde: null, cate: null });
              }}
            >
              <SelectTrigger aria-label={msg.panel.compare}>
                <span className="text-muted-foreground">{msg.panel.compare}:</span>
                <SelectValue>{msg.compare[compareMode]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {COMPARE_MODES.map((m) => (
                  <SelectItem key={m} value={COMPARE_PARAM[m]}>
                    {msg.compare[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {compareMode === "custom" && (
              <Button variant="outline" size="icon" aria-label={msg.panel.compareDates} onClick={() => setDatesOpen(true)}>
                <CalendarRange aria-hidden="true" />
              </Button>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent align="end" className="grid w-auto gap-2 p-3">
          <p className="px-1 text-xs font-semibold text-muted-foreground">{msg.panel.compareDates}</p>
          <Calendar
            mode="range"
            locale={ptBR}
            numberOfMonths={1}
            selected={draft}
            onSelect={setDraft}
            defaultMonth={draft?.to}
            disabled={{ after: parseISO(today) }}
          />
          <div className="flex justify-end px-1">
            <Button
              size="sm"
              disabled={!draft?.from}
              onClick={() => {
                if (!draft?.from) return;
                setDatesOpen(false);
                go({
                  comparar: COMPARE_PARAM.custom,
                  cde: format(draft.from, "yyyy-MM-dd"),
                  cate: format(draft.to ?? draft.from, "yyyy-MM-dd"),
                });
              }}
            >
              {msg.panel.compareDatesApply}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
