"use client";

import { format, parseISO } from "date-fns";
import { CalendarDays, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { DateRange } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PERIOD_PRESETS, type PeriodId } from "@/lib/periods";
import { cn } from "@/lib/utils";

// Seletor de período (components.md): atalhos à esquerda e calendário de
// intervalo para o personalizado. O período vai para a URL (?periodo=7d ou
// ?periodo=personalizado&de=…&ate=…), então um link abre a mesma visão.
// Os Painéis passam os atalhos deles em `presets` (Esta quinzena, Este trimestre...).
export function PeriodFilter({
  period,
  timezoneLabel = "Horário de Brasília",
  presets: basePresets = PERIOD_PRESETS,
  extraPresets = [],
}: {
  period: { id: PeriodId | string; label: string; description: string; range: { from: string; to: string }; today: string };
  timezoneLabel?: string;
  presets?: readonly { id: string; label: string }[];
  extraPresets?: readonly { id: string; label: string }[];
}) {
  const { id: value, label, description, range, today } = period;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<DateRange | undefined>({ from: parseISO(range.from), to: parseISO(range.to) });

  function go(update: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(update)) {
      if (v == null) query.delete(k);
      else query.set(k, v);
    }
    setOpen(false);
    startTransition(() => router.replace(`${pathname}?${query.toString()}`, { scroll: false }));
  }

  const presets = [...basePresets, ...extraPresets];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft({ from: parseISO(range.from), to: parseISO(range.to) });
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start", pending && "opacity-70")} aria-busy={pending || undefined}>
          <CalendarDays aria-hidden="true" className="text-muted-foreground" />
          {label}
          {/* No celular as datas por extenso não cabem ao lado do botão: aparecem dentro do calendário. */}
          <span className="hidden font-normal text-muted-foreground sm:inline">· {description}</span>
          <ChevronDown aria-hidden="true" className="ml-1 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-auto flex-col gap-3 p-3 sm:flex-row">
        <div role="radiogroup" aria-label="Atalhos de período" className="grid content-start gap-0.5 sm:w-44">
          {presets.map((p) => (
            <Button
              key={p.id}
              role="radio"
              aria-checked={value === p.id}
              variant="ghost"
              size="sm"
              className={cn("justify-start", value === p.id && "bg-primary-subtle text-primary hover:bg-primary-subtle")}
              onClick={() => go({ periodo: p.id, de: null, ate: null })}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-2">
          <p className="px-1 text-xs font-semibold text-muted-foreground">Personalizado</p>
          <Calendar
            mode="range"
            locale={ptBR}
            numberOfMonths={1}
            selected={draft}
            onSelect={setDraft}
            defaultMonth={draft?.to}
            disabled={{ after: parseISO(today) }}
          />
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs text-muted-foreground">{timezoneLabel}</span>
            <Button
              size="sm"
              disabled={!draft?.from}
              onClick={() => {
                if (!draft?.from) return;
                const from = format(draft.from, "yyyy-MM-dd");
                const to = format(draft.to ?? draft.from, "yyyy-MM-dd");
                go({ periodo: "personalizado", de: from, ate: to });
              }}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
