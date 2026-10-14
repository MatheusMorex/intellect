import { Package, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/ds/empty-state";
import { HelpTip } from "@/components/ds/help-tip";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { FeeDelete, FeeDialog, ProductCostDialog, TaxForm } from "@/components/tracking/costs-client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EMPTY, integer, money } from "@/lib/format";
import type { HelpTopic } from "@/lib/help";
import { bpToInput } from "@/lib/parse";
import { requireUser } from "@/server/auth/session";
import { getCostSettings } from "@/server/data/settings";

export const metadata: Metadata = { title: "Taxas" };

const METHOD: Record<string, string> = { credit_card: "Cartão", pix: "Pix", boleto: "Boleto", paypal: "PayPal", other: "Outros" };
const day = (key: string) => key.split("-").reverse().join("/");

function Section({
  title,
  description,
  help,
  actions,
  children,
}: {
  title: string;
  description?: string;
  help: HelpTopic;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-lg border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h2 className="text-base font-semibold">{title}</h2>
            <HelpTip topic={help} className="size-5" />
          </div>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

// S23 Taxas: impostos, taxas adicionais e custo de cada produto, para o lucro sair certo.
export default async function FeesPage({ params }: { params: Promise<{ dashboardId: string }> }) {
  const { dashboardId } = await params;
  const user = await requireUser();
  const data = await getCostSettings({ user }, dashboardId);
  const productOptions = data.products.map((p) => ({ id: p.id, name: p.name }));

  return (
    <PageBody>
      <PageHeader title="Taxas" help="taxas" description={data.dashboard.name} />

      <Section
        title="Impostos"
        help="taxas-impostos"
        description="Entram no lucro do Resumo e das campanhas. Mudar o percentual não muda o passado: vale a partir da data escolhida."
      >
        <TaxForm dashboardId={dashboardId} today={data.today} current={data.current} canManage={data.canManage} />
        {data.history.length > 1 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Histórico de impostos</summary>
            <ul className="mt-2 grid gap-1">
              {data.history.map((h) => (
                <li key={h.id}>
                  Desde {day(h.validFrom)}: vendas {bpToInput(h.salesTaxBp)}%, Meta {bpToInput(h.metaAdsTaxBp)}%
                  {h.extraTaxes.length ? `, extras ${h.extraTaxes.map((t) => `${t.name} ${bpToInput(t.bp)}%`).join(", ")}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section
        title="Taxas adicionais"
        help="taxas-adicionais"
        description="Custos por pedido que não são imposto: embalagem, brinde, frete subsidiado, taxa de antecipação."
        actions={
          data.canManage ? (
            <FeeDialog
              dashboardId={dashboardId}
              today={data.today}
              currency={data.dashboard.currency}
              products={productOptions}
              trigger={
                <Button>
                  <Plus aria-hidden="true" />
                  Nova taxa
                </Button>
              }
            />
          ) : undefined
        }
      >
        {data.fees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma taxa adicional.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Aplica a</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.fees.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell className="tabular">
                    {f.kind === "fixed"
                      ? `${f.amountCents == null ? EMPTY : money(f.amountCents, f.currency)} ${f.scope === "product" ? "por unidade" : "por pedido"}`
                      : `${bpToInput(f.bp)}% do valor`}
                  </TableCell>
                  <TableCell>
                    {f.scope === "all"
                      ? "Todos os pedidos"
                      : f.scope === "product"
                        ? `${f.productName} (por unidade)`
                        : `Pagamento: ${METHOD[f.paymentMethod ?? "other"]}`}
                  </TableCell>
                  <TableCell>{day(f.validFrom)}</TableCell>
                  <TableCell className="w-24 text-right">
                    {data.canManage && (
                      <>
                        <FeeDialog
                          dashboardId={dashboardId}
                          today={data.today}
                          currency={data.dashboard.currency}
                          products={productOptions}
                          fee={f}
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={`Editar a taxa ${f.name}`}>
                              <Pencil aria-hidden="true" />
                            </Button>
                          }
                        />
                        <FeeDelete dashboardId={dashboardId} feeId={f.id} name={f.name} />
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Custo por produto" help="taxas-produtos" description="Quanto custa cada unidade. Os produtos aparecem aqui depois da primeira venda.">
        {data.products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Nenhum produto ainda"
            description="Os produtos entram nesta lista quando a primeira venda deles chega da Shopify."
          />
        ) : (
          <Table className="tabular">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Unidades vendidas</TableHead>
                <TableHead className="text-right">Custo atual</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right">{integer(p.sold)}</TableCell>
                  <TableCell className="text-right">
                    {p.costCents == null ? <span className="text-warning">Sem custo</span> : money(p.costCents, p.costCurrency)}
                    {p.scheduled.length > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {p.scheduled.map((s) => `${money(s.costCents, s.currency)} a partir de ${day(s.validFrom)}`).join("; ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{p.validFrom ? day(p.validFrom) : EMPTY}</TableCell>
                  <TableCell className="w-12 text-right">
                    {data.canManage && <ProductCostDialog dashboardId={dashboardId} today={data.today} currency={data.dashboard.currency} product={p} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </PageBody>
  );
}
