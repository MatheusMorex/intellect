"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Columns3,
  Download,
  FileSpreadsheet,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  SquarePlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusPill, type PillStatus } from "@/components/ds/badges";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { currencySymbol, decimalOrZero, EMPTY, integer, money, moneyOrZero, percentOrZero, roasOrZero } from "@/lib/format";
import { centsToInput } from "@/lib/parse";
import { useStoredList } from "@/lib/use-stored-list";
import { cn } from "@/lib/utils";
import { downloadXlsx, xMoney, type XlsxCell, type XlsxNumberFormat } from "@/lib/xlsx";
import { setAdObjectBudget, setAdObjectStatus } from "@/server/actions/ads";
import { createCardFromRow } from "@/server/actions/cards";
import type { Provider, ReportLevel, ReportRow } from "@/server/data/tracking";

const STATUS: Record<string, { label: string; pill: PillStatus }> = {
  connected: { label: "Conectada", pill: "connected" },
  active: { label: "Ativo", pill: "connected" },
  paused: { label: "Pausado", pill: "waiting" },
  deleted: { label: "Excluído", pill: "waiting" },
  archived: { label: "Arquivado", pill: "waiting" },
  in_review: { label: "Em análise", pill: "expiring" },
  rejected: { label: "Rejeitado", pill: "error" },
  with_issues: { label: "Com restrições", pill: "error" },
  unknown: { label: "Desconhecido", pill: "waiting" },
};

const CHANNEL: Record<string, string> = { SEARCH: "Pesquisa", PERFORMANCE_MAX: "Performance Max", DISPLAY: "Display", VIDEO: "Vídeo" };

type ColumnKey =
  | "budget"
  | "channel"
  | "targetCpa"
  | "spend"
  | "sales"
  | "revenue"
  | "profit"
  | "roas"
  | "margin"
  | "roi"
  | "cpa"
  | "ctr"
  | "cpc"
  | "cpm"
  | "impressions"
  | "clicks"
  | "atc"
  | "costPerAtc"
  | "reach"
  | "frequency"
  | "videoViews"
  | "hook"
  | "hold";

type Column = {
  key: ColumnKey;
  label: string;
  value: (r: ReportRow) => number | null;
  show: (r: ReportRow, currency: string) => string;
  only?: { providers?: Provider[]; levels?: ReportLevel[] };
  negative?: (r: ReportRow) => boolean;
};

function columns(currency: string): Column[] {
  // Resultado sem dado aparece zerado; orçamento e CPA desejado sem valor ficam com o travessão (não foram definidos ali).
  const m = (c: number | null) => moneyOrZero(c, currency);
  const setting = (c: number | null, r: ReportRow) => (c == null ? EMPTY : money(c, r.budgetCurrency));
  return [
    { key: "channel", label: "Tipo", value: () => null, show: (r) => (r.channelType ? (CHANNEL[r.channelType] ?? r.channelType) : EMPTY), only: { providers: ["google"], levels: ["campanhas"] } },
    { key: "budget", label: "Orçamento diário", value: (r) => r.dailyBudgetCents, show: (r) => setting(r.dailyBudgetCents, r), only: { levels: ["campanhas", "conjuntos"] } },
    { key: "targetCpa", label: "CPA desejado", value: (r) => r.targetCpaCents, show: (r) => setting(r.targetCpaCents, r), only: { providers: ["google"], levels: ["campanhas"] } },
    { key: "spend", label: "Gasto", value: (r) => r.spendCents, show: (r) => m(r.spendCents) },
    { key: "sales", label: "Vendas", value: (r) => r.sales, show: (r) => integer(r.sales) },
    { key: "revenue", label: "Faturamento", value: (r) => r.revenueCents, show: (r) => m(r.revenueCents) },
    { key: "profit", label: "Lucro", value: (r) => r.profitCents, show: (r) => m(r.profitCents), negative: (r) => r.profitCents < 0 },
    { key: "roas", label: "ROAS", value: (r) => r.roas, show: (r) => roasOrZero(r.roas), negative: (r) => r.roas != null && r.roas < 1 },
    { key: "margin", label: "Margem", value: (r) => r.margin, show: (r) => percentOrZero(r.margin), negative: (r) => (r.margin ?? 0) < 0 },
    { key: "roi", label: "ROI", value: (r) => r.roi, show: (r) => percentOrZero(r.roi), negative: (r) => (r.roi ?? 0) < 0 },
    { key: "cpa", label: "CPA", value: (r) => r.cpaCents, show: (r) => m(r.cpaCents) },
    { key: "ctr", label: "CTR", value: (r) => r.ctr, show: (r) => percentOrZero(r.ctr, 2) },
    { key: "cpc", label: "CPC", value: (r) => r.cpcCents, show: (r) => m(r.cpcCents) },
    { key: "cpm", label: "CPM", value: (r) => r.cpmCents, show: (r) => m(r.cpmCents) },
    { key: "impressions", label: "Impressões", value: (r) => r.impressions, show: (r) => integer(r.impressions) },
    { key: "clicks", label: "Cliques", value: (r) => r.clicks, show: (r) => integer(r.clicks) },
    { key: "atc", label: "Adições ao carrinho", value: (r) => r.addToCarts, show: (r) => integer(r.addToCarts), only: { providers: ["meta"] } },
    { key: "costPerAtc", label: "Custo por adição", value: (r) => r.costPerAddToCartCents, show: (r) => m(r.costPerAddToCartCents), only: { providers: ["meta"] } },
    { key: "reach", label: "Alcance", value: (r) => r.reach, show: (r) => integer(r.reach ?? 0), only: { providers: ["meta"] } },
    { key: "frequency", label: "Frequência", value: (r) => r.frequency, show: (r) => decimalOrZero(r.frequency), only: { providers: ["meta"] } },
    { key: "videoViews", label: "Visualizações (3 s)", value: (r) => r.videoViews, show: (r) => integer(r.videoViews), only: { providers: ["meta"] } },
    // Hook e hold só existem para vídeo: em imagem e carrossel, o travessão (não se aplica, não é zero).
    { key: "hook", label: "Hook", value: (r) => r.hookRate, show: (r) => (r.hookRate == null ? EMPTY : percentOrZero(r.hookRate)), only: { providers: ["meta"] } },
    { key: "hold", label: "Hold 75%", value: (r) => r.holdRate, show: (r) => (r.holdRate == null ? EMPTY : percentOrZero(r.holdRate)), only: { providers: ["meta"] } },
  ];
}

