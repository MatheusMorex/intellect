"use client";

import { CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIOD_PRESETS, type PeriodId } from "@/lib/periods";
import { cn } from "@/lib/utils";

// Seletor de período (components.md): o período vai para a URL (?periodo=7d),
// então um link abre a mesma visão. "Personalizado" entra numa próxima etapa.
export function PeriodFilter({ value, description }: { value: PeriodId; description: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const query = new URLSearchParams(params.toString());
        query.set("periodo", next);
        startTransition(() => router.replace(`${pathname}?${query.toString()}`, { scroll: false }));
      }}
    >
      <SelectTrigger aria-label="Período" className={cn("min-w-56", pending && "opacity-70")} aria-busy={pending || undefined}>
        <CalendarDays aria-hidden="true" className="text-muted-foreground" />
        <SelectValue />
        <span className="text-muted-foreground">· {description}</span>
      </SelectTrigger>
      <SelectContent align="start">
        {PERIOD_PRESETS.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
