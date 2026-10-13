"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// Seletor de tema (components.md): Claro, Escuro, Automático.
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  // O tema salvo só existe no navegador: no servidor, nenhuma opção aparece marcada.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label="Tema"
      value={mounted ? (theme ?? "") : ""}
      onValueChange={(value) => value && setTheme(value)}
    >
      <ToggleGroupItem value="light" aria-label="Tema claro">
        <Sun aria-hidden="true" />
        <span className="hidden sm:inline">Claro</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Tema escuro">
        <Moon aria-hidden="true" />
        <span className="hidden sm:inline">Escuro</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="system" aria-label="Tema automático">
        <Monitor aria-hidden="true" />
        <span className="hidden sm:inline">Automático</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
