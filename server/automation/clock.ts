// Relógio do modo simulado: a cada minuto roda o que venceu (regras de métrica,
// agendadas, por data de entrega e lembretes de prazo). No backend real isto
// vira jobs agendados (Vercel Cron ou Inngest); a lógica é a mesma, em engine.ts.

import { dueWork, hasWork, runDueWork } from "@/server/automation/engine";
import { mutate, readStore } from "@/server/store/db";

const EVERY_MS = 60_000;
const KEY = Symbol.for("intellect.automation-clock");

export function tick(now = new Date()) {
  // Só grava quando há algo a fazer (o arquivo do modo simulado é grande).
  if (!hasWork(dueWork(readStore(), now))) return null;
  return mutate((store) => runDueWork(store, now));
}

export function startClock() {
  const g = globalThis as unknown as Record<symbol, NodeJS.Timeout | undefined>;
  if (g[KEY]) return;
  const run = () => {
    try {
      tick();
    } catch (error) {
      console.error("[relógio da automação]", error);
    }
  };
  g[KEY] = setInterval(run, EVERY_MS);
  setTimeout(run, 15_000);
}
