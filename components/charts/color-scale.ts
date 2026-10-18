// Escala de cores do treemap quando a cor mostra uma segunda métrica (o ROAS,
// por exemplo). Vai do laranja ao roxo da paleta: as duas pontas se distinguem
// também com daltonismo (não é vermelho × verde), e cada retângulo traz o
// número no rótulo e na dica, então a cor nunca é a única informação.
//
// O meio da escala é o valor do gráfico inteiro (o ROAS de tudo junto): quem
// fica abaixo puxa para um lado e quem fica acima, para o outro. O roxo fica do
// lado em que a métrica vai bem pelo sentido dela (ROAS alto, CPA baixo), como
// as cores da variação nos cartões. Métrica sem sentido (o gasto) vai do roxo
// claro ao roxo forte.
//
// Função pura, sem navegador: os testes rodam com `npm test`.

import type { MetricDirection } from "@/lib/charts/catalog";

import type { ChartTheme } from "./use-chart-theme";

type Rgb = [number, number, number];

/** #rgb, #rrggbb, rgb() ou rgba(); null se não reconhecer. */
export function parseColor(color: string): Rgb | null {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  }
  const rgb = color.trim().match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

const toHex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const clamp = (t: number) => (Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5);

/** Mistura duas cores (t = 0: a primeira; t = 1: a segunda). */
export function mixColors(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return t < 0.5 ? a : b;
  return toHex(x.map((v, i) => v + (y[i] - v) * clamp(t)) as Rgb);
}

/**
 * Onde o valor fica na escala (0 a 1), com o meio (0,5) no valor do gráfico
 * inteiro. Cada lado usa a própria faixa, e a distância até o meio passa por
 * raiz quadrada: diferenças pequenas perto do meio (Meta 2,0x e Google 2,3x)
 * ainda aparecem na cor, sem que um anúncio fora da curva apague o resto.
 */
export function scalePosition(value: number, min: number, mid: number, max: number): number {
  const center = Math.min(max, Math.max(min, mid));
  if (value < center) return clamp(0.5 - 0.5 * Math.sqrt(Math.min(1, (center - value) / (center - min))));
  if (value > center) return clamp(0.5 + 0.5 * Math.sqrt(Math.min(1, (value - center) / (max - center))));
  return 0.5;
}

/** Cor de uma posição da escala (0 = o menor valor do gráfico, 1 = o maior). */
export function colorScale(theme: ChartTheme, direction: MetricDirection): (t: number) => string {
  const good = theme.palette[0] || theme.text;
  const weak = theme.palette[1] || theme.muted;
  if (direction === "neutral") {
    const light = mixColors(good, theme.surface, 0.7);
    return (t) => mixColors(light, good, t);
  }
  const [low, high] = direction === "up" ? [weak, good] : [good, weak];
  return (t) => mixColors(low, high, t);
}
