// Relógio da automação: a cada minuto roda o que venceu (regras de métrica,
// agendadas, por data de entrega e lembretes de prazo). A lógica é a mesma nos
// dois modos (engine.ts); no modo real, quem carrega e grava é server/live/clock.ts.

import { dueWork, hasWork, runDueWork } from "@/server/automation/engine";
import { tickLive } from "@/server/live/clock";
import { isLive } from "@/server/mode";
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
  // Uma volta por vez: no modo real a volta espera o banco e pode passar de um minuto.
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      if (isLive()) await tickLive();
      else tick();
    } catch (error) {
      console.error("[relógio da automação]", error);
    } finally {
      busy = false;
    }
  };
  g[KEY] = setInterval(run, EVERY_MS);
  setTimeout(run, 15_000);
}
