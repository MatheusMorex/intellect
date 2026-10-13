"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// Escuta /api/events e recarrega o quadro quando outra pessoa muda algo.
// Enquanto `paused` (por exemplo, no meio de um arrastar), guarda o aviso e
// recarrega quando terminar.
export function useBoardLive(boardId: string, stamp: string, paused: boolean) {
  const router = useRouter();
  const known = useRef(stamp);
  const pending = useRef(false);
  const pausedRef = useRef(paused);

  useEffect(() => {
    known.current = stamp;
  }, [stamp]);

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused && pending.current) {
      pending.current = false;
      router.refresh();
    }
  }, [paused, router]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(`/api/events?boardId=${encodeURIComponent(boardId)}`);
    const onBoard = (event: MessageEvent) => {
      try {
        const { stamp: next } = JSON.parse(event.data) as { stamp: string };
        if (next === known.current) return;
        known.current = next;
      } catch {
        return;
      }
      if (pausedRef.current) pending.current = true;
      else router.refresh();
    };
    source.addEventListener("board", onBoard as EventListener);
    return () => {
      source.removeEventListener("board", onBoard as EventListener);
      source.close();
    };
  }, [boardId, router]);
}
