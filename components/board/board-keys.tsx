"use client";

// Atalhos de uma tecla no quadro, no card (ou na lista) sob o mouse ou com o
// foco do teclado: N novo card na lista, E edição rápida, L etiquetas,
// M membros, D prazo, C arquivar. Desligáveis no perfil, como os outros.
// Qual card: o que está sob o mouse na hora da tecla; sem nenhum, o que tem o
// foco. Cards e listas se marcam com data-card-id e data-list-id.

import { createContext, useContext, useEffect, useMemo, useRef } from "react";

import { isTyping } from "@/components/shell/global-search";

export type CardKey = "e" | "l" | "m" | "d" | "c";
const CARD_KEYS = new Set<string>(["e", "l", "m", "d", "c"]);

type Registry = {
  /** Cada card diz o que fazer com a tecla; devolve a função que desfaz o registro. */
  card: (cardId: string, run: (key: CardKey) => void) => () => void;
  /** Cada lista abre o próprio "Adicionar card". */
  list: (listId: string, openComposer: () => void) => () => void;
};

const BoardKeysContext = createContext<Registry | null>(null);

/** O card e a lista da tecla: sob o mouse primeiro, depois o foco. */
function target() {
  const hovered = Array.from(document.querySelectorAll(":hover")).at(-1) ?? null;
  const focused = document.activeElement;
  const cardEl = hovered?.closest<HTMLElement>("[data-card-id]") ?? focused?.closest<HTMLElement>("[data-card-id]") ?? null;
  const listEl = cardEl?.closest<HTMLElement>("[data-list-id]") ?? hovered?.closest<HTMLElement>("[data-list-id]") ?? focused?.closest<HTMLElement>("[data-list-id]") ?? null;
  return { cardId: cardEl?.dataset.cardId ?? null, listId: listEl?.dataset.listId ?? null };
}

export function BoardKeys({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const cards = useRef(new Map<string, (key: CardKey) => void>());
  const lists = useRef(new Map<string, () => void>());

  const registry = useMemo<Registry>(
    () => ({
      card: (cardId, run) => {
        cards.current.set(cardId, run);
        return () => {
          if (cards.current.get(cardId) === run) cards.current.delete(cardId);
        };
      },
      list: (listId, open) => {
        lists.current.set(listId, open);
        return () => {
          if (lists.current.get(listId) === open) lists.current.delete(listId);
        };
      },
    }),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key !== "n" && !CARD_KEYS.has(key)) return;
      // Com uma janela ou um menu aberto, as teclas são dele.
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      const { cardId, listId } = target();
      const run = key === "n" ? listId && lists.current.get(listId) : cardId && cards.current.get(cardId);
      if (!run) return;
      e.preventDefault();
      if (key === "n") (run as () => void)();
      else (run as (key: CardKey) => void)(key as CardKey);
    };
    // Na captura: o lápis do card segura as teclas dele (stopPropagation) e o atalho não chegaria.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);

  return <BoardKeysContext.Provider value={registry}>{children}</BoardKeysContext.Provider>;
}

/** O registro dos atalhos do quadro (null fora do quadro). */
export function useBoardKeys() {
  return useContext(BoardKeysContext);
}