/** Formato de cada coluna na planilha do Excel (null: texto). */
const XLSX_FORMAT: Record<ColumnKey, XlsxNumberFormat | null> = {
  budget: "money",
  channel: null,
  targetCpa: "money",
  spend: "money",
  sales: "int",
  revenue: "money",
  profit: "money",
  roas: "mult",
  margin: "pct",
  roi: "pct",
  cpa: "money",
  ctr: "pct",
  cpc: "money",
  cpm: "money",
  impressions: "int",
  clicks: "int",
  atc: "int",
  costPerAtc: "money",
  reach: "int",
  frequency: "dec",
  videoViews: "int",
  hook: "pct",
  hold: "pct",
};
/** Sem número, estas ficam vazias na planilha (na tela, o travessão); as outras saem zeradas, como na tela. */
const BLANK_WHEN_NULL = new Set<ColumnKey>(["budget", "targetCpa", "hook", "hold"]);

const DEFAULT_COLUMNS: ColumnKey[] =["channel", "budget", "targetCpa", "spend", "sales", "revenue", "profit", "roas", "cpa", "ctr", "cpc", "cpm", "impressions", "frequency", "hook", "hold"];

type ReportProps = {
  dashboardId: string;
  currency: string;
  provider: Provider;
  level: ReportLevel;
  periodLabel: string;
  rows: ReportRow[];
  totals: ReportRow;
  canManage: boolean;
  drillHref: Record<string, string>;
};

type ListOption = { boardId: string; boardName: string; listId: string; listName: string };

