"use client";

// Tabela do relatório por UTM (S27): ordenar pela coluna, linha de total e exportar CSV ou Excel.

import { ArrowDown, ArrowUp, Download, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { integer, moneyOrZero, percentOrZero } from "@/lib/format";
import { cn } from "@/lib/utils";
import { downloadXlsx, xInt, xMoney, xPct, type XlsxCell } from "@/lib/xlsx";
import type { UtmRow } from "@/server/data/utms";

type Key = "orders" | "sales" | "revenueCents" | "share" | "ticketCents" | "approval" | "pendingCents" | "refundedCents" | "costsCents" | "profitCents";

const COLUMNS: { key: Key; label: string; kind: "count" | "money" | "percent"; hint?: string }[] = [
  { key: "orders", label: "Pedidos", kind: "count", hint: "Pedidos de qualquer situação" },
  { key: "sales", label: "Vendas", kind: "count", hint: "Vendas pagas" },
  { key: "revenueCents", label: "Faturamento", kind: "money" },
  { key: "share", label: "% do faturamento", kind: "percent" },
  { key: "ticketCents", label: "Ticket médio", kind: "money" },
  { key: "approval", label: "Aprovação", kind: "percent", hint: "Aprovados ÷ pedidos que já se resolveram" },
  { key: "pendingCents", label: "Pendente", kind: "money", hint: "Valor aguardando pagamento" },
  { key: "refundedCents", label: "Reembolsado", kind: "money", hint: "Reembolsos e chargebacks" },
  { key: "costsCents", label: "Custos", kind: "money", hint: "Produtos, taxas e impostos sobre a venda" },
  { key: "profitCents", label: "Lucro antes dos anúncios", kind: "money", hint: "Faturamento − custos (o gasto com anúncios é por campanha, não por parâmetro)" },
];

/** Sem número de verdade (sem venda), o valor aparece zerado, como no resto do tracking. */
function show(row: UtmRow, key: Key, kind: "count" | "money" | "percent", currency: string) {
  const value = row[key];
  if (kind === "count") return integer(value ?? 0);
  if (kind === "money") return moneyOrZero(value, currency);
  return percentOrZero(value);
}

function csvCell(value: string) {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function UtmTable({ rows, totals, currency, paramName, periodLabel }: { rows: UtmRow[]; totals: UtmRow; currency: string; paramName: string; periodLabel: string }) {
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" } | null>(null);
  const none = `(sem ${paramName})`;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return sort.dir === "asc" ? x - y : y - x;
    });
  }, [rows, sort]);

  const toggle = (key: Key) => setSort((s) => (!s || s.key !== key ? { key, dir: "desc" } : s.dir === "desc" ? { key, dir: "asc" } : null));

  function exportCsv() {
    const lines = [
      [paramName, ...COLUMNS.map((c) => c.label)],
      ...sorted.map((r) => [r.value ?? none, ...COLUMNS.map((c) => show(r, c.key, c.kind, currency))]),
      ["Total", ...COLUMNS.map((c) => show(totals, c.key, c.kind, currency))],
    ];
    const csv = "﻿" + lines.map((l) => l.map((v) => csvCell(String(v))).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `utms-${paramName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportXlsx() {
    // Sem número de verdade, zerado, como na tela.
    const cell = (row: UtmRow, key: Key, kind: "count" | "money" | "percent"): XlsxCell => (kind === "money" ? xMoney(row[key] ?? 0, currency) : kind === "count" ? xInt(row[key] ?? 0) : xPct(row[key] ?? 0));
    const lines: XlsxCell[][] = [
      [paramName, ...COLUMNS.map((c) => c.label)],
      ...sorted.map((r) => [r.value ?? none, ...COLUMNS.map((c) => cell(r, c.key, c.kind))]),
      ["Total", ...COLUMNS.map((c) => cell(totals, c.key, c.kind))],
    ];
    downloadXlsx(`utms-${paramName}-${new Date().toISOString().slice(0, 10)}.xlsx`, lines, { sheet: `Vendas por ${paramName}`, total: true });
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {integer(rows.length)} {rows.length === 1 ? "valor" : "valores"} de {paramName}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download aria-hidden="true" />
            Exportar CSV
          </Button>
          <Button variant="outline" onClick={exportXlsx} disabled={rows.length === 0}>
            <FileSpreadsheet aria-hidden="true" />
            Exportar Excel
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table className="tabular">
          <TableCaption className="sr-only">
            Vendas por {paramName}, {periodLabel}
          </TableCaption>
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-muted">
              <TableHead className="min-w-48">{paramName}</TableHead>
              {COLUMNS.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <TableHead key={c.key} className="text-right" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}>
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      title={c.hint}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm whitespace-nowrap outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                        active && "text-foreground",
                      )}
                    >
                      {c.label}
                      {active && (sort!.dir === "asc" ? <ArrowUp aria-hidden="true" className="size-3.5" /> : <ArrowDown aria-hidden="true" className="size-3.5" />)}
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.value ?? ""}>
                <TableCell className="max-w-80 font-medium">
                  <span className={cn("block truncate", r.value === null && "text-muted-foreground italic")} title={r.value ?? none}>
                    {r.value ?? none}
                  </span>
                </TableCell>
                {COLUMNS.map((c) => (
                  <TableCell key={c.key} className="text-right">
                    {show(r, c.key, c.kind, currency)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              {COLUMNS.map((c) => (
                <TableCell key={c.key} className="text-right font-semibold">
                  {show(totals, c.key, c.kind, currency)}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
