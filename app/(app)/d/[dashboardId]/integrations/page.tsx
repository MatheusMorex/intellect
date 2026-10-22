import { AlertTriangle, CheckCircle2, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatusPill, type PillStatus } from "@/components/ds/badges";
import { Banner } from "@/components/ds/banner";
import { CodeBox } from "@/components/ds/code-box";
import { HelpTip } from "@/components/ds/help-tip";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import {
  AccountSwitch,
  ImportOrdersButton,
  IntegrationTestForm,
  ProviderActions,
  StoreSwitch,
  UtmGenerator,
} from "@/components/tracking/integrations-client";
import { dateTimeIn, relative } from "@/lib/format";
import type { HelpTopic } from "@/lib/help";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getIntegrations } from "@/server/data/settings";

export const metadata: Metadata = { title: "Integrações" };

const TABS = [
  { id: "anuncios", label: "Anúncios" },
  { id: "loja", label: "Loja" },
  { id: "utms", label: "UTMs" },
  { id: "testes", label: "Testes" },
] as const;

const CONNECTION: Record<string, { label: string; pill: PillStatus }> = {
  active: { label: "Conectada", pill: "connected" },
  expired: { label: "Token vencido", pill: "error" },
  revoked: { label: "Desconectada", pill: "waiting" },
  error: { label: "Erro na conexão", pill: "error" },
};

const TEST_STATUS: Record<string, { label: string; pill: PillStatus }> = {
  waiting: { label: "Aguardando o pedido", pill: "waiting" },
  received: { label: "Recebido, sem atribuição", pill: "expiring" },
  attributed: { label: "Recebido e atribuído", pill: "connected" },
  failed: { label: "Falhou", pill: "error" },
};

