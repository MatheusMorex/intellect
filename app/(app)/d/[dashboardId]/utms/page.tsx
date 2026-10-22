import { Link2, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Banner } from "@/components/ds/banner";
import { EmptyState } from "@/components/ds/empty-state";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PeriodFilter } from "@/components/shell/period-filter";
import { FilterBar } from "@/components/tracking/filter-bar";
import { UtmTable } from "@/components/tracking/utm-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getFilterOptions, type SearchParams } from "@/server/data/tracking";
import { getUtmReport, UTM_NAME, UTM_PARAMS, utmFiltered, type UtmParam } from "@/server/data/utms";

export const metadata: Metadata = { title: "UTMs" };

/** Parâmetros que a página leva de um link para o outro (o resto é escolhido nela). */
const KEEP = ["periodo", "de", "ate", "conta", "fonte", "produto", "campanha", "por", "q"] as const;

// S27 Relatório por UTM: vendas agrupadas por um parâmetro do link, inclusive as que chegaram sem ele.
export default async function UtmsPage({ params, searchParams }: { params: Promise<{ dashboardId: string }>; searchParams: Promise<SearchParams> }) {
  const { dashboardId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const [report, options] = await Promise.all([getUtmReport({ user }, dashboardId, sp), getFilterOptions({ user }, dashboardId)]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const base = `/d/${report.dashboard.id}/utms`;

  const hrefWith = (update: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const k of KEEP) {
      const v = one(sp[k]);
      if (v) q.set(k, v);
    }
    for (const [k, v] of Object.entries(update)) {
      if (v == null || v === "") q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };

  const header = <PageHeader title="UTMs" help="utms" description={report.dashboard.name} actions={<PeriodFilter period={report.period} />} />;

  if (report.fxUnavailable) {
    return (
      <PageBody>
        {header}
        <Banner variant="error" title="Não deu para buscar a cotação do dia">
          Este dashboard mostra os valores em {report.dashboard.currency}, e parte das vendas ou dos custos está em outra moeda. Sem a cotação, os números
          ficariam errados, então eles não aparecem. Confira a internet e recarregue a página em alguns minutos.
        </Banner>
      </PageBody>
    );
  }

  const paramName = UTM_NAME[report.param];
  const hasOrders = report.totals.orders > 0;

  return (
    <PageBody>
      {header}

      <nav aria-label="Agrupar por" className="flex flex-wrap items-end gap-1 border-b">
        {UTM_PARAMS.map((p: UtmParam) => {
          const active = p === report.param;
          return (
            <Link
              key={p}
              href={hrefWith({ por: p === "campaign" ? null : p, q: null })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 border-transparent px-3 pb-2 font-mono text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                active && "border-primary font-semibold text-foreground",
              )}
            >
              {UTM_NAME[p]}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <form action={base} role="search" className="relative">
          {KEEP.filter((k) => k !== "q").map((k) => (one(sp[k]) ? <input key={k} type="hidden" name={k} value={one(sp[k])} /> : null))}
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" name="q" defaultValue={report.q} placeholder={`Buscar ${paramName}…`} aria-label={`Buscar pelo valor de ${paramName}`} className="w-64 pl-8" />
        </form>
        <FilterBar
          filters={[
            { name: "conta", label: "Conta de anúncio", options: options.accounts, selected: report.filters.accounts },
            { name: "fonte", label: "Fonte de tráfego", options: options.sources, selected: report.filters.sources },
            { name: "produto", label: "Produto", options: options.products, selected: report.filters.products },
          ]}
        />
      </div>

      {!hasOrders ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={Link2}
            title="Nenhuma venda neste período"
            description={`As vendas aparecem aqui agrupadas por ${paramName} assim que chegam da loja. Escolha outro período${utmFiltered(report) ? " ou tire algum filtro" : ""}.`}
          />
        </div>
      ) : report.rows.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={Search}
            title={`Nenhum ${paramName} com “${report.q}”`}
            description="Confira o que foi digitado ou limpe a busca."
            action={
              <Button asChild variant="outline">
                <Link href={hrefWith({ q: null })}>Limpar a busca</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <UtmTable rows={report.rows} totals={report.totals} currency={report.dashboard.currency} paramName={paramName} periodLabel={`${report.period.label}, ${report.period.description}`} />
      )}

      <p className="text-xs text-muted-foreground">
        “(sem {paramName})” reúne as vendas que chegaram sem esse parâmetro no link: orgânico, direto ou link sem UTM. O gasto com anúncios não entra
        aqui, porque é contado por campanha: para ROAS e lucro depois dos anúncios, veja Meta e Google.
      </p>
    </PageBody>
  );
}
