"use client";

import { useCallback, useSyncExternalStore } from "react";

// Lista guardada no navegador (colunas visíveis de uma tabela, por exemplo).
// Só serve a quem está vendo; sem localStorage, vale o padrão.

const EVENT = "itl-list-change";
const cache = new Map<string, { raw: string | null; value: string[] }>();

function read(key: string, fallback: string[]): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value = fallback;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) value = parsed;
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

export function useStoredList(key: string, fallback: string[]): [string[], (next: string[] | null) => void] {
  const fallbackKey = fallback.join("|");
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
    (next: string[] | null) => {
      try {
        if (next == null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // sem armazenamento
      }
      window.dispatchEvent(new Event(EVENT));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fallbackKey representa o padrão
    [key, fallbackKey],
  );
  return [value, set];
}
