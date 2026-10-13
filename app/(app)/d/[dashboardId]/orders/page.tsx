import { ReceiptText, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatusPill, type PillStatus } from "@/components/ds/badges";
import { EmptyState } from "@/components/ds/empty-state";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PeriodFilter } from "@/components/shell/period-filter";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTimeIn, integer, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { listOrders, ORDER_STATUS_FILTERS, type OrderLine, type OrderStatusFilter } from "@/server/data/orders";
import type { OrderStatus, PaymentMethod } from "@/server/store/types";

export const metadata: Metadata = { title: "Vendas" };

const STATUS: Record<OrderStatus, { label: string; pill: PillStatus }> = {
  paid: { label: "Pago", pill: "paid" },
  waiting_payment: { label: "Pendente", pill: "pending" },
  refused: { label: "Recusado", pill: "refused" },
  cancelled: { label: "Cancelado", pill: "refused" },
  refunded: { label: "Reembolsado", pill: "refunded" },
  chargedback: { label: "Chargeback", pill: "chargeback" },
};

const METHOD: Record<PaymentMethod, string> = {
  pix: "Pix",
  credit_card: "Cartão",
  boleto: "Boleto",
  paypal: "PayPal",
  other: "Outro",
};

const FILTER_LABEL: Record<OrderStatusFilter, string> = {
  todos: "Todos",
  pagos: "Pagos",
  pendentes: "Pendentes",
  recusados: "Recusados",
  reembolsados: "Reembolsados",
};

function Origin({ a, utmSource }: { a: OrderLine["attribution"]; utmSource: string | null }) {
  if (a.status === "untracked") return <span className="text-muted-foreground">Não rastreada</span>;
  if (a.status === "pending") return <span className="text-muted-foreground">Identificando…</span>;
  if (a.status === "other_source") {
    return (
      <span>
        Outras fontes <span className="text-muted-foreground">· {utmSource}</span>
      </span>
    );
  }
  const platform = a.platform === "google" ? "Google" : "Meta";
  return (
    <span className="grid max-w-96">
      <span className="truncate" title={a.campaign ?? undefined}>
        <span className="mr-1.5 rounded-sm border px-1 text-xs font-medium">{platform}</span>
        {a.campaign ?? "Campanha não encontrada"}
      </span>
      {(a.adSet || a.ad) && (
        <span className="truncate text-xs text-muted-foreground" title={[a.adSet, a.ad].filter(Boolean).join(" › ")}>
          {[a.adSet, a.ad].filter(Boolean).join(" › ")}
        </span>
      )}
    </span>
  );
}

// S19 Vendas (não existe na UTMify): ver e conferir os pedidos e de onde vieram.
export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ dashboardId: string }>;
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string; status?: string; q?: string }>;
}) {
  const { dashboardId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const data = await listOrders({ user }, dashboardId, { period: sp.periodo, de: sp.de, ate: sp.ate, status: sp.status, q: sp.q });
  const tz = data.dashboard.timezone;

  const hrefFor = (status: OrderStatusFilter) => {
    const q = new URLSearchParams();
    if (sp.periodo) q.set("periodo", sp.periodo);
    if (sp.de) q.set("de", sp.de);
    if (sp.ate) q.set("ate", sp.ate);
    if (sp.q) q.set("q", sp.q);
    if (status !== "todos") q.set("status", status);
    const s = q.toString();
    return `/d/${dashboardId}/orders${s ? `?${s}` : ""}`;
  };

  return (
    <PageBody>
      <PageHeader
        title="Vendas"
        description={data.dashboard.name}
        actions={<PeriodFilter period={data.period} />}
      />

      <form action={`/d/${dashboardId}/orders`} role="search" className="relative w-full sm:w-80">
        {(["periodo", "de", "ate", "status"] as const).map((k) => (sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null))}
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" name="q" defaultValue={data.q} placeholder="Buscar pelo número do pedido…" aria-label="Buscar pedido" className="pl-8" />
      </form>

      <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-1 rounded-md bg-muted p-1 sm:w-fit">
        {ORDER_STATUS_FILTERS.map((f) => (
          <Link
            key={f}
            href={hrefFor(f)}
            aria-current={data.status === f ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-sm px-3 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              data.status === f && "bg-card font-semibold text-foreground shadow-card",
            )}
          >
            {FILTER_LABEL[f]}
            <span className="text-xs tabular">{integer(data.counts[f])}</span>
          </Link>
        ))}
      </nav>

      {data.rows.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={ReceiptText}
            title={data.status === "todos" ? "Nenhuma venda neste período" : "Nenhuma venda com essa situação"}
            description={
              data.status === "todos"
                ? "Os pedidos chegam da Shopify assim que são feitos. Escolha outro período para ver vendas anteriores."
                : "Troque o filtro ou o período."
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table className="tabular">
            <TableCaption className="sr-only">
              Vendas, {data.period.label}, {data.period.description}
            </TableCaption>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-muted">
                <TableHead>Data</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Produtos</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Origem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{dateTimeIn(o.placedAt, tz)}</TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/d/${dashboardId}/orders/${o.id}`}
                      className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {o.name}
                    </Link>
                    {o.isTest && (
                      <span className="ml-1.5">
                        <StatusPill status="test" />
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={STATUS[o.status].pill}>{STATUS[o.status].label}</StatusPill>
                  </TableCell>
                  <TableCell>{METHOD[o.paymentMethod]}</TableCell>
                  <TableCell className="max-w-64">
                    <span className="block truncate" title={o.products}>
                      {o.products || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{money(o.totalCents, o.currency)}</TableCell>
                  <TableCell>
                    <Origin a={o.attribution} utmSource={o.utmSource} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data.total > data.shown && (
        <p className="text-xs text-muted-foreground">
          Mostrando as {integer(data.shown)} vendas mais recentes de {integer(data.total)}. Diminua o período para ver as
          outras.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Horários no fuso do dashboard. Sem nome, e-mail ou telefone do comprador: esses dados ficam só na Shopify.
      </p>
    </PageBody>
  );
}
