// Números de anúncio do modo de teste que o seed não sorteava: formato do
// criativo, visualizações do vídeo (3 s e 75%) e alcance. Tudo determinístico
// (o mesmo anúncio e o mesmo dia dão sempre o mesmo número), sem usar o
// sorteio do seed, para não mudar os outros dados de exemplo.
//
// O alcance usa um modelo de saturação: com um público de P pessoas, I
// impressões alcançam P·(1 − e^(−I/P)) pessoas diferentes. Com as contas reais,
// o alcance do período vem pronto da API do Meta (ele não pode ser somado dia a dia).
//
// Funções puras; os testes ficam em tests/ad-insights.test.ts.

import type { AdFormat, DateKey } from "../store/types.ts";

/** Número entre 0 e 1 derivado do texto (FNV-1a de 32 bits). */
export function hash01(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

/** Formato pelo nome do criativo ("Vídeo depoimento", "UGC unboxing", "Carrossel benefícios", "Imagem cupom"). */
export function adFormatFromName(name: string): AdFormat {
  if (/v[íi]deo|ugc|reels?/i.test(name)) return "video";
  if (/carrossel|carousel/i.test(name)) return "carousel";
  if (/imagem|image|foto/i.test(name)) return "image";
  return null;
}

/** Visualizações de 3 s e até 75% de um dia de um anúncio em vídeo. Hook de 14% a 38% e hold de 7% a 29%, conforme o anúncio. */
export function simulatedVideoMetrics(adId: string, date: DateKey, impressions: number, format: AdFormat) {
  if (format !== "video" || impressions <= 0) return { videoViews3s: 0, videoP75Views: 0 };
  const hook = 0.14 + 0.24 * hash01(`${adId}:hook`);
  const hold = 0.07 + 0.22 * hash01(`${adId}:hold`);
  const noise = (k: string) => 0.9 + 0.2 * hash01(`${adId}:${date}:${k}`);
  const videoViews3s = Math.min(impressions, Math.round(impressions * hook * noise("hook")));
  const videoP75Views = Math.min(videoViews3s, Math.round(videoViews3s * hold * noise("hold")));
  return { videoViews3s, videoP75Views };
}

/** Tamanho do público de um anúncio no modo de teste: de 15 mil a 200 mil pessoas. */
export function simulatedAudience(adId: string): number {
  return Math.round(15_000 + 185_000 * hash01(`${adId}:publico`));
}

/** Pessoas diferentes alcançadas por `impressions` impressões num público de `audience` pessoas. */
export function reachFromImpressions(impressions: number, audience: number): number {
  if (impressions <= 0 || audience <= 0) return 0;
  return Math.min(impressions, Math.round(audience * (1 - Math.exp(-impressions / audience))));
}

/** Alcance de vários anúncios juntos: parte das pessoas vê mais de um deles (15% de sobreposição). */
export function combineReach(reaches: number[]): number {
  const positive = reaches.filter((r) => r > 0);
  if (positive.length === 0) return 0;
  if (positive.length === 1) return positive[0];
  const sum = positive.reduce((a, b) => a + b, 0);
  return Math.max(Math.max(...positive), Math.round(sum * 0.85));
}
