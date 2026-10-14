import { format } from "date-fns";
import { Pencil, Plus, Receipt, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Banner } from "@/components/ds/banner";
import { EmptyState } from "@/components/ds/empty-state";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PeriodFilter } from "@/components/shell/period-filter";
import { ExpenseDelete, ExpenseDialog } from "@/components/tracking/costs-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { EXPENSE_CATEGORY, listExpenses } from "@/server/data/settings";
import type { SearchParams } from "@/server/data/tracking";
import { todayIn } from "@/server/period";
import type { ExpenseCategory } from "@/server/store/types";

export const metadata: Metadata = { title: "Despesas" };

const day = (key: string) => key.split("-").reverse().join("/");

// S26 Despesas: o que não é anúncio (ferramentas, equipe, contabilidade), único ou todo mês.
export default async function ExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ dashboardId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { dashboardId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const data = await listExpenses({ user }, dashboardId, sp);
  const m = (c: number) => money(c, data.dashboard.currency);
  const today = format(todayIn("America/Sao_Paulo"), "yyyy-MM-dd");
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const categoryHref = (category: string) => {
    const q = new URLSearchParams();
    for (const k of ["periodo", "de", "ate", "q"]) {
      const v = one(sp[k]);
      if (v) q.set(k, v);
    }
    if (category) q.set("categoria", category);
    const s = q.toString();
    return `/d/${dashboardId}/expenses${s ? `?${s}` : ""}`;
  };
  const categories = [
    { value: "", label: "Todas" },
    ...(Object.entries(EXPENSE_CATEGORY) as [ExpenseCategory, string][]).map(([value, label]) => ({ value, label })),
  ];

  return (
    <PageBody>
      <PageHeader
        title="Despesas"
        help="despesas"
        description={data.dashboard.name}
        actions={
          <>
            <PeriodFilter period={data.period} />
            {data.canManage && (
              <ExpenseDialog
                dashboardId={dashboardId}
                today={today}
                currency={data.dashboard.currency}
                trigger={
                  <Button>
                    <Plus aria-hidden="true" />
                    Nova despesa
                  </Button>
                }
              />
            )}
          </>
        }
      />

      {data.fxUnavailable && (
        <Banner variant="error" title="Não deu para buscar a cotação do dia">
          Há despesas em outra moeda e, sem a cotação, os totais em {data.dashboard.currency} ficariam errados. Os valores de cada despesa abaixo estão
          na moeda em que foram lançados. Tente de novo em alguns minutos.
        </Banner>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <form action={`/d/${dashboardId}/expenses`} role="search" className="relative">
          {["periodo", "de", "ate", "categoria"].map((k) => (one(sp[k]) ? <input key={k} type="hidden" name={k} value={one(sp[k])} /> : null))}
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" name="q" defaultValue={data.filters.q} placeholder="Buscar pela descrição…" aria-label="Buscar despesa" className="w-64 pl-8" />
        </form>
        <nav aria-label="Categoria" className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
          {categories.map((c) => {
            const active = data.filters.category === c.value;
            const total = c.value ? data.byCategory[c.value as ExpenseCategory] : 0;
            return (
              <Link
                key={c.value || "todas"}
                href={categoryHref(c.value)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-card font-semibold text-foreground shadow-card",
                )}
              >
                {c.label}
                {total > 0 && !data.fxUnavailable && <span className="text-xs tabular">{m(total)}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {data.rows.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState icon={Receipt} title="Nenhuma despesa neste período" description="Lance ferramentas, equipe e outros custos fixos para o lucro sair certo." />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table className="tabular">
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-muted">
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">No período</TableHead>
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="max-w-80">
                    <span className="block truncate font-medium" title={e.description}>
                      {e.description}
                    </span>
                  </TableCell>
                  <TableCell>{EXPENSE_CATEGORY[e.category]}</TableCell>
                  <TableCell>
                    {e.kind === "once"
                      ? day(e.date)
                      : `Todo dia ${Number(e.date.slice(8, 10))}, desde ${day(e.date)}${e.endDate ? ` até ${day(e.endDate)}` : ""}`}
                  </TableCell>
                  <TableCell className="text-right">{money(e.amountCents, e.currency)}</TableCell>
                  <TableCell className="text-right">
                    {data.fxUnavailable && e.currency !== data.dashboard.currency ? "—" : m(e.totalInPeriodCents)}
                    {e.occurrences.length > 1 && <span className="block text-xs text-muted-foreground">{e.occurrences.length} vezes</span>}
                  </TableCell>
                  <TableCell className="w-24 text-right">
                    {data.canManage && (
                      <>
                        <ExpenseDialog
                          dashboardId={dashboardId}
                          today={today}
                          currency={data.dashboard.currency}
                          expense={e}
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={`Editar ${e.description}`}>
                              <Pencil aria-hidden="true" />
                            </Button>
                          }
                        />
                        <ExpenseDelete dashboardId={dashboardId} expenseId={e.id} description={e.description} />
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="border-t-2 border-input hover:bg-card">
                <TableCell colSpan={4}>Total no período</TableCell>
                <TableCell className="text-right">{data.fxUnavailable ? "—" : m(data.total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {data.period.label}, {data.period.description}. A despesa mensal cai no mesmo dia de cada mês (no dia 31, cai no último dia dos meses mais curtos).
      </p>
    </PageBody>
  );
}
