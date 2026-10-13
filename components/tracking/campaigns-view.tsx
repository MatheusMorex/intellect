import { Plug } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ds/empty-state";
import { DashboardRefresh } from "@/components/shell/dashboard-refresh";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PeriodFilter } from "@/components/shell/period-filter";
import { CampaignTable } from "@/components/tracking/campaign-table";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";
import { listWritableLists } from "@/server/data/boards";
import { getCampaignReport, isStale, type Provider } from "@/server/data/tracking";

const NAMES: Record<Provider, string> = { meta: "Meta", google: "Google" };

// S18 Tráfego (Meta / Google). Nesta etapa: a aba Campanhas, sem editar status nem orçamento.
export async function CampaignsView({
  dashboardId,
  provider,
  periodo,
}: {
  dashboardId: string;
  provider: Provider;
  periodo?: string;
}) {
  const user = await requireUser();
  const report = await getCampaignReport({ user }, dashboardId, provider, periodo);
  const lists = listWritableLists({ user });

  return (
    <PageBody>
      <PageHeader
        title={NAMES[provider]}
        description={report.dashboard.name}
        actions={
          report.connected ? (
            <>
              <PeriodFilter value={report.period.id} description={report.period.description} />
              <DashboardRefresh
                dashboardId={report.dashboard.id}
                lastSyncedAt={report.lastSyncedAt}
                stale={isStale(report.lastSyncedAt)}
              />
            </>
          ) : undefined
        }
      />
      {!report.connected ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={Plug}
            title={`Nenhuma conta do ${NAMES[provider]} neste dashboard`}
            description="Conecte uma conta de anúncios para ver gasto, vendas e ROAS por campanha."
            action={
              <Button asChild>
                <Link href={`/d/${report.dashboard.id}/integrations`}>Ir para Integrações</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <CampaignTable
          dashboardId={report.dashboard.id}
          provider={provider}
          currency={report.dashboard.currency}
          periodLabel={`${report.period.label}, ${report.period.description}`}
          rows={report.rows}
          totals={report.totals}
          lists={lists}
        />
      )}
    </PageBody>
  );
}
