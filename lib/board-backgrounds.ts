import type { CSSProperties } from "react";

// Fundos de quadro: 25 cores (as 10 fortes das etiquetas e mais 15) ou uma
// imagem enviada do computador. Todas as cores têm contraste de pelo menos
// 4,5:1 com o texto branco do nome do quadro e do cabeçalho.

export const BOARD_COLORS = [
  { key: "purple", name: "Roxo", hex: "#2d1e8f" },
  { key: "blue", name: "Azul", hex: "#2a64c9" },
  { key: "sky", name: "Céu", hex: "#1d7489" },
  { key: "green", name: "Verde", hex: "#1e7a4c" },
  { key: "lime", name: "Lima", hex: "#4b7511" },
  { key: "yellow", name: "Amarelo", hex: "#856700" },
  { key: "orange", name: "Laranja", hex: "#b0500f" },
  { key: "red", name: "Vermelho", hex: "#c2352e" },
  { key: "pink", name: "Rosa", hex: "#b03f86" },
  { key: "black", name: "Cinza", hex: "#3b3850" },
  { key: "indigo", name: "Índigo", hex: "#4338ca" },
  { key: "violet", name: "Violeta", hex: "#6d28d9" },
  { key: "navy", name: "Azul-marinho", hex: "#1e2f5c" },
  { key: "steel", name: "Azul-aço", hex: "#2c5a7a" },
  { key: "teal", name: "Petróleo", hex: "#0f5f5c" },
  { key: "emerald", name: "Esmeralda", hex: "#04704f" },
  { key: "moss", name: "Musgo", hex: "#3d5a2a" },
  { key: "coffee", name: "Café", hex: "#6b4226" },
  { key: "wine", name: "Vinho", hex: "#7a1f3d" },
  { key: "cherry", name: "Cereja", hex: "#9f1239" },
  { key: "magenta", name: "Magenta", hex: "#a1237f" },
  { key: "plum", name: "Ameixa", hex: "#6b2a5c" },
  { key: "slate", name: "Ardósia", hex: "#475569" },
  { key: "graphite", name: "Grafite", hex: "#2b2f36" },
  { key: "midnight", name: "Meia-noite", hex: "#111827" },
] as const;

export type BoardColorKey = (typeof BOARD_COLORS)[number]["key"];

export const BOARD_COLOR_KEYS = BOARD_COLORS.map((c) => c.key) as unknown as readonly [BoardColorKey, ...BoardColorKey[]];

export const DEFAULT_BOARD_COLOR: BoardColorKey = "purple";

export function isBoardColor(key: string): key is BoardColorKey {
  return BOARD_COLORS.some((c) => c.key === key);
}

export function boardColorHex(key: string) {
  return (BOARD_COLORS.find((c) => c.key === key) ?? BOARD_COLORS[0]).hex;
}

/** Fundo do quadro como as telas recebem: a cor ou o endereço da imagem. */
export type BoardBackgroundView = { type: "color"; value: string } | { type: "image"; url: string };

/** Estilo do fundo. A imagem cobre a área toda; a cor escura por baixo aparece enquanto ela carrega. */
export function boardBackgroundStyle(bg: BoardBackgroundView): CSSProperties {
  if (bg.type === "image") {
    return {
      backgroundColor: "#3b3850",
      backgroundImage: `url("${bg.url}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { background: boardColorHex(bg.value) };
}
