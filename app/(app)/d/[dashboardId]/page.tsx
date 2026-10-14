import type { Metadata } from "next";
import Link from "next/link";

import { Banner } from "@/components/ds/banner";
import { HelpTip } from "@/components/ds/help-tip";
import { KpiCard } from "@/components/ds/kpi-card";
import { DashboardRefresh } from "@/components/shell/dashboard-refresh";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PeriodFilter } from "@/components/shell/period-filter";
import { FilterBar } from "@/components/tracking/filter-bar";
import { SummaryCharts } from "@/components/tracking/summary-charts";
import { Button } from "@/components/ui/button";
import type { HelpTopic } from "@/lib/help";
import { integer, moneyOrZero, percentOf, percentOrZero, roasOrZero } from "@/lib/format";
import { METRIC } from "@/lib/metrics-glossary";
import { requireUser } from "@/server/auth/session";
import { getDashboardSummary, getFilterOptions, isStale, type SearchParams } from "@/server/data/tracking";

export const metadata: Metadata = { title: "Resumo" };

function delta(value: number | null) {
  if (value == null) return undefined;
  return { text: percentOf(Math.abs(value)) ?? "", direction: value >= 0 ? ("up" as const) : ("down" as const) };
}

function Group({ title, help, children }: { title: string; help: HelpTopic; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-2">
      <div className="flex items-center gap-1">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        <HelpTip topic={help} className="size-5" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">{children}</div>
    </section>
  );
}

// S17 Resumo: a operação inteira do período, com filtros por conta, produto e fonte.
// Sem venda ou sem gasto, os números aparecem zerados (R$ 0,00, ROAS 0,00, 0,0%).
export default async function SummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ dashboardId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { dashboardId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const [data, options] = await Promise.all([getDashboardSummary({ user }, dashboardId, sp), getFilterOptions({ user }, dashboardId)]);
  const { current: s, changes, period, filters } = data;
  const m = (cents: number | null) => moneyOrZero(cents, data.dashboard.currency);
  const filtered = filters.accounts.length + filters.products.length + filters.sources.length > 0;
  const hasData = s.spendCents > 0 || s.paidCount + s.pendingCount + s.refundedCount + s.chargebackCount > 0;

  const header = (
    <PageHeader
      title="Resumo"
      help="resumo"
      description={data.dashboard.name}
      actions={
        <>
          <PeriodFilter period={period} />
          <DashboardRefresh dashboardId={data.dashboard.id} lastSyncedAt={data.lastSyncedAt} stale={isStale(data.lastSyncedAt)} />
        </>
      }
    />
  );

  // Valor em outra moeda sem cotação: melhor não mostrar número nenhum do que um número errado.
  if (data.fxUnavailable) {
    return (
      <PageBody>
        {header}
        <Banner
          variant="error"
          title="Não deu para buscar a cotação do dia"
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={`/d/${data.dashboard.id}`}>Tentar de novo</Link>
            </Button>
          }
        >
          Este dashboard mostra os valores em {data.dashboard.currency}, e parte dos pedidos, gastos ou custos está em outra moeda. Sem a cotação, os
          números ficariam errados, então eles não aparecem. Confira a internet e tente de novo em alguns minutos.
        </Banner>
      </PageBody>
    );
  }

  return (
    <PageBody>
      {header}

      {data.setupIncomplete.length > 0 && (
        <Banner
          variant="warning"
          title="Configuração incompleta"
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={`/d/${data.dashboard.id}/integrations`}>Continuar a configuração</Link>
            </Button>
          }
        >
          Falta {data.setupIncomplete.join(" e ")}.
        </Banner>
      )}

      <FilterBar
        filters={[
          { name: "conta", label: "Conta de anúncio", options: options.accounts, selected: filters.accounts },
          { name: "fonte", label: "Fonte de tráfego", options: options.sources, selected: filters.sources },
          { name: "produto", label: "Produto", options: options.products, selected: filters.products },
        ]}
      />

      {!hasData && (
        <Banner variant="info" title="Sem vendas nem gasto neste período">
          Os valores ficam zerados até chegar o primeiro pedido ou gasto. Escolha outro período{filtered ? ", tire algum filtro" : ""} ou confira as
          integrações do dashboard.
        </Banner>
      )}

      <Group title="Resultado" help="resumo-resultado">
        <KpiCard {...METRIC.net} value={m(s.netCents)} delta={delta(changes.net)} />
        <KpiCard {...METRIC.spend} value={m(s.spendCents)} delta={delta(changes.spend)} polarity="down-good" />
        <KpiCard {...METRIC.roas} formula="faturamento líquido ÷ gasto com anúncios" value={roasOrZero(s.roas)} delta={delta(changes.roas)} />
        <KpiCard {...METRIC.profit} value={m(s.profitCents)} negative={s.profitCents < 0} delta={delta(changes.profit)} />
        <KpiCard {...METRIC.roi} value={percentOrZero(s.roi)} negative={(s.roi ?? 0) < 0} delta={delta(changes.roi)} />
        <KpiCard {...METRIC.margin} value={percentOrZero(s.margin)} negative={(s.margin ?? 0) < 0} delta={delta(changes.margin)} />
        <KpiCard {...METRIC.cpa} value={m(s.cpaCents)} />
        <KpiCard {...METRIC.ticket} value={m(s.averageTicketCents)} />
      </Group>

      <Group title="Vendas" help="resumo-vendas">
        <KpiCard {...METRIC.gross} value={m(s.grossCents)} polarity="neutral" />
        <KpiCard {...METRIC.paid} value={integer(s.paidCount)} polarity="neutral" />
        <KpiCard {...METRIC.pending} value={`${integer(s.pendingCount)} · ${m(s.pendingValueCents)}`} polarity="neutral" />
        <KpiCard {...METRIC.refunded} value={integer(s.refundedCount)} polarity="neutral" />
        <KpiCard {...METRIC.refundRate} value={percentOrZero(s.refundRate)} />
        <KpiCard {...METRIC.chargebackRate} value={percentOrZero(s.chargebackRate)} />
      </Group>

      <Group title="Custos" help="resumo-custos">
        {data.dashboard.adPlatforms.includes("meta") && <KpiCard {...METRIC.spendMeta} value={m(s.spendMetaCents)} polarity="neutral" />}
        {data.dashboard.adPlatforms.includes("google") && <KpiCard {...METRIC.spendGoogle} value={m(s.spendGoogleCents)} polarity="neutral" />}
        <KpiCard {...METRIC.productCost} value={m(s.productCostCents)} polarity="neutral" />
        <KpiCard {...METRIC.fees} value={m(s.feesCents)} polarity="neutral" />
        <KpiCard
          {...METRIC.expenses}
          formula={filtered ? "despesas não entram quando há filtro de conta, produto ou fonte" : METRIC.expenses.formula}
          value={m(s.expensesCents)}
          polarity="neutral"
        />
        <KpiCard {...METRIC.salesTax} value={m(s.salesTaxCents + s.extraTaxCents)} polarity="neutral" />
        <KpiCard {...METRIC.metaTax} value={m(s.metaAdsTaxCents)} polarity="neutral" />
        <KpiCard {...METRIC.taxes} value={m(s.taxesCents)} polarity="neutral" />
      </Group>

      <SummaryCharts charts={data.charts} currency={data.dashboard.currency} />

      <p className="text-xs text-muted-foreground">
        {period.label}, {period.description}, no fuso do dashboard. As vendas contam pelo dia do pedido.
        {data.previous ? " A comparação é com o mesmo número de dias logo antes." : ""}
      </p>
    </PageBody>
  );
}
