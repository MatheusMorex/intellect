"use client";

import { Check, Lock, MoreHorizontal, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { msg } from "@/lib/charts/messages";
import { PANEL_TEMPLATES, type PanelTemplateId } from "@/lib/charts/templates";
import { cn } from "@/lib/utils";
import { createPanel, deletePanel, duplicatePanel, movePanel, savePanelDefaults, setDefaultPanel, updatePanel } from "@/server/actions/panels";
import type { OpenPanel, PanelEditorData, PanelTab } from "@/server/data/panel-config";

// Abas dos painéis de um dashboard e, para o admin, o menu de cada painel
// (renomear, duplicar, padrão, ordem, quem vê, filtros padrão, excluir), o
// "Novo painel" a partir de um modelo e o botão de editar a grade.

const t = msg.panels;

type Props = {
  dashboardId: string;
  panels: PanelTab[];
  panel: OpenPanel | null;
  canEdit: boolean;
  editing: boolean;
  members: PanelEditorData["members"];
  /** Os filtros que estão na tela agora (para "Salvar como padrão"). */
  params: Record<string, string>;
};

function NewPanelDialog({ dashboardId, open, onOpenChange }: { dashboardId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<PanelTemplateId>("em-branco");
  const [pending, start] = useTransition();
  const create = () =>
    start(async () => {
      const result = await createPanel({ dashboardId, name: name || t.templates[template].name, template });
      if (!result.ok) return void toast.error(result.error);
      onOpenChange(false);
      setName("");
      router.push(`/d/${dashboardId}/paineis?painel=${result.data.id}&editar=1`);
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.newPanel}</DialogTitle>
          <DialogDescription>{t.templates[template].description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="panel-name">{t.name}</Label>
            <Input id="panel-name" value={name} maxLength={60} placeholder={t.templates[template].name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t.template}</Label>
            <RadioGroup value={template} onValueChange={(v) => setTemplate(v as PanelTemplateId)} className="grid gap-2">
              {PANEL_TEMPLATES.map((id) => (
                <label key={id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 text-sm has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem value={id} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{t.templates[id].name}</span>
                    <span className="block text-xs text-muted-foreground">{t.templates[id].description}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button onClick={create} disabled={pending}>
            {t.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ panel, open, onOpenChange }: { panel: OpenPanel; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState(panel.name);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const result = await updatePanel({ panelId: panel.id, name });
      if (!result.ok) return void toast.error(result.error);
      onOpenChange(false);
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.rename}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="panel-rename">{t.name}</Label>
          <Input id="panel-rename" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button onClick={save} disabled={pending || !name.trim()}>
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccessDialog({
  panel,
  members,
  open,
  onOpenChange,
}: {
  panel: OpenPanel;
  members: PanelEditorData["members"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [visibility, setVisibility] = useState(panel.visibility);
  const [viewers, setViewers] = useState(new Set(panel.viewerIds));
  const [membersCanFilter, setMembersCanFilter] = useState(panel.membersCanFilter);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const result = await updatePanel({ panelId: panel.id, visibility, viewerIds: [...viewers], membersCanFilter });
      if (!result.ok) return void toast.error(result.error);
      onOpenChange(false);
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.accessTitle}</DialogTitle>
          <DialogDescription>{t.accessDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as OpenPanel["visibility"])} className="grid gap-2">
            {(["workspace", "restricted"] as const).map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 text-sm">
                <RadioGroupItem value={v} />
                {v === "workspace" ? t.visibilityWorkspace : t.visibilityRestricted}
              </label>
            ))}
          </RadioGroup>
          {visibility === "restricted" && (
            <div className="grid gap-2 rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">{t.pickPeople}</p>
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={m.role === "admin" || viewers.has(m.id)}
                    disabled={m.role === "admin"}
                    onCheckedChange={(on) =>
                      setViewers((current) => {
                        const next = new Set(current);
                        if (on === true) next.add(m.id);
                        else next.delete(m.id);
                        return next;
                      })
                    }
                  />
                  {m.name}
                  {m.role === "admin" && <span className="text-xs text-muted-foreground">({t.admin})</span>}
                </label>
              ))}
            </div>
          )}
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>{t.membersCanFilter}</span>
            <Switch checked={membersCanFilter} onCheckedChange={setMembersCanFilter} aria-label={t.membersCanFilter} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button onClick={save} disabled={pending}>
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PanelTabs({ dashboardId, panels, panel, canEdit, editing, members, params }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [dialog, setDialog] = useState<"new" | "rename" | "access" | "delete" | null>(null);
  const [pending, start] = useTransition();
  const index = panel ? panels.findIndex((p) => p.id === panel.id) : -1;

  const editHref = (() => {
    const query = new URLSearchParams(search.toString());
    if (panel) query.set("painel", panel.id);
    if (editing) query.delete("editar");
    else query.set("editar", "1");
    return `${pathname}?${query.toString()}`;
  })();

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, done?: string) =>
    start(async () => {
      const result = await action();
      if (!result.ok) return void toast.error(result.error);
      if (done) toast.success(done);
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav aria-label={t.tabsLabel} className="flex min-w-0 flex-wrap items-center gap-1">
        {panels.map((p) => (
          <Link
            key={p.id}
            href={`/d/${dashboardId}/paineis?painel=${p.id}`}
            aria-current={p.id === panel?.id ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              p.id === panel?.id && "bg-muted text-foreground",
            )}
          >
            {p.restricted && <Lock aria-label={t.restricted} className="size-3.5" />}
            {p.name}
          </Link>
        ))}
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={() => setDialog("new")}>
            <Plus aria-hidden="true" className="size-4" />
            {t.newPanel}
          </Button>
        )}
      </nav>

      {canEdit && panel && (
        <div className="flex items-center gap-1">
          <Button asChild variant={editing ? "default" : "outline"} size="sm">
            <Link href={editHref}>
              {editing ? <Check aria-hidden="true" className="size-4" /> : <Pencil aria-hidden="true" className="size-4" />}
              {editing ? t.doneEditing : t.edit}
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t.menu} disabled={pending}>
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDialog("rename")}>{t.rename}</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  start(async () => {
                    const result = await duplicatePanel({ panelId: panel.id });
                    if (!result.ok) return void toast.error(result.error);
                    router.push(`/d/${dashboardId}/paineis?painel=${result.data.id}`);
                  })
                }
              >
                {t.duplicate}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={panel.isDefault} onSelect={() => run(() => setDefaultPanel({ panelId: panel.id }))}>
                {panel.isDefault ? t.isDefault : t.makeDefault}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index <= 0} onSelect={() => run(() => movePanel({ panelId: panel.id, direction: -1 }))}>
                {t.moveLeft}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index < 0 || index >= panels.length - 1} onSelect={() => run(() => movePanel({ panelId: panel.id, direction: 1 }))}>
                {t.moveRight}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setDialog("access")}>{t.access}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => run(() => savePanelDefaults({ panelId: panel.id, params }), t.defaultsSaved)}>{t.saveDefaults}</DropdownMenuItem>
              <DropdownMenuItem
                disabled={Object.keys(panel.defaults).length === 0}
                onSelect={() =>
                  start(async () => {
                    const result = await savePanelDefaults({ panelId: panel.id, params: {} });
                    if (!result.ok) return void toast.error(result.error);
                    toast.success(t.defaultsCleared);
                    router.push(`/d/${dashboardId}/paineis?painel=${panel.id}`);
                  })
                }
              >
                {t.clearDefaults}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={panels.length <= 1} className="text-danger" onSelect={() => setDialog("delete")}>
                {t.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {canEdit && <NewPanelDialog dashboardId={dashboardId} open={dialog === "new"} onOpenChange={(open) => setDialog(open ? "new" : null)} />}
      {canEdit && panel && dialog === "rename" && <RenameDialog panel={panel} open onOpenChange={(open) => setDialog(open ? "rename" : null)} />}
      {canEdit && panel && dialog === "access" && <AccessDialog panel={panel} members={members} open onOpenChange={(open) => setDialog(open ? "access" : null)} />}
      {canEdit && panel && (
        <AlertDialog open={dialog === "delete"} onOpenChange={(open) => setDialog(open ? "delete" : null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.deleteConfirm(panel.name)}</AlertDialogTitle>
              <AlertDialogDescription>{t.deleteDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  start(async () => {
                    const result = await deletePanel({ panelId: panel.id });
                    if (!result.ok) return void toast.error(result.error);
                    router.push(`/d/${dashboardId}/paineis`);
                  })
                }
              >
                {t.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
