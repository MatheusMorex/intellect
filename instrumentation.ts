// Roda uma vez quando o servidor sobe. No modo simulado, liga o relógio da
// automação (métricas, agendadas, prazos e lembretes a cada minuto).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AUTOMATION_CLOCK === "off") return;
  const { startClock } = await import("./server/automation/clock");
  startClock();
}
