import { cn } from "@/lib/utils";

// Minigráfico de tendência dos cartões de KPI: uma linha em SVG, sem biblioteca
// (o cartão aparece sem esperar o ECharts carregar). Ponto sem dado vira um
// buraco na linha; o trecho do período ainda em andamento fica tracejado.

const WIDTH = 100;
const HEIGHT = 28;
const PAD = 2;

type Point = { x: number; y: number };

export function Sparkline({
  values,
  partial,
  label,
  className,
}: {
  values: (number | null)[];
  /** Ponto ainda em andamento (hoje, este mês): o trecho até ele fica tracejado. */
  partial: boolean[];
  /** Descrição para leitores de tela ("Tendência por dia"). */
  label: string;
  className?: string;
}) {
  const known = values.filter((v): v is number => v != null);
  if (values.length < 2 || known.length === 0) return null;
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min;
  const step = (WIDTH - PAD * 2) / (values.length - 1);
  const point = (v: number, i: number): Point => ({
    x: PAD + i * step,
    // Tudo igual: linha no meio, em vez de grudada embaixo.
    y: span === 0 ? HEIGHT / 2 : PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2),
  });

  const solid: string[] = [];
  const dashed: string[] = [];
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (a == null || b == null) continue;
    const p = point(a, i - 1);
    const q = point(b, i);
    (partial[i] || partial[i - 1] ? dashed : solid).push(`M${p.x.toFixed(2)},${p.y.toFixed(2)}L${q.x.toFixed(2)},${q.y.toFixed(2)}`);
  }
  const lastIndex = values.findLastIndex((v) => v != null);
  const last = point(values[lastIndex]!, lastIndex);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("mt-2 h-7 w-full overflow-visible text-primary", className)}
    >
      <path d={solid.join("")} fill="none" stroke="currentColor" strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      <path
        d={dashed.join("")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
        opacity={0.7}
      />
      <circle cx={last.x} cy={last.y} r={1.6} fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
