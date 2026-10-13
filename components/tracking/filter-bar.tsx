"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

// Multiselect de filtro (components.md): "Produto: todos" / "Produto: 2"; aplica ao fechar.
function MultiFilter({ name, label, options, selected }: { name: string; label: string; options: Option[]; selected: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const [pending, startTransition] = useTransition();

  function apply(values: string[]) {
    const query = new URLSearchParams(params.toString());
    if (values.length && values.length < options.length) query.set(name, values.join(","));
    else query.delete(name);
    startTransition(() => router.replace(`${pathname}?${query.toString()}`, { scroll: false }));
  }

  const summary =
    selected.length === 0
      ? "todos"
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? "1")
        : `${selected.length} escolhidos`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(selected);
        else if (draft.join(",") !== selected.join(",")) apply(draft);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("max-w-72 justify-start", selected.length > 0 && "border-primary", pending && "opacity-70")}
          aria-busy={pending || undefined}
        >
          <span className="text-muted-foreground">{label}:</span>
          <span className="truncate">{summary}</span>
          <ChevronDown aria-hidden="true" className="ml-auto text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          {options.length > 6 && <CommandInput placeholder={`Buscar ${label.toLowerCase()}…`} />}
          <CommandList>
            <CommandEmpty>Nada encontrado</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const checked = draft.includes(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => setDraft((d) => (checked ? d.filter((x) => x !== o.value) : [...d, o.value]))}
                    aria-checked={checked}
                    role="option"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-4 place-items-center rounded-sm border border-input",
                        checked && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {checked && <Check className="size-3" />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
            <div className="flex justify-between gap-2 p-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(options.map((o) => o.value))}>
                Selecionar todos
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDraft([])}>
                Limpar
              </Button>
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({
  filters,
}: {
  filters: { name: string; label: string; options: Option[]; selected: string[] }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = filters.some((f) => f.selected.length > 0);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros">
      {filters.map((f) => (
        <MultiFilter key={f.name} {...f} />
      ))}
      {active && (
        <Button
          variant="ghost"
          onClick={() => {
            const query = new URLSearchParams(params.toString());
            for (const f of filters) query.delete(f.name);
            router.replace(`${pathname}?${query.toString()}`, { scroll: false });
          }}
        >
          <X aria-hidden="true" />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
