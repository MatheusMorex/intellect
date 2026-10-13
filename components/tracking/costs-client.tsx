"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bpToInput, centsToInput } from "@/lib/parse";
import { deleteAdditionalFee, deleteExpense, saveCostSettings, saveExpense, setProductCost, upsertAdditionalFee } from "@/server/actions/costs";

function FieldError({ id, error }: { id: string; error: string | null }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="text-sm text-danger">
      {error}
    </p>
  );
}

// ---- impostos -------------------------------------------------------------------------------

export function TaxForm({
  dashboardId,
  today,
  current,
  canManage,
}: {
  dashboardId: string;
  today: string;
  current: { salesTaxBp: number; metaAdsTaxBp: number; extraTaxes: { name: string; bp: number }[] } | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [extras, setExtras] = useState(
    (current?.extraTaxes ?? []).map((t, i) => ({ key: i, name: t.name, value: bpToInput(t.bp) })),
  );

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await saveCostSettings({
            dashboardId,
            validFrom: String(form.get("validFrom")),
            salesTax: String(form.get("salesTax") ?? "0"),
            metaAdsTax: String(form.get("metaAdsTax") ?? "0"),
            extraTaxes: extras.map((e) => ({ name: e.name, bp: e.value })),
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success("Impostos salvos");
          router.refresh();
        });
      }}
    >
      <fieldset disabled={!canManage} className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="salesTax">Imposto sobre vendas (%)</Label>
          <Input id="salesTax" name="salesTax" inputMode="decimal" defaultValue={bpToInput(current?.salesTaxBp ?? 0)} />
          <p className="text-xs text-muted-foreground">Sobre o faturamento líquido. Ex.: Simples Nacional.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="metaAdsTax">Imposto sobre anúncios do Meta (%)</Label>
          <Input id="metaAdsTax" name="metaAdsTax" inputMode="decimal" defaultValue={bpToInput(current?.metaAdsTaxBp ?? 0)} />
          <p className="text-xs text-muted-foreground">Sobre o gasto no Meta.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="validFrom">Vale a partir de</Label>
          <Input id="validFrom" name="validFrom" type="date" defaultValue={today} max={today} />
          <p className="text-xs text-muted-foreground">Vendas anteriores mantêm o imposto antigo.</p>
        </div>
      </fieldset>

      <fieldset disabled={!canManage} className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Impostos extras (sobre o líquido)</legend>
        {extras.map((e, i) => (
          <div key={e.key} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={`Nome do imposto extra ${i + 1}`}
              placeholder="Nome"
              value={e.name}
              className="w-56"
              onChange={(ev) => setExtras((list) => list.map((x) => (x.key === e.key ? { ...x, name: ev.target.value } : x)))}
            />
            <Input
              aria-label={`Percentual do imposto extra ${i + 1}`}
              placeholder="%"
              inputMode="decimal"
              value={e.value}
              className="w-24"
              onChange={(ev) => setExtras((list) => list.map((x) => (x.key === e.key ? { ...x, value: ev.target.value } : x)))}
            />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remover o imposto extra ${i + 1}`} onClick={() => setExtras((list) => list.filter((x) => x.key !== e.key))}>
              <X aria-hidden="true" />
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setExtras((list) => [...list, { key: Date.now(), name: "", value: "" }])}>
            <Plus aria-hidden="true" />
            Adicionar imposto extra
          </Button>
        </div>
      </fieldset>

      <FieldError id="tax-error" error={error} />
      {canManage ? (
        <div>
          <Button type="submit" loading={pending}>
            Salvar impostos
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Só quem administra o workspace muda impostos e custos.</p>
      )}
    </form>
  );
}

// ---- taxas adicionais ---------------------------------------------------------------------------

type Fee = {
  id: string;
  name: string;
  kind: "fixed" | "percent";
  amountCents: number | null;
  bp: number | null;
  scope: "all" | "product" | "payment_method";
  productId: string | null;
  paymentMethod: string | null;
  validFrom: string;
};

export function FeeDialog({
  dashboardId,
  today,
  products,
  fee,
  trigger,
}: {
  dashboardId: string;
  today: string;
  products: { id: string; name: string }[];
  fee?: Fee;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Fee["kind"]>(fee?.kind ?? "fixed");
  const [scope, setScope] = useState<Fee["scope"]>(fee?.scope ?? "all");
  const [productId, setProductId] = useState(fee?.productId ?? products[0]?.id ?? "");
  const [method, setMethod] = useState(fee?.paymentMethod ?? "credit_card");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await upsertAdditionalFee({
                dashboardId,
                feeId: fee?.id,
                name: String(form.get("name") ?? ""),
                kind,
                value: String(form.get("value") ?? ""),
                scope,
                productId: scope === "product" ? productId : null,
                paymentMethod: scope === "payment_method" ? (method as "credit_card") : null,
                validFrom: String(form.get("validFrom") ?? today),
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success(fee ? "Taxa atualizada" : "Taxa criada");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{fee ? "Editar taxa" : "Nova taxa adicional"}</DialogTitle>
            <DialogDescription>Entra no lucro de cada venda paga: por pedido (fixa) ou sobre o valor (percentual).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="fee-name">Nome (obrigatório)</Label>
            <Input id="fee-name" name="name" defaultValue={fee?.name} maxLength={100} placeholder="Ex.: Embalagem, frete subsidiado" />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Tipo</legend>
            <RadioGroup value={kind} onValueChange={(v) => setKind(v as Fee["kind"])} className="flex gap-6">
              <Label className="font-normal">
                <RadioGroupItem value="fixed" /> Valor fixo (R$)
              </Label>
              <Label className="font-normal">
                <RadioGroupItem value="percent" /> Percentual (%)
              </Label>
            </RadioGroup>
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="fee-value">{kind === "fixed" ? "Valor por pedido (R$)" : "Percentual sobre o valor (%)"}</Label>
            <Input
              id="fee-value"
              name="value"
              inputMode="decimal"
              defaultValue={fee ? (fee.kind === "fixed" ? centsToInput(fee.amountCents) : bpToInput(fee.bp)) : ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fee-scope">Aplica a</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as Fee["scope"])}>
              <SelectTrigger id="fee-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os pedidos</SelectItem>
                <SelectItem value="product" disabled={products.length === 0}>
                  Um produto (por unidade)
                </SelectItem>
                <SelectItem value="payment_method">Uma forma de pagamento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "product" && (
            <div className="grid gap-1.5">
              <Label htmlFor="fee-product">Produto</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger id="fee-product" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope === "payment_method" && (
            <div className="grid gap-1.5">
              <Label htmlFor="fee-method">Forma de pagamento</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="fee-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_card">Cartão</SelectItem>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="other">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="fee-from">Vale a partir de</Label>
            <Input id="fee-from" name="validFrom" type="date" defaultValue={fee?.validFrom ?? today} />
          </div>
          <FieldError id="fee-error" error={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              Salvar taxa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteButton({ label, description, onConfirm }: { label: string; description: string; onConfirm: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} disabled={pending}>
          <Trash2 aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => startTransition(onConfirm)}>
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function FeeDelete({ dashboardId, feeId, name }: { dashboardId: string; feeId: string; name: string }) {
  const router = useRouter();
  return (
    <DeleteButton
      label={`Excluir a taxa ${name}`}
      description="O lucro dos pedidos passados é recalculado sem ela."
      onConfirm={async () => {
        const result = await deleteAdditionalFee(dashboardId, feeId);
        if (!result.ok) toast.error(result.error);
        else toast("Taxa excluída");
        router.refresh();
      }}
    />
  );
}

export function ProductCostDialog({
  dashboardId,
  today,
  product,
}: {
  dashboardId: string;
  today: string;
  product: { id: string; name: string; costCents: number | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Editar o custo de ${product.name}`}>
          <Pencil aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await setProductCost({
                dashboardId,
                productId: product.id,
                cost: String(form.get("cost") ?? ""),
                validFrom: String(form.get("validFrom") ?? today),
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success("Custo salvo");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Custo de {product.name}</DialogTitle>
            <DialogDescription>Quanto custa cada unidade. Vendas anteriores à data mantêm o custo antigo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="cost">Custo por unidade (R$)</Label>
            <Input id="cost" name="cost" inputMode="decimal" autoFocus defaultValue={centsToInput(product.costCents)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cost-from">Vale a partir de</Label>
            <Input id="cost-from" name="validFrom" type="date" defaultValue={today} />
          </div>
          <FieldError id="cost-error" error={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              Salvar custo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- despesas ------------------------------------------------------------------------------------

type Expense = {
  id: string;
  kind: "once" | "recurring";
  category: "traffic" | "tools" | "staff" | "accounting" | "other";
  description: string;
  amountCents: number;
  date: string;
  endDate: string | null;
};

export const CATEGORY_OPTIONS = [
  { value: "traffic", label: "Tráfego" },
  { value: "tools", label: "Ferramentas" },
  { value: "staff", label: "Equipe" },
  { value: "accounting", label: "Contabilidade" },
  { value: "other", label: "Outros" },
] as const;

export function ExpenseDialog({ dashboardId, today, expense, trigger }: { dashboardId: string; today: string; expense?: Expense; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Expense["kind"]>(expense?.kind ?? "once");
  const [category, setCategory] = useState<Expense["category"]>(expense?.category ?? "tools");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const endDate = String(form.get("endDate") ?? "");
            startTransition(async () => {
              const result = await saveExpense({
                dashboardId,
                expenseId: expense?.id,
                kind,
                category,
                description: String(form.get("description") ?? ""),
                amount: String(form.get("amount") ?? ""),
                date: String(form.get("date") ?? today),
                endDate: kind === "recurring" && endDate ? endDate : null,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success(expense ? "Despesa atualizada" : "Despesa lançada");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{expense ? "Editar despesa" : "Nova despesa"}</DialogTitle>
            <DialogDescription>Gastos que não são anúncio. Entram no lucro do Resumo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="exp-description">Descrição (obrigatório)</Label>
            <Input id="exp-description" name="description" defaultValue={expense?.description} maxLength={200} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="exp-amount">Valor (R$)</Label>
              <Input id="exp-amount" name="amount" inputMode="decimal" defaultValue={centsToInput(expense?.amountCents)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="exp-category">Categoria</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Expense["category"])}>
                <SelectTrigger id="exp-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Tipo</legend>
            <RadioGroup value={kind} onValueChange={(v) => setKind(v as Expense["kind"])} className="flex gap-6">
              <Label className="font-normal">
                <RadioGroupItem value="once" /> Única
              </Label>
              <Label className="font-normal">
                <RadioGroupItem value="recurring" /> Todo mês
              </Label>
            </RadioGroup>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="exp-date">{kind === "recurring" ? "Primeiro mês (dia da cobrança)" : "Data"}</Label>
              <Input id="exp-date" name="date" type="date" defaultValue={expense?.date ?? today} />
            </div>
            {kind === "recurring" && (
              <div className="grid gap-1.5">
                <Label htmlFor="exp-end">Até (opcional)</Label>
                <Input id="exp-end" name="endDate" type="date" defaultValue={expense?.endDate ?? ""} />
              </div>
            )}
          </div>
          <FieldError id="exp-error" error={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              Salvar despesa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseDelete({ dashboardId, expenseId, description }: { dashboardId: string; expenseId: string; description: string }) {
  const router = useRouter();
  return (
    <DeleteButton
      label={`Excluir a despesa ${description}`}
      description="Se for mensal, todos os meses dela somem do lucro."
      onConfirm={async () => {
        const result = await deleteExpense(dashboardId, expenseId);
        if (!result.ok) toast.error(result.error);
        else toast("Despesa excluída");
        router.refresh();
      }}
    />
  );
}