function csvCell(value: string) {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function CampaignTable({ report, lists }: { report: ReportProps; lists: ListOption[] }) {
  const { provider, level, currency } = report;
  const all = useMemo(() => columns(currency), [currency]);
  const available = all.filter(
    (c) => (!c.only?.providers || c.only.providers.includes(provider)) && (!c.only?.levels || c.only.levels.includes(level)),
  );
  const [stored, setStored] = useStoredList(`itl-colunas-${provider}`, DEFAULT_COLUMNS);
  const visible = stored
    .map((k) => available.find((c) => c.key === k))
    .filter((c): c is Column => !!c);
  const [sort, setSort] = useState<{ key: ColumnKey; dir: "asc" | "desc" } | null>(null);
  const [cardTarget, setCardTarget] = useState<ReportRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ row: ReportRow; active: boolean } | null>(null);
  const [budgetTarget, setBudgetTarget] = useState<ReportRow | null>(null);
  const manageable = report.canManage && level !== "contas" && level !== "palavras";

  const rows = useMemo(() => {
    if (!sort) return report.rows;
    const column = all.find((c) => c.key === sort.key);
    if (!column) return report.rows;
    return [...report.rows].sort((a, b) => {
      const x = column.value(a);
      const y = column.value(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return sort.dir === "asc" ? x - y : y - x;
    });
  }, [report.rows, sort, all]);

  function toggleSort(key: ColumnKey) {
    setSort((s) => (!s || s.key !== key ? { key, dir: "desc" } : s.dir === "desc" ? { key, dir: "asc" } : null));
  }

  function exportCsv() {
    const header = ["Status", "Nome", ...(level === "anuncios" || level === "palavras" ? ["Origem"] : []), ...visible.map((c) => c.label)];
    const lines = [header, ...rows.map((r) => [STATUS[r.status]?.label ?? r.status, r.name, ...(level === "anuncios" || level === "palavras" ? [r.parent ?? ""] : []), ...visible.map((c) => c.show(r, currency))])];
    lines.push(["", "Total", ...(level === "anuncios" || level === "palavras" ? [""] : []), ...visible.map((c) => (c.key === "budget" || c.key === "targetCpa" || c.key === "channel" ? "" : c.show(report.totals, currency)))]);
    const csv = "﻿" + lines.map((l) => l.map((v) => csvCell(String(v))).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${provider}-${level}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Célula da planilha: número de verdade com o formato da coluna; sem número, zerado como na tela (ou vazio onde a tela mostra o travessão). */
  function xlsxCell(c: Column, r: ReportRow, total: boolean): XlsxCell {
    if (total && (c.key === "budget" || c.key === "targetCpa" || c.key === "channel")) return null;
    const fmt = XLSX_FORMAT[c.key];
    if (fmt == null) {
      const text = c.show(r, currency);
      return text === EMPTY ? null : text;
    }
    const raw = c.value(r);
    const n = raw == null ? (BLANK_WHEN_NULL.has(c.key) ? null : 0) : raw;
    if (fmt === "money") return xMoney(n, c.key === "budget" || c.key === "targetCpa" ? r.budgetCurrency : currency);
    return { n, fmt };
  }

  function exportXlsx() {
    const withParent = level === "anuncios" || level === "palavras";
    const lines: XlsxCell[][] = [
      ["Status", "Nome", ...(withParent ? ["Origem"] : []), ...visible.map((c) => c.label)],
      ...rows.map((r) => [STATUS[r.status]?.label ?? r.status, r.name, ...(withParent ? [r.parent ?? ""] : []), ...visible.map((c) => xlsxCell(c, r, false))]),
      ["", "Total", ...(withParent ? [""] : []), ...visible.map((c) => xlsxCell(c, report.totals, true))],
    ];
    downloadXlsx(`${provider}-${level}-${new Date().toISOString().slice(0, 10)}.xlsx`, lines, { sheet: `${provider === "meta" ? "Meta" : "Google"} ${level}`, total: true });
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {integer(rows.length)} {rows.length === 1 ? "item" : "itens"}
        </p>
        <div className="flex flex-wrap gap-2">
          <ColumnPicker available={available} visible={visible.map((c) => c.key)} onChange={setStored} />
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

      {rows.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-muted-foreground">Nada encontrado com esses filtros.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table className="tabular">
            <TableCaption className="sr-only">
              {provider === "meta" ? "Meta" : "Google"}, nível {level}, {report.periodLabel}
            </TableCaption>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow className="hover:bg-muted">
                <TableHead>Status</TableHead>
                <TableHead className="sticky left-0 z-10 min-w-56 bg-muted">Nome</TableHead>
                {visible.map((c) => {
                  const active = sort?.key === c.key;
                  return (
                    <TableHead key={c.key} className="text-right" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className="inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {c.label}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp aria-hidden="true" className="size-3.5" />
                          ) : (
                            <ArrowDown aria-hidden="true" className="size-3.5" />
                          )
                        ) : (
                          <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-40" />
                        )}
                      </button>
                    </TableHead>
                  );
                })}
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const status = STATUS[r.status] ?? STATUS.unknown;
                const togglable = manageable && (r.status === "active" || r.status === "paused");
                const href = report.drillHref[r.id];
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      {togglable ? (
                        <Switch
                          checked={r.status === "active"}
                          aria-label={`${r.name}: ${r.status === "active" ? "ativo" : "pausado"}`}
                          onCheckedChange={(active) => setStatusTarget({ row: r, active })}
                        />
                      ) : (
                        <StatusPill status={status.pill}>{status.label}</StatusPill>
                      )}
                    </TableCell>
                    <TableCell className="sticky left-0 z-[1] max-w-80 bg-card">
                      {href ? (
                        <Link href={href} className="block truncate font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" title={r.name}>
                          {r.name}
                        </Link>
                      ) : (
                        <span className="block truncate" title={r.name}>
                          {r.name}
                        </span>
                      )}
                      {r.parent && level !== "campanhas" && (
                        <span className="block truncate text-xs text-muted-foreground" title={r.parent}>
                          {r.parent}
                        </span>
                      )}
                    </TableCell>
                    {visible.map((c) => (
                      <TableCell key={c.key} className={cn("text-right", c.negative?.(r) && "text-danger")}>
                        {c.key === "budget" && manageable && r.dailyBudgetCents != null && level !== "anuncios" ? (
                          <span className="group inline-flex items-center gap-1">
                            {c.show(r, currency)}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Editar orçamento de ${r.name}`}
                              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                              onClick={() => setBudgetTarget(r)}
                            >
                              <Pencil aria-hidden="true" />
                            </Button>
                          </span>
                        ) : (
                          c.show(r, currency)
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="w-10">
                      {(level === "campanhas" || level === "conjuntos" || level === "anuncios" || href) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${r.name}`}>
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {href && (
                              <DropdownMenuItem asChild>
                                <Link href={href}>Ver o que tem dentro</Link>
                              </DropdownMenuItem>
                            )}
                            {(level === "campanhas" || level === "conjuntos" || level === "anuncios") && (
                              <DropdownMenuItem onSelect={() => setCardTarget(r)}>
                                <SquarePlus aria-hidden="true" />
                                Criar card
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="border-t-2 border-input hover:bg-card">
                <TableCell />
                <TableCell className="sticky left-0 z-[1] bg-card">Total</TableCell>
                {visible.map((c) => (
                  <TableCell key={c.key} className={cn("text-right", c.negative?.(report.totals) && "text-danger")}>
                    {c.key === "budget" || c.key === "targetCpa" || c.key === "channel" ? "" : c.show(report.totals, currency)}
                  </TableCell>
                ))}
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Faturamento e lucro contam só as vendas atribuídas a cada linha. O lucro da linha desconta gasto, impostos, custo de produto e taxas;
        despesas só entram no Resumo.{level === "palavras" ? " O gasto por palavra-chave fica fora dos totais da conta." : ""}
      </p>

      <CreateCardDialog dashboardId={report.dashboardId} level={level} target={cardTarget} lists={lists} onClose={() => setCardTarget(null)} />
      <StatusDialog dashboardId={report.dashboardId} level={level} provider={provider} target={statusTarget} onClose={() => setStatusTarget(null)} />
      <BudgetDialog dashboardId={report.dashboardId} level={level} provider={provider} currency={currency} target={budgetTarget} onClose={() => setBudgetTarget(null)} />
    </div>
  );
}

function ColumnPicker({ available, visible, onChange }: { available: Column[]; visible: ColumnKey[]; onChange: (next: string[] | null) => void }) {
  const order = [...visible, ...available.map((c) => c.key).filter((k) => !visible.includes(k))];
  const label = (k: ColumnKey) => available.find((c) => c.key === k)?.label ?? k;
  const move = (k: ColumnKey, by: number) => {
    const list = [...visible];
    const i = list.indexOf(k);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    onChange(list);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Columns3 aria-hidden="true" />
          Colunas
          <ChevronDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="mb-2 text-sm font-semibold">Colunas da tabela</p>
        <ul className="grid gap-1">
          {order
            .filter((k) => available.some((c) => c.key === k))
            .map((k) => {
              const on = visible.includes(k);
              return (
                <li key={k} className="flex items-center gap-2 rounded-md px-1 hover:bg-accent">
                  <Label className="flex-1 py-1.5 font-normal">
                    <Checkbox checked={on} onCheckedChange={(v) => onChange(v ? [...visible, k] : visible.filter((x) => x !== k))} />
                    {label(k)}
                  </Label>
                  {on && (
                    <>
                      <Button variant="ghost" size="icon-sm" aria-label={`Subir ${label(k)}`} onClick={() => move(k, -1)}>
                        <ChevronUp aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Descer ${label(k)}`} onClick={() => move(k, 1)}>
                        <ChevronDown aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
        </ul>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange(null)}>
          <RotateCcw aria-hidden="true" />
          Restaurar padrão
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function StatusDialog({
  dashboardId,
  level,
  provider,
  target,
  onClose,
}: {
  dashboardId: string;
  level: ReportLevel;
  provider: Provider;
  target: { row: ReportRow; active: boolean } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const where = provider === "meta" ? "no Meta" : "no Google";
  return (
    <AlertDialog open={target != null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target?.active ? "Ativar" : "Pausar"} {target?.row.name} {where}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target?.active ? "Os anúncios voltam a rodar e a gastar." : "Os anúncios param de rodar até você ativar de novo."} No modo de teste, só os
            dados de exemplo mudam.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant={target?.active ? "default" : "destructive"}
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              if (!target || (level !== "campanhas" && level !== "conjuntos" && level !== "anuncios")) return;
              startTransition(async () => {
                const result = await setAdObjectStatus({ dashboardId, level, id: target.row.id, active: target.active });
                if (!result.ok) toast.error(result.error);
                else toast.success(target.active ? "Ativado" : "Pausado");
                onClose();
                router.refresh();
              });
            }}
          >
            {target?.active ? "Ativar" : "Pausar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BudgetDialog({
  dashboardId,
  level,
  provider,
  currency,
  target,
  onClose,
}: {
  dashboardId: string;
  level: ReportLevel;
  provider: Provider;
  currency: string;
  target: ReportRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[420px]">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!target || (level !== "campanhas" && level !== "conjuntos")) return;
            const value = String(new FormData(event.currentTarget).get("budget") ?? "");
            startTransition(async () => {
              const result = await setAdObjectBudget({ dashboardId, level, id: target.id, value });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success(`Orçamento mudou para ${money(result.data.cents, target.budgetCurrency)}`);
              onClose();
              router.refresh();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Orçamento diário</DialogTitle>
            <DialogDescription>
              {target?.name}. A mudança vale {provider === "meta" ? "no Meta" : "no Google"} a partir de agora; no modo de teste, só os dados de exemplo
              mudam.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="budget">Novo orçamento ({currencySymbol(target?.budgetCurrency ?? currency)})</Label>
            <Input
              id="budget"
              name="budget"
              inputMode="decimal"
              autoFocus
              defaultValue={centsToInput(target?.dailyBudgetCents)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "budget-error" : undefined}
            />
            {error && (
              <p id="budget-error" role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              Mudar orçamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateCardDialog({
  dashboardId,
  level,
  target,
  lists,
  onClose,
}: {
  dashboardId: string;
  level: ReportLevel;
  target: ReportRow | null;
  lists: ListOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [listId, setListId] = useState<string>("");
  const boards = [...new Map(lists.map((l) => [l.boardId, l.boardName])).entries()];
  const selectedList = listId || lists[0]?.listId || "";
  const what = level === "campanhas" ? "campanha" : level === "conjuntos" ? "conjunto" : "anúncio";

  return (
    <Dialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!target || (level !== "campanhas" && level !== "conjuntos" && level !== "anuncios")) return;
            const name = String(new FormData(event.currentTarget).get("name") ?? "");
            startTransition(async () => {
              const result = await createCardFromRow({ dashboardId, level, targetId: target.id, listId: selectedList, name });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success(`Card criado em ${result.data.boardName}`, {
                action: { label: "Abrir quadro", onClick: () => router.push(`/b/${result.data.boardId}`) },
              });
              onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Criar card</DialogTitle>
            <DialogDescription>
              O card fica ligado a este {what}
              {target?.name ? (
                <>
                  , <strong className="font-semibold">{target.name}</strong>,
                </>
              ) : null}{" "}
              e mostra o ROAS dele no quadro.
            </DialogDescription>
          </DialogHeader>
          {lists.length === 0 ? (
            <p className="text-muted-foreground">Você ainda não tem um quadro onde possa criar cards.</p>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="card-name">Nome do card (obrigatório)</Label>
                <Input
                  id="card-name"
                  name="name"
                  required
                  maxLength={512}
                  defaultValue={target ? `Acompanhar ${target.name}` : ""}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "card-error" : undefined}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="card-list">Lista</Label>
                <Select value={selectedList} onValueChange={setListId}>
                  <SelectTrigger id="card-list" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {boards.map(([boardId, boardName]) => (
                      <SelectGroup key={boardId}>
                        <SelectLabel>{boardName}</SelectLabel>
                        {lists
                          .filter((l) => l.boardId === boardId)
                          .map((l) => (
                            <SelectItem key={l.listId} value={l.listId}>
                              {l.listName}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error && (
                <p id="card-error" role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
            </>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending} disabled={lists.length === 0}>
              Criar card
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
