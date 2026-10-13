import type { Metadata } from "next";

import { Banner } from "@/components/ds/banner";
import { KpiCard } from "@/components/ds/kpi-card";
import { DashboardRefresh } from "@/components/shell/dashboard-refresh";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PeriodFilter } from "@/components/shell/period-filter";
import { integer, money, percentOf, roas } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getDashboardSummary, isStale } from "@/server/data/tracking";

export const metadata: Metadata = { title: "Resumo" };

type Props = {
  params: Promise<{ dashboardId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function delta(value: number | null) {
  if (value == null) return undefined;
  return { text: percentOf(Math.abs(value)) ?? "", direction: value >= 0 ? ("up" as const) : ("down" as const) };
}

// S17 Resumo. Nesta etapa: faturamento, gasto, ROAS, lucro e as contagens de vendas.
export default async function SummaryPage({ params, searchParams }: Props) {
  const { dashboardId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const data = await getDashboardSummary({ user }, dashboardId, one(sp.periodo));
  const { current: s, changes, period } = data;
  const currency = data.dashboard.currency;
  const hasData = s.spendCents > 0 || s.paidCount + s.pendingCount + s.refundedCount + s.chargebackCount > 0;

  return (
    <PageBody>
      <PageHeader
        title="Resumo"
        description={data.dashboard.name}
        actions={
          <>
            <PeriodFilter value={period.id} description={period.description} />
            <DashboardRefresh
              dashboardId={data.dashboard.id}
              lastSyncedAt={data.lastSyncedAt}
              stale={isStale(data.lastSyncedAt)}
            />
          </>
        }
      />

      {!hasData && (
        <Banner variant="info" title="Sem vendas nem gasto neste período">
          Escolha outro período ou confira as integrações do dashboard.
        </Banner>
      )}

      <section aria-label="Números do período" className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        <KpiCard
          label="Faturamento líquido"
          formula="Vendas pagas − reembolsos − taxa da plataforma de pagamento"
          value={money(s.netCents, currency)}
          delta={delta(changes.net)}
        />
        <KpiCard
          label="Gasto com anúncios"
          formula="Soma do gasto no Meta e no Google no período"
          value={money(s.spendCents, currency)}
          delta={delta(changes.spend)}
          polarity="down-good"
        />
        <KpiCard
          label="ROAS"
          formula="Faturamento líquido ÷ gasto com anúncios"
          value={roas(s.roas) ?? undefined}
          state={s.roas == null ? "empty" : "ready"}
          delta={delta(changes.roas)}
        />
        <KpiCard
          label="Lucro"
          formula="Faturamento líquido − gasto (impostos, custos de produto, taxas e despesas entram com a tela de Taxas)"
          value={money(s.profitCents, currency)}
          negative={s.profitCents < 0}
          delta={delta(changes.profit)}
        />
        <KpiCard label="Vendas pagas" formula="Pedidos pagos no período (pelo dia do pedido)" value={integer(s.paidCount)} polarity="neutral" />
        <KpiCard
          label="Vendas pendentes"
          formula="Pedidos esperando pagamento (Pix e boleto ainda não pagos)"
          value={integer(s.pendingCount)}
          polarity="neutral"
        />
        <KpiCard
          label="CPA"
          formula="Gasto com anúncios ÷ vendas pagas"
          value={s.cpaCents == null ? undefined : money(s.cpaCents, currency)}
          state={s.cpaCents == null ? "empty" : "ready"}
        />
        <KpiCard
          label="Ticket médio"
          formula="Faturamento bruto ÷ vendas pagas"
          value={s.averageTicketCents == null ? undefined : money(s.averageTicketCents, currency)}
          state={s.averageTicketCents == null ? "empty" : "ready"}
        />
      </section>

      <p className="text-xs text-muted-foreground">
        {period.label}, {period.description}, no fuso do dashboard. As vendas contam pelo dia do pedido.
        {data.previous ? " A comparação é com o mesmo número de dias logo antes." : ""}
      </p>
    </PageBody>
  );
}
