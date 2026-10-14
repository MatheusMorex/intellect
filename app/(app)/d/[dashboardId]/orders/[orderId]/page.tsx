import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusPill, type PillStatus } from "@/components/ds/badges";
import { HelpTip } from "@/components/ds/help-tip";
import { PageBody } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTimeIn, EMPTY, money } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getOrderDetail } from "@/server/data/settings";
import type { OrderStatus, PaymentMethod, Visit } from "@/server/store/types";

export const metadata: Metadata = { title: "Pedido" };

const STATUS: Record<OrderStatus, { label: string; pill: PillStatus }> = {
  paid: { label: "Pago", pill: "paid" },
  waiting_payment: { label: "Pendente", pill: "pending" },
  refused: { label: "Recusado", pill: "refused" },
  cancelled: { label: "Cancelado", pill: "refused" },
  refunded: { label: "Reembolsado", pill: "refunded" },
  chargedback: { label: "Chargeback", pill: "chargeback" },
};
const METHOD: Record<PaymentMethod, string> = { pix: "Pix", credit_card: "Cartão", boleto: "Boleto", paypal: "PayPal", other: "Outro" };
const ATTRIBUTION = { tracked: "Rastreada", untracked: "Não rastreada", other_source: "Outras fontes", pending: "Identificando" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

function VisitBlock({ title, visit, tz }: { title: string; visit: Visit | null; tz: string }) {
  return (
    <section className="grid gap-2 rounded-md bg-muted p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {!visit ? (
        <p className="text-sm text-muted-foreground">A Shopify não registrou esta visita.</p>
      ) : (
        <dl className="grid gap-2">
          <Row label="Quando">{visit.occurredAt ? dateTimeIn(visit.occurredAt, tz, "dd/MM/yyyy HH:mm") : EMPTY}</Row>
          <Row label="Página de entrada">
            <code className="font-mono text-xs break-all">{visit.landingPage ?? EMPTY}</code>
          </Row>
          <Row label="UTMs">
            {Object.entries(visit.utm).filter(([, v]) => v).length === 0
              ? EMPTY
              : Object.entries(visit.utm)
                  .filter(([, v]) => v)
                  .map(([k, v]) => `utm_${k}=${v}`)
                  .join(" · ")}
          </Row>
        </dl>
      )}
    </section>
  );
}

// S19 detalhe do pedido: situação, itens, de onde veio e o histórico de eventos.
export default async function OrderPage({ params }: { params: Promise<{ dashboardId: string; orderId: string }> }) {
  const { dashboardId, orderId } = await params;
  const user = await requireUser();
  const detail = await getOrderDetail({ user }, dashboardId, orderId);
  if (!detail) notFound();
  const { order, dashboard } = detail;
  const tz = dashboard.timezone;

  return (
    <PageBody>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/d/${dashboardId}/orders`}>
            <ArrowLeft aria-hidden="true" />
            Vendas
          </Link>
        </Button>
        {detail.shopifyAdminUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={detail.shopifyAdminUrl} target="_blank" rel="noreferrer">
              Abrir na Shopify
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        )}
      </div>

      <article className="grid max-w-card-modal gap-6 rounded-lg border bg-card p-6">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl">Pedido {order.name}</h1>
          <HelpTip topic="pedido" className="-ml-2" />
          <StatusPill status={STATUS[order.status].pill}>{STATUS[order.status].label}</StatusPill>
          {order.isTest && <StatusPill status="test" />}
        </header>

        <dl className="grid gap-3">
          <Row label="Feito em">{dateTimeIn(order.placedAt, tz, "dd/MM/yyyy HH:mm")}</Row>
          <Row label="Pagamento">{METHOD[order.paymentMethod]}</Row>
          <Row label="Total">{money(order.totalCents, order.currency)}</Row>
          {order.refundedCents > 0 && <Row label="Reembolsado">{money(order.refundedCents, order.currency)}</Row>}
          <Row label="Taxa da plataforma">{order.gatewayFeeCents == null ? "Não informada pela Shopify" : money(order.gatewayFeeCents, order.currency)}</Row>
          <Row label="Origem">
            {ATTRIBUTION[order.attributionStatus]}
            {order.attributedPlatform && ` · ${order.attributedPlatform === "meta" ? "Meta" : "Google"}`}
            {detail.campaign && (
              <span className="block text-muted-foreground">{[detail.campaign, detail.adSet, detail.ad].filter(Boolean).join(" › ")}</span>
            )}
          </Row>
          {order.daysToConversion != null && (
            <Row label="Da primeira visita à compra">{order.daysToConversion === 0 ? "No mesmo dia" : `${order.daysToConversion} dias`}</Row>
          )}
        </dl>

        <section className="grid gap-2">
          <h2 className="text-base font-semibold">Itens</h2>
          <Table className="tabular">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.name}</TableCell>
                  <TableCell className="text-right">{i.quantity}</TableCell>
                  <TableCell className="text-right">{money(i.unitPriceCents, order.currency)}</TableCell>
                  <TableCell className="text-right">{money(i.totalCents, order.currency)}</TableCell>
                </TableRow>
              ))}
              {detail.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    O pedido chegou sem itens.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <section className="grid gap-3">
          <h2 className="text-base font-semibold">Jornada até a compra</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <VisitBlock title="Primeira visita" visit={order.firstVisit} tz={tz} />
            <VisitBlock title="Última visita (usada na atribuição)" visit={order.lastVisit} tz={tz} />
          </div>
        </section>

        <section className="grid gap-2">
          <h2 className="text-base font-semibold">Histórico</h2>
          <ol className="grid gap-2 border-l-2 pl-4">
            {detail.events.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="font-medium">{STATUS[e.status].label}</span>{" "}
                <span className="text-muted-foreground">
                  · {dateTimeIn(e.occurredAt, tz, "dd/MM/yyyy HH:mm")} · {e.topic}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <p className="text-xs text-muted-foreground">Nome, e-mail, telefone e endereço do comprador ficam só na Shopify.</p>
      </article>
    </PageBody>
  );
}
