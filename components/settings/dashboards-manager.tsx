"use client";

// S20 Dashboards: criar um dashboard novo e excluir um que não serve mais.

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DashboardFields, type DashboardValues } from "@/components/settings/dashboard-settings";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { integer } from "@/lib/format";
import { createDashboard, deleteDashboard } from "@/server/actions/dashboards";

const EMPTY: DashboardValues = {
  name: "",
  currency: "BRL",
  timezone: "America/Sao_Paulo",
  revenueBasis: "net",
  includeInterest: false,
  adPlatforms: ["meta", "google"],
  weekStart: "monday",
};

export function NewDashboardButton({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DashboardValues>(EMPTY);
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (workspaces.length === 0) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setForm(EMPTY);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          Novo dashboard
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo dashboard</DialogTitle>
          <DialogDescription>Um dashboard por operação (uma loja, um produto, um país). Depois de criar, você liga as contas de anúncio e a loja.</DialogDescription>
        </DialogHeader>
        <form
          id="novo-dashboard"
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await createDashboard({ ...form, workspaceId });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success(`Dashboard ${form.name.trim()} criado`);
              setOpen(false);
              router.push(`/d/${result.data.id}/setup`);
            });
          }}
        >
          {workspaces.length > 1 && (
            <div className="grid gap-1.5">
              <Label htmlFor="novo-workspace">Workspace</Label>
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger id="novo-workspace" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <fieldset disabled={pending} className="grid gap-5">
            <DashboardFields form={form} setForm={setForm} idPrefix="novo" />
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button type="submit" form="novo-dashboard" loading={pending}>
            Criar dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Impact = { panels: number; expenses: number; cardLinks: number; automations: number };

export function DeleteDashboardButton({ dashboard }: { dashboard: { id: string; name: string } & Impact }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const goes = [
    dashboard.panels && `${integer(dashboard.panels)} ${dashboard.panels === 1 ? "painel" : "painéis"}`,
    dashboard.expenses && `${integer(dashboard.expenses)} ${dashboard.expenses === 1 ? "despesa" : "despesas"}`,
    dashboard.cardLinks && `${integer(dashboard.cardLinks)} ${dashboard.cardLinks === 1 ? "card ligado" : "cards ligados"} às métricas`,
    dashboard.automations && `${integer(dashboard.automations)} ${dashboard.automations === 1 ? "regra" : "regras"} de automação por métrica`,
  ].filter(Boolean);

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (open) {
          setTyped("");
          setError(null);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-danger hover:text-danger" aria-label={`Excluir o dashboard ${dashboard.name}`}>
          <Trash2 aria-hidden="true" />
          Excluir
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir o dashboard {dashboard.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Saem junto os impostos, as taxas, as despesas e os painéis dele{goes.length ? ` (${goes.join(", ")})` : ""}. Pedidos, campanhas e gastos continuam:
            são da loja e das contas de anúncio, e outro dashboard pode usar. Não dá para desfazer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`confirmar-${dashboard.id}`}>Para confirmar, digite o nome do dashboard</Label>
          <Input id={`confirmar-${dashboard.id}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder={dashboard.name} />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            loading={pending}
            disabled={typed.trim() !== dashboard.name}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteDashboard({ dashboardId: dashboard.id, confirmName: typed });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                toast.success(`Dashboard ${dashboard.name} excluído`);
                router.refresh();
              })
            }
          >
            Excluir dashboard
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