function Section({ title, description, help, children }: { title: string; description?: string; help: HelpTopic; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-lg border bg-card p-4 sm:p-6">
      <div>
        <div className="flex items-center gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <HelpTip topic={help} className="size-5" />
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// S21 Integrações e S22 Rastreamento (aba UTMs).
export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ dashboardId: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { dashboardId } = await params;
  const { aba } = await searchParams;
  const tab = TABS.some((t) => t.id === aba) ? aba! : "anuncios";
  const user = await requireUser();
  const data = await getIntegrations({ user }, dashboardId);
  const tz = data.dashboard.timezone;
  const webhookUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/api/webhooks/shopify`;

  return (
    <PageBody>
      <PageHeader title="Integrações" help="integracoes" description={data.dashboard.name} />
      {data.mode === "fake" && (
        <Banner variant="info" title="Modo de teste">
          Meta, Google e Shopify estão simulados com dados de exemplo. Nenhuma conta real é acessada. A conexão real entra quando o dono do negócio aprovar.
        </Banner>
      )}

      <nav aria-label="Seções de integrações" className="flex flex-wrap items-end gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/d/${dashboardId}/integrations?aba=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 pb-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              tab === t.id && "border-primary font-semibold text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "anuncios" &&
        data.providers.map((p) => {
          const status = p.connection ? CONNECTION[p.connection.status] : null;
          const name = p.provider === "meta" ? "Meta Ads" : "Google Ads";
          return (
            <Section
              key={p.provider}
              title={name}
              help="integ-anuncios"
              description={
                p.provider === "meta"
                  ? "Gasto, impressões e cliques por anúncio e por dia, e o status das campanhas."
                  : "Gasto por anúncio e por dia, palavras-chave e o status das campanhas."
              }
            >
              <div className="flex flex-wrap items-center gap-3">
                {status ? <StatusPill status={status.pill}>{status.label}</StatusPill> : <StatusPill status="waiting">Não conectada</StatusPill>}
                {p.connection?.userName && <span className="text-sm text-muted-foreground">por {p.connection.userName}</span>}
                {p.connection?.daysLeft != null && p.connection.status === "active" && (
                  <span className={cn("text-sm", p.connection.daysLeft <= 7 ? "text-warning" : "text-muted-foreground")}>
                    {p.connection.daysLeft <= 7 && <AlertTriangle aria-hidden="true" className="mr-1 inline size-3.5" />}O acesso vence em{" "}
                    {p.connection.daysLeft} dias
                  </span>
                )}
              </div>
              <ProviderActions
                dashboardId={dashboardId}
                provider={p.provider}
                connected={p.connection?.status === "active"}
                canManage={data.canManage}
                mode={data.mode}
              />
              {p.accounts.length > 0 && (
                <ul className="divide-y rounded-md border">
                  {p.accounts.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 p-3">
                      <AccountSwitch dashboardId={dashboardId} accountId={a.id} name={a.name} linked={a.linked} canManage={data.canManage} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.externalId} · {a.currency} · {a.timezone}
                        </p>
                      </div>
                      <div className="text-right text-xs">
                        {a.lastSyncError ? (
                          <span className="text-danger">{a.lastSyncError}</span>
                        ) : a.lastSyncedAt ? (
                          <span className="text-muted-foreground" title={dateTimeIn(a.lastSyncedAt, tz, "dd/MM/yyyy HH:mm")} suppressHydrationWarning>
                            Atualizada {relative(new Date(a.lastSyncedAt))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Ainda não sincronizada</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          );
        })}

      {tab === "loja" && (
        <>
          <Section title="Shopify" help="integ-loja" description="Os pedidos chegam por webhook assim que são feitos; a origem vem da jornada do cliente na Shopify.">
            {!data.shop ? (
              <p className="text-muted-foreground">
                {data.stores.length > 0
                  ? "Nenhuma loja ligada a este dashboard. Escolha abaixo de qual loja do workspace vêm os pedidos."
                  : "Nenhuma loja instalada no workspace ainda. A instalação do app da Shopify chega com a integração real."}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <ShoppingBag aria-hidden="true" className="size-5 text-primary" />
                  <span className="font-medium">{data.shop.name}</span>
                  <span className="text-sm text-muted-foreground">{data.shop.domain}</span>
                  <StatusPill status={data.shop.status === "active" ? "connected" : "error"}>
                    {data.shop.status === "active" ? "Instalada" : data.shop.status === "uninstalled" ? "Desinstalada" : "Erro"}
                  </StatusPill>
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Webhooks</dt>
                    <dd className="flex items-center gap-1.5">
                      {data.shop.webhooksOk ? (
                        <>
                          <CheckCircle2 aria-hidden="true" className="size-4 text-success" /> Registrados
                        </>
                      ) : (
                        <>
                          <AlertTriangle aria-hidden="true" className="size-4 text-warning" /> Faltando
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Último pedido</dt>
                    <dd>
                      {data.shop.lastOrder
                        ? `${data.shop.lastOrder.name} · ${dateTimeIn(data.shop.lastOrder.placedAt, tz, "dd/MM HH:mm")}`
                        : "Aguardando o primeiro pedido"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Pedidos recebidos</dt>
                    <dd>{data.shop.ordersCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Entregas com problema</dt>
                    <dd>{data.shop.failedDeliveries}</dd>
                  </div>
                </dl>
                <div className="grid gap-2">
                  <p className="text-sm font-medium">Endereço do webhook</p>
                  <CodeBox label="Endereço do webhook da Shopify" value={webhookUrl} />
                </div>
                <div>
                  <ImportOrdersButton mode={data.mode} />
                </div>
              </>
            )}
          </Section>
          {data.stores.length > 0 && (
            <Section title="Lojas do workspace" help="integ-loja" description="De qual loja vêm os pedidos deste dashboard. A mesma loja pode servir a mais de um dashboard.">
              <ul className="divide-y rounded-md border">
                {data.stores.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                    <StoreSwitch dashboardId={dashboardId} storeId={s.id} name={s.name} linked={s.linked} canManage={data.canManage} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.domain}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      {tab === "utms" && (
        <>
          <Section
            title="Meta Ads: parâmetros de URL"
            help="integ-meta-url"
            description="Cole no campo Parâmetros de URL de cada anúncio (ou no nível da campanha). Os ids não mudam quando você renomeia a campanha."
          >
            <CodeBox label="Parâmetros de URL do Meta" value={data.templates.meta} wrap />
          </Section>
          <Section title="Google Ads: sufixo de URL final" help="integ-google-url" description="Cole em Configurações da conta → Sufixo de URL final. Vale para todas as campanhas da conta.">
            <CodeBox label="Sufixo de URL final do Google" value={data.templates.google} wrap />
          </Section>
          <Section title="UTMs para tráfego orgânico" help="integ-utm-organico" description="Para links na bio, no WhatsApp ou no e-mail: a venda aparece em Outras fontes com a origem certa.">
            <UtmGenerator />
          </Section>
        </>
      )}

      {tab === "testes" && (
        <>
          <Section title="Testar a integração" help="integ-teste" description="Gera um link de teste. A compra feita por ele aparece aqui e não entra nos números do dashboard.">
            <IntegrationTestForm dashboardId={dashboardId} canManage={data.canManage} mode={data.mode} />
          </Section>
          <Section title="Últimos testes" help="integ-testes-lista">
            {data.tests.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum teste ainda.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {data.tests.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <StatusPill status={TEST_STATUS[t.status].pill}>{TEST_STATUS[t.status].label}</StatusPill>
                    <span className="font-medium">{t.source === "meta" ? "Meta" : t.source === "google" ? "Google" : "Orgânico"}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={t.url}>
                      {t.url}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      código {t.code}
                      {t.orderName ? ` · pedido ${t.orderName}` : ""} · {dateTimeIn(t.createdAt, tz, "dd/MM HH:mm")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </PageBody>
  );
}
