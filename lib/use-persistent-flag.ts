"use client";

import { useCallback, useSyncExternalStore } from "react";

// Preferência do navegador que só serve a quem está vendo (menu recolhido etc.).
// localStorage pode falhar (aba anônima, bloqueio): nesse caso vale o padrão.

const EVENT = "itl-flag-change";

/** Menu lateral recolhido (só os ícones). Uma escolha para todas as telas; o padrão é aberto. */
export const SIDEBAR_COLLAPSED_KEY = "itl-menu-recolhido";

function read(key: string, fallback: boolean) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

export function usePersistentFlag(key: string, fallback = false): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      window.addEventListener(EVENT, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(EVENT, onChange);
      };
    },
    () => read(key, fallback),
    () => fallback,
  );
  const set = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // sem armazenamento: a escolha vale só até recarregar
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
