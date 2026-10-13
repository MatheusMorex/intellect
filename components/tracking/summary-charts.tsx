"use client";

import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";

import { EmptyState } from "@/components/ds/empty-state";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { integer, money, percentOf } from "@/lib/format";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type Point = { key: string; label: string; value: number; count?: number; color: string };

// Gráfico (components.md): cores em ordem fixa por categoria, legenda com valores,
// rótulo direto na barra, "Ver como tabela" com os mesmos números.
function BarCard({
  title,
  points,
  format,
  countLabel,
  empty,
}: {
  title: string;
  points: Point[];
  format: (v: number) => string;
  countLabel?: string;
  empty: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const reduced = useReducedMotion();
  const hasData = points.some((p) => p.value > 0);
  const config: ChartConfig = Object.fromEntries(points.map((p) => [p.key, { label: p.label, color: p.color }]));

  return (
    <figure className="grid content-start gap-3 rounded-lg border bg-card p-4">
      <figcaption className="flex items-center justify-between gap-2">
        <span className="font-semibold">{title}</span>
        {hasData && (
          <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)}>
            {asTable ? "Ver como gráfico" : "Ver como tabela"}
          </Button>
        )}
      </figcaption>
      {!hasData ? (
        <EmptyState icon={BarChart3} title="Sem dados no período" description={empty} className="py-6" />
      ) : asTable ? (
        <Table className="tabular">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead />
              {countLabel && <TableHead className="text-right">{countLabel}</TableHead>}
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {points.map((p) => (
              <TableRow key={p.key}>
                <TableCell>{p.label}</TableCell>
                {countLabel && <TableCell className="text-right">{integer(p.count ?? 0)}</TableCell>}
                <TableCell className="text-right">{format(p.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(120, points.length * 40) }} aria-hidden="true">
          <BarChart data={points} layout="vertical" margin={{ left: 4, right: 104, top: 4, bottom: 4 }}>
            <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={104} />
            <XAxis type="number" hide />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="key" formatter={(v) => format(Number(v))} />} />
            <Bar dataKey="value" radius={4} isAnimationActive={!reduced}>
              {points.map((p) => (
                <Cell key={p.key} fill={p.color} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                className="fill-foreground tabular"
                fontSize={12}
                formatter={(v: unknown) => format(Number(v))}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </figure>
  );
}

const PAYMENT_COLOR: Record<string, string> = {
  pix: "var(--ds-chart-1)",
  credit_card: "var(--ds-chart-2)",
  boleto: "var(--ds-chart-3)",
  other: "var(--ds-chart-8)",
};
const SOURCE_COLOR: Record<string, string> = {
  meta: "var(--ds-chart-1)",
  google: "var(--ds-chart-7)",
  other: "var(--ds-chart-3)",
  untracked: "var(--ds-chart-8)",
};

type ChartsData = {
  byProduct: { key: string; label: string; valueCents: number; count: number }[];
  byPayment: { key: string; label: string; valueCents: number; count: number }[];
  bySource: { key: string; label: string; valueCents: number; count: number }[];
  approval: { key: string; label: string; approved: number; total: number; rate: number | null }[];
};

export function SummaryCharts({ charts, currency }: { charts: ChartsData; currency: string }) {
  const m = (v: number) => money(v, currency);
  // Produtos: os 7 maiores e "Outros".
  const top = charts.byProduct.slice(0, 7);
  const rest = charts.byProduct.slice(7);
  const products: Point[] = top.map((p, i) => ({
    key: p.key,
    label: p.label,
    value: p.valueCents,
    count: p.count,
    color: `var(--ds-chart-${(i % 7) + 1})`,
  }));
  if (rest.length) {
    products.push({
      key: "outros",
      label: "Outros",
      value: rest.reduce((s, p) => s + p.valueCents, 0),
      count: rest.reduce((s, p) => s + p.count, 0),
      color: "var(--ds-chart-8)",
    });
  }
  const totalPayment = charts.byPayment.reduce((s, p) => s + p.valueCents, 0);

  return (
    <section aria-label="Gráficos" className="grid gap-3 lg:grid-cols-2">
      <BarCard title="Vendas por produto" points={products} format={m} countLabel="Unidades" empty="Nenhum produto vendido no período." />
      <BarCard
        title={`Vendas por forma de pagamento · total ${m(totalPayment)}`}
        points={charts.byPayment.map((p) => ({ key: p.key, label: p.label, value: p.valueCents, count: p.count, color: PAYMENT_COLOR[p.key] }))}
        format={m}
        countLabel="Pedidos"
        empty="Nenhuma venda paga no período."
      />
      <BarCard
        title="Vendas por fonte de tráfego"
        points={charts.bySource.map((p) => ({ key: p.key, label: p.label, value: p.valueCents, count: p.count, color: SOURCE_COLOR[p.key] }))}
        format={m}
        countLabel="Pedidos"
        empty="Nenhuma venda paga no período."
      />
      <BarCard
        title="Taxa de aprovação por forma de pagamento"
        points={charts.approval
          .filter((p) => p.total > 0)
          .map((p) => ({ key: p.key, label: p.label, value: Math.round((p.rate ?? 0) * 1000) / 10, count: p.total, color: PAYMENT_COLOR[p.key] }))}
        format={(v) => percentOf(v / 100) ?? "—"}
        countLabel="Tentativas"
        empty="Nenhuma tentativa de pagamento concluída no período."
      />
    </section>
  );
}
