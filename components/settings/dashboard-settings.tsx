"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { HelpTip } from "@/components/ds/help-tip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { msg as chartsMsg } from "@/lib/charts/messages";
import type { WeekStart } from "@/lib/charts/options";
import { DASHBOARD_CURRENCIES } from "@/lib/currency";
import type { HelpTopic } from "@/lib/help";
import { timezonesWith } from "@/lib/timezones";
import { updateDashboardSettings } from "@/server/actions/settings";

export type Dashboard = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  revenueBasis: "net" | "gross";
  includeInterest: boolean;
  adPlatforms: ("meta" | "google")[];
  weekStart: WeekStart;
};

const WEEK_STARTS: WeekStart[] = ["monday", "sunday"];

function Field({ label, htmlFor, help, children }: { label: string; htmlFor?: string; help: HelpTopic; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1">
        <Label htmlFor={htmlFor}>{label}</Label>
        <HelpTip topic={help} className="size-5" />
      </div>
      {children}
    </div>
  );
}

/** Os valores do dashboard que a pessoa escolhe (sem o id). */
export type DashboardValues = Omit<Dashboard, "id">;

/** Os campos do dashboard: os mesmos para editar (Configurações) e para criar (S20). */
export function DashboardFields<T extends DashboardValues>({ form, setForm, idPrefix }: { form: T; setForm: React.Dispatch<React.SetStateAction<T>>; idPrefix: string }) {
  const platform = (p: "meta" | "google", on: boolean) =>
    setForm((f) => ({ ...f, adPlatforms: on ? [...new Set([...f.adPlatforms, p])] : f.adPlatforms.filter((x) => x !== p) }));
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome do dashboard" htmlFor={`${idPrefix}-name`} help="config-dashboard-nome">
          <Input id={`${idPrefix}-name`} value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Moeda" htmlFor={`${idPrefix}-currency`} help="config-moeda">
          <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
            <SelectTrigger id={`${idPrefix}-currency`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DASHBOARD_CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.long}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Fuso horário" htmlFor={`${idPrefix}-tz`} help="config-fuso">
          <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
            <SelectTrigger id={`${idPrefix}-tz`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezonesWith(form.timezone).map(([v, t]) => (
                <SelectItem key={v} value={v}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Início da semana" htmlFor={`${idPrefix}-week`} help="config-semana">
          <Select value={form.weekStart} onValueChange={(v) => setForm({ ...form, weekStart: v as WeekStart })}>
            <SelectTrigger id={`${idPrefix}-week`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEK_STARTS.map((w) => (
                <SelectItem key={w} value={w}>
                  {chartsMsg.weekStart[w]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 flex items-center gap-1 text-sm font-medium">
          Faturamento usado nas contas
          <HelpTip topic="config-faturamento" className="size-5" />
        </legend>
        <RadioGroup value={form.revenueBasis} onValueChange={(v) => setForm({ ...form, revenueBasis: v as Dashboard["revenueBasis"] })} className="grid gap-2">
          <Label className="items-start gap-3 font-normal">
            <RadioGroupItem value="net" className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="font-medium">Líquido</span>
              <span className="text-xs text-muted-foreground">Tira a taxa da plataforma de pagamento antes de calcular ROAS, lucro e margem.</span>
            </span>
          </Label>
          <Label className="items-start gap-3 font-normal">
            <RadioGroupItem value="gross" className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="font-medium">Bruto</span>
              <span className="text-xs text-muted-foreground">Usa o valor pago pelo cliente, sem tirar a taxa.</span>
            </span>
          </Label>
        </RadioGroup>
      </fieldset>

      <div className="flex items-start justify-between gap-6">
        <div className="grid gap-0.5">
          <div className="flex items-center gap-1">
            <Label htmlFor={`${idPrefix}-interest`}>Contar os juros do parcelamento como venda</Label>
            <HelpTip topic="config-juros" className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">Desligado, os juros que o cliente paga no cartão parcelado ficam fora do faturamento.</p>
        </div>
        <Switch id={`${idPrefix}-interest`} checked={form.includeInterest} onCheckedChange={(v) => setForm({ ...form, includeInterest: v })} />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 flex items-center gap-1 text-sm font-medium">
          Plataformas de anúncio
          <HelpTip topic="config-plataformas" className="size-5" />
        </legend>
        <div className="flex flex-wrap gap-6">
          <Label className="font-normal">
            <Checkbox checked={form.adPlatforms.includes("meta")} onCheckedChange={(v) => platform("meta", v === true)} /> Meta (Facebook e Instagram)
          </Label>
          <Label className="font-normal">
            <Checkbox checked={form.adPlatforms.includes("google")} onCheckedChange={(v) => platform("google", v === true)} /> Google
          </Label>
        </div>
      </fieldset>
    </>
  );
}

// Aba Vendas e moeda de Configurações: como o dashboard calcula e mostra os números.
export function DashboardSettingsForm({ dashboard, canEdit }: { dashboard: Dashboard; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(dashboard);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-5 rounded-lg border bg-card p-4 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updateDashboardSettings({ ...form, dashboardId: dashboard.id });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success("Dashboard salvo");
          router.refresh();
        });
      }}
    >
      {!canEdit && <p className="text-sm text-muted-foreground">Só admins do workspace mudam estas configurações.</p>}
      <fieldset disabled={!canEdit || pending} className="grid gap-5">
        <DashboardFields form={form} setForm={setForm} idPrefix="dash" />
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {canEdit && (
        <div className="flex gap-2">
          <Button type="submit" loading={pending}>
            Salvar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setForm(dashboard)}>
            Desfazer mudanças
          </Button>
        </div>
      )}
    </form>
  );
}
