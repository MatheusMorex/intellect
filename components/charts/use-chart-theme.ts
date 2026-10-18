"use client";

import { useSyncExternalStore } from "react";

// Cores dos gráficos tiradas do tema do app (app/tokens.css): a paleta
// --ds-chart-1..8, o texto, as bordas e o fundo. Muda junto quando a pessoa
// troca o tema (data-theme), liga o modo para daltônicos (data-colorblind) ou
// quando o sistema troca entre claro e escuro.

export type ChartTheme = {
  palette: string[];
  text: string;
  muted: string;
  border: string;
  surface: string;
  good: string;
  bad: string;
  font: string;
  /** Modo para daltônicos: padrões nas colunas e formas diferentes nos pontos das linhas. */
  colorblind: boolean;
};

const DARK = "(prefers-color-scheme: dark)";

function read(): ChartTheme {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    palette: Array.from({ length: 8 }, (_, i) => v(`--ds-chart-${i + 1}`)),
    text: v("--ds-text"),
    muted: v("--ds-text-muted"),
    border: v("--ds-border"),
    surface: v("--ds-surface"),
    good: v("--ds-success"),
    bad: v("--ds-danger"),
    font: getComputedStyle(document.body).fontFamily,
    colorblind: root.dataset.colorblind === "on",
  };
}

// O mesmo objeto enquanto nada muda (useSyncExternalStore compara por referência).
let last: { key: string; theme: ChartTheme } | null = null;

function snapshot(): ChartTheme {
  const theme = read();
  const key = JSON.stringify(theme);
  if (last?.key !== key) last = { key, theme };
  return last.theme;
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK);
  const observer = new MutationObserver(onChange);
  media.addEventListener("change", onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-colorblind", "class", "style"] });
  return () => {
    media.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

/** Tema atual dos gráficos (null no servidor: o gráfico só é desenhado no navegador). */
export function useChartTheme(): ChartTheme | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
