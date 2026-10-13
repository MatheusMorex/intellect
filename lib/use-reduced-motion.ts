"use client";

import { useSyncExternalStore } from "react";

// Reduzir animações: preferência do sistema ou do perfil (data-motion="reduced" no <html>).
// Serve para animações feitas em JavaScript (gráficos, arrastar); as de CSS já param sozinhas.

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  const observer = new MutationObserver(onChange);
  media.addEventListener("change", onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => {
    media.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

function snapshot() {
  return window.matchMedia(QUERY).matches || document.documentElement.dataset.motion === "reduced";
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
