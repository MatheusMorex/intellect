import type { Metadata } from "next";
import Link from "next/link";

import { Banner } from "@/components/ds/banner";
import { KpiCard } from "@/components/ds/kpi-card";
import { DashboardRefresh } from "@/components/shell/dashboard-refresh";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PeriodFilter } from "@/components/shell/period-filter";
import { FilterBar } from "@/components/tracking/filter-bar";
import { SummaryCharts } from "@/components/tracking/summary-charts";
import { Button } from "@/components/ui/button";
import { integer, money, percentOf, roas } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getDashboardSummary, getFilterOptions, isStale, type SearchParams } from "@/server/data/tracking";

export const metadata: Metadata = { title: "Resumo" };

function delta(value: number | null) {
  if (value == null) return undefined;
  return { text: percentOf(Math.abs(value)) ?? "", direction: value >= 0 ? ("up" as const) : ("down" as const) };
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">{children}</div>
    </section>
  );
}

// S17 Resumo: a operação inteira do período, com filtros por conta, produto e fonte.
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
  const m = (cents: number) => money(cents, data.dashboard.currency);
  const filtered = filters.accounts.length + filters.products.length + filters.sources.length > 0;
  const hasData = s.spendCents > 0 || s.paidCount + s.pendingCount + s.refundedCount + s.chargebackCount > 0;

  return (
    <PageBody>
      <PageHeader
        title="Resumo"
        description={data.dashboard.name}
        actions={
          <>
            <PeriodFilter period={period} />
            <DashboardRefresh dashboardId={data.dashboard.id} lastSyncedAt={data.lastSyncedAt} stale={isStale(data.lastSyncedAt)} />
          </>
        }
      />

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
          Escolha outro período{filtered ? ", tire algum filtro" : ""} ou confira as integrações do dashboard.
        </Banner>
      )}

      <Group title="Resultado">
        <KpiCard label="Faturamento líquido" formula="Vendas pagas − reembolsos − taxa da plataforma de pagamento" value={m(s.netCents)} delta={delta(changes.net)} />
        <KpiCard label="Gasto com anúncios" formula="Meta + Google no período" value={m(s.spendCents)} delta={delta(changes.spend)} polarity="down-good" />
        <KpiCard
          label="ROAS"
          formula="Faturamento líquido ÷ gasto com anúncios"
          value={roas(s.roas) ?? undefined}
          state={s.roas == null ? "empty" : "ready"}
          delta={delta(changes.roas)}
        />
        <KpiCard
          label="Lucro"
          formula="Líquido − gasto − impostos − custo dos produtos − taxas adicionais − despesas"
          value={m(s.profitCents)}
          negative={s.profitCents < 0}
          delta={delta(changes.profit)}
        />
        <KpiCard label="ROI" formula="Lucro ÷ gasto com anúncios" value={percentOf(s.roi) ?? undefined} state={s.roi == null ? "empty" : "ready"} negative={(s.roi ?? 0) < 0} delta={delta(changes.roi)} />
        <KpiCard label="Margem" formula="Lucro ÷ faturamento líquido" value={percentOf(s.margin) ?? undefined} state={s.margin == null ? "empty" : "ready"} negative={(s.margin ?? 0) < 0} delta={delta(changes.margin)} />
        <KpiCard label="CPA" formula="Gasto com anúncios ÷ vendas pagas" value={s.cpaCents == null ? undefined : m(s.cpaCents)} state={s.cpaCents == null ? "empty" : "ready"} />
        <KpiCard
          label="Ticket médio"
          formula="Faturamento bruto ÷ vendas pagas"
          value={s.averageTicketCents == null ? undefined : m(s.averageTicketCents)}
          state={s.averageTicketCents == null ? "empty" : "ready"}
        />
      </Group>

      <Group title="Vendas">
        <KpiCard label="Faturamento bruto" formula="Vendas pagas − reembolsos parciais (sem descontar taxas)" value={m(s.grossCents)} polarity="neutral" />
        <KpiCard label="Vendas pagas" formula="Pedidos pagos, pelo dia do pedido" value={integer(s.paidCount)} polarity="neutral" />
        <KpiCard label="Vendas pendentes" formula="Esperando pagamento (Pix e boleto ainda não pagos)" value={`${integer(s.pendingCount)} · ${m(s.pendingValueCents)}`} polarity="neutral" />
        <KpiCard label="Vendas reembolsadas" formula="Pedidos reembolsados no período" value={integer(s.refundedCount)} polarity="neutral" />
        <KpiCard label="% Reembolso" formula="Reembolsados ÷ (pagos + reembolsados + chargeback)" value={percentOf(s.refundRate) ?? undefined} state={s.refundRate == null ? "empty" : "ready"} />
        <KpiCard label="% Chargeback" formula="Chargebacks ÷ (pagos + reembolsados + chargeback)" value={percentOf(s.chargebackRate) ?? undefined} state={s.chargebackRate == null ? "empty" : "ready"} />
      </Group>

      <Group title="Custos">
        {data.dashboard.adPlatforms.includes("meta") && <KpiCard label="Gasto no Meta" formula="Soma do gasto das contas do Meta" value={m(s.spendMetaCents)} polarity="neutral" />}
        {data.dashboard.adPlatforms.includes("google") && <KpiCard label="Gasto no Google" formula="Soma do gasto das contas do Google" value={m(s.spendGoogleCents)} polarity="neutral" />}
        <KpiCard label="Custos de produto" formula="Custo de cada produto vendido, pelo valor que valia no dia da venda" value={m(s.productCostCents)} polarity="neutral" />
        <KpiCard label="Taxas adicionais" formula="Taxas fixas ou percentuais cadastradas em Taxas" value={m(s.feesCents)} polarity="neutral" />
        <KpiCard
          label="Despesas"
          formula={filtered ? "Despesas não entram quando há filtro de conta, produto ou fonte" : "Despesas lançadas em Despesas (únicas e mensais) no período"}
          value={m(s.expensesCents)}
          polarity="neutral"
        />
        <KpiCard label="Imposto sobre vendas" formula="Percentual de Taxas × faturamento líquido" value={m(s.salesTaxCents + s.extraTaxCents)} polarity="neutral" />
        <KpiCard label="Imposto sobre anúncios do Meta" formula="Percentual de Taxas × gasto no Meta" value={m(s.metaAdsTaxCents)} polarity="neutral" />
        <KpiCard label="Imposto total" formula="Vendas + anúncios do Meta + impostos extras" value={m(s.taxesCents)} polarity="neutral" />
      </Group>

      <SummaryCharts charts={data.charts} currency={data.dashboard.currency} />

      <p className="text-xs text-muted-foreground">
        {period.label}, {period.description}, no fuso do dashboard. As vendas contam pelo dia do pedido.
        {data.previous ? " A comparação é com o mesmo número de dias logo antes." : ""}
      </p>
    </PageBody>
  );
}
