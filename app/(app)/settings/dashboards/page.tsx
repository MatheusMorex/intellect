import { BarChart3, ExternalLink, Plug, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/ds/empty-state";
import { DeleteDashboardButton, NewDashboardButton } from "@/components/settings/dashboards-manager";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { DASHBOARD_CURRENCIES } from "@/lib/currency";
import { TIMEZONES } from "@/lib/timezones";
import { requireUser } from "@/server/auth/session";
import { listDashboardsForSettings } from "@/server/data/settings";

export const metadata: Metadata = { title: "Dashboards" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// S20 Dashboards: um por operação (loja, produto, país), cada um com moeda, fuso, contas e loja.
export default async function DashboardsPage() {
  const user = await requireUser();
  const { workspaces, dashboards } = await listDashboardsForSettings({ user });
  const adminOf = workspaces.filter((w) => w.role === "admin");
  const currency = (code: string) => DASHBOARD_CURRENCIES.find((c) => c.code === code)?.long ?? code;
  const timezone = (tz: string) => TIMEZONES.find(([v]) => v === tz)?.[1] ?? tz;

  return (
    <PageBody>
      <PageHeader
        title="Dashboards"
        help="dashboards"
        description="Um dashboard para cada operação: uma loja, um produto ou um país, cada um com a sua moeda, o seu fuso e as suas contas."
        actions={<NewDashboardButton workspaces={adminOf.map((w) => ({ id: w.id, name: w.name }))} />}
      />

      {dashboards.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={BarChart3}
            title="Nenhum dashboard ainda"
            description={
              adminOf.length > 0
                ? "Crie o primeiro dashboard para ver vendas, anúncios e lucro da sua operação."
                : "Peça para um admin do workspace criar o primeiro dashboard."
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {dashboards.map((d) => {
            const missing = [
              ...(d.adPlatforms.includes("meta") && d.metaAccounts === 0 ? ["Meta"] : []),
              ...(d.adPlatforms.includes("google") && d.googleAccounts === 0 ? ["Google"] : []),
              ...(d.stores === 0 ? ["loja"] : []),
            ];
            return (
              <li key={d.id} className="grid gap-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid min-w-0 gap-0.5">
                    <h2 className="truncate text-base font-semibold">{d.name}</h2>
                    {workspaces.length > 1 && <p className="text-xs text-muted-foreground">{d.workspaceName}</p>}
                  </div>
                  {d.canManage && <DeleteDashboardButton dashboard={d} />}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Moeda</dt>
                  <dd>{currency(d.currency)}</dd>
                  <dt className="text-muted-foreground">Fuso</dt>
                  <dd className="min-w-0 truncate">{timezone(d.timezone)}</dd>
                  <dt className="text-muted-foreground">Anúncios</dt>
                  <dd>
                    {d.adPlatforms.length === 0
                      ? "nenhuma plataforma"
                      : [
                          ...(d.adPlatforms.includes("meta") ? [`Meta: ${plural(d.metaAccounts, "conta", "contas")}`] : []),
                          ...(d.adPlatforms.includes("google") ? [`Google: ${plural(d.googleAccounts, "conta", "contas")}`] : []),
                        ].join(" · ")}
                  </dd>
                  <dt className="text-muted-foreground">Loja</dt>
                  <dd>{d.stores === 0 ? "nenhuma ligada" : plural(d.stores, "loja ligada", "lojas ligadas")}</dd>
                </dl>
                {missing.length > 0 && (
                  <p className="text-sm text-warning">
                    Falta ligar: {missing.join(", ")}.{" "}
                    <Link href={`/d/${d.id}/setup`} className="font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Continuar a configuração
                    </Link>
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/d/${d.id}`}>
                      <ExternalLink aria-hidden="true" />
                      Abrir
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/settings?aba=vendas&dashboard=${d.id}`}>
                      <Settings2 aria-hidden="true" />
                      Moeda e regras
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/d/${d.id}/integrations`}>
                      <Plug aria-hidden="true" />
                      Integrações
                    </Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageBody>
  );
}
