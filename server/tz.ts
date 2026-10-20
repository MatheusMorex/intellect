// Diferença entre o fuso do dashboard e o UTC, rápida. Converter cada pedido
// com o TZDate (que pergunta ao Intl a cada data) era o que mais pesava nos
// Painéis: ~6 s de 14 num painel de 22 gráficos (perfil da Fase 6).
//
// O deslocamento é guardado por fatia de 15 minutos: toda mudança de horário
// (horário de verão, troca de fuso) acontece num múltiplo de 15 minutos em UTC,
// porque os fusos de hoje são múltiplos de 15 minutos (+05:45 no Nepal, por
// exemplo) e as trocas são em horas cheias ou meias horas locais. Dentro de
// uma fatia, o deslocamento não muda.

import { tzOffset } from "@date-fns/tz";

import type { DateKey } from "@/server/store/types";

const SLICE_MS = 15 * 60_000;
/** Tamanho máximo de cada cache (por fuso): ~5 anos de fatias de 15 minutos. */
const MAX_ENTRIES = 200_000;
const caches = new Map<string, Map<number, number>>();

/** Minutos a somar ao UTC para ter a hora local do fuso, no instante (ms). */
export function offsetMinutes(ms: number, timezone: string): number {
  let cache = caches.get(timezone);
  if (!cache) caches.set(timezone, (cache = new Map()));
  const slice = Math.floor(ms / SLICE_MS);
  let offset = cache.get(slice);
  if (offset === undefined) {
    offset = tzOffset(timezone, new Date(slice * SLICE_MS));
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(slice, offset);
  }
  return offset;
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** O dia (aaaa-mm-dd) em que o instante (ms UTC) cai, no fuso. */
export function dayKeyAt(ms: number, timezone: string): DateKey {
  if (!Number.isFinite(ms)) throw new RangeError("Invalid time value");
  const local = new Date(ms + offsetMinutes(ms, timezone) * 60_000);
  return `${String(local.getUTCFullYear()).padStart(4, "0")}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`;
}
