import { KpiCard } from "@/components/ds/kpi-card";
import { Sparkline } from "@/components/charts/sparkline";
import { Progress } from "@/components/ui/progress";
import { formatChange, formatMetricValue } from "@/lib/charts/format";
import { msg } from "@/lib/charts/messages";
import type { KpiView } from "@/server/charts/build";

// Cartão de KPI dos Painéis: o cartão do app (contorno de 2 px, vidro fosco,
// explicação depois de 3 s com o mouse parado) com a variação colorida pelo
// sentido da métrica (CPA caindo é verde), a tendência, a meta e o alerta.

export function PanelKpi({ view }: { view: KpiView }) {
  // O cartão mostra o número completo; abreviado só se escolhido no editor.
  const fmt = (value: number | null) =>
    formatMetricValue(value, view.format, {
      currency: view.currency,
      style: view.display?.numbers === "compact" ? "compact" : "full",
      decimals: view.display?.decimals ?? undefined,
    });
  // Sem base de comparação (sem dado de um lado, ou os dois zerados), o cartão não mostra variação, como o Resumo.
  const change = view.compare?.change.kind === "none" ? undefined : view.compare?.change;
  const delta = change
    ? {
        text: formatChange(change),
        direction: change.kind === "pct" && change.value !== 0 ? (change.value > 0 ? ("up" as const) : ("down" as const)) : ("flat" as const),
      }
    : undefined;
  const alert = view.alert
    ? `${msg.panel.kpi.alert}: ${(view.alert.when === "below" ? msg.panel.kpi.alertBelow : msg.panel.kpi.alertAbove)(fmt(view.alert.value))}`
    : undefined;
  const progress = view.goal?.progress ?? null;

  return (
    <KpiCard
      label={view.title}
      caption={view.periodLabel}
      value={fmt(view.value)}
      negative={(view.value ?? 0) < 0}
      delta={delta}
      deltaTone={change?.tone}
      deltaSuffix={view.compare?.versus}
      explain={view.info.explain}
      purpose={view.info.purpose}
      formula={view.info.formula}
      alert={alert}
    >
      {view.sparkline && <Sparkline values={view.sparkline.values} partial={view.sparkline.partial} label={view.sparkline.label} />}
      {view.goal && (
        <div className="mt-2 grid gap-1">
          <Progress value={progress == null ? 0 : Math.min(100, Math.max(0, progress * 100))} aria-label={msg.panel.goal} />
          <p className="text-xs text-muted-foreground tabular">
            {msg.panel.kpi.goal(formatMetricValue(progress, "percent", { currency: view.currency }), fmt(view.goal.target))}
          </p>
        </div>
      )}
    </KpiCard>
  );
}
