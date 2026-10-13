"use client";

import { Copy, MoreHorizontal, Pencil, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { copyAutomation, deleteAutomation, pressButton, runMetricNow, toggleAutomation } from "@/server/actions/automation";

export function AutomationToggle({ id, name, enabled, disabled }: { id: string; name: string; enabled: boolean; disabled: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [on, setOn] = useOptimistic(enabled);
  return (
    <Switch
      checked={on}
      disabled={disabled}
      aria-label={`${name}: ${on ? "ligada" : "desligada"}`}
      onCheckedChange={(v) =>
        startTransition(async () => {
          setOn(v);
          const result = await toggleAutomation(id, v);
          if (!result.ok) toast.error(result.error);
          else toast.success(v ? "Automação ligada" : "Automação desligada");
          router.refresh();
        })
      }
    />
  );
}

export function AutomationMenu({ id, name, boardId, type, canEdit }: { id: string; name: string; boardId: string; type: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error);
      else toast.success(done);
      router.refresh();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${name}`} disabled={pending}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem asChild>
              <Link href={`/b/${boardId}/automation/${id}`}>
                <Pencil aria-hidden="true" />
                Editar
              </Link>
            </DropdownMenuItem>
          )}
          {canEdit && type === "metric" && (
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  const result = await runMetricNow(id);
                  if (!result.ok) toast.error(result.error);
                  else toast.success(result.data.matched === 0 ? "Rodou: nada bateu as condições agora" : `Rodou: ${result.data.matched} bateram as condições, ${result.data.runs} execuções novas`);
                  router.refresh();
                })
              }
            >
              <Play aria-hidden="true" />
              Rodar agora
            </DropdownMenuItem>
          )}
          {canEdit && type === "board_button" && (
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  const result = await pressButton(id, null);
                  if (!result.ok) toast.error(result.error);
                  else if (result.data.status === "error") toast.error(result.data.message ?? "A automação deu erro.");
                  else toast.success("Botão acionado");
                  router.refresh();
                })
              }
            >
              <Play aria-hidden="true" />
              Acionar agora
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem onSelect={() => run(() => copyAutomation(id), "Cópia criada (desligada)")}>
              <Copy aria-hidden="true" />
              Copiar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/b/${boardId}/automation?aba=historico&automacao=${id}`}>Ver execuções</Link>
          </DropdownMenuItem>
          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                <Trash2 aria-hidden="true" />
                Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a automação {name}?</AlertDialogTitle>
            <AlertDialogDescription>Ela para de rodar na hora. O histórico de execuções continua, marcado como automação excluída.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run(() => deleteAutomation(id), "Automação excluída")}>
              Excluir automação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
