"use client";

import { Plus, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { CreateBoardDialog } from "@/components/board/create-board-dialog";
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
import { cn } from "@/lib/utils";
import { deleteBoard, setBoardClosed, starBoard } from "@/server/actions/kanban";
import type { BoardSummary } from "@/server/data/boards";

// Bloco de quadro do Início (S03): abre o quadro; a estrela favorita sem sair da página.
export function BoardTile({ board }: { board: BoardSummary }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [starred, setStarred] = useOptimistic(board.starred);
  return (
    <li className="group relative">
      <Link
        href={`/b/${board.id}`}
        className="flex h-24 rounded-lg p-3 pr-10 text-sm font-semibold break-words text-white outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ background: `var(--ds-label-${board.background}-bold)` }}
      >
        <span className="line-clamp-3">{board.name}</span>
      </Link>
      <button
        type="button"
        aria-pressed={starred}
        aria-label={starred ? `Tirar ${board.name} dos favoritos` : `Favoritar ${board.name}`}
        onClick={() =>
          startTransition(async () => {
            setStarred(!starred);
            await starBoard(board.id, !starred);
            router.refresh();
          })
        }
        className={cn(
          "absolute right-2 bottom-2 grid size-8 place-items-center rounded-md text-white outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white",
          !starred && "md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100",
        )}
      >
        <Star aria-hidden="true" className={cn("size-4", starred && "fill-current text-[var(--ds-label-yellow)]")} />
      </button>
    </li>
  );
}

export function CreateBoardTile({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  return (
    <li>
      <CreateBoardDialog
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        trigger={
          <button
            type="button"
            className="flex h-24 w-full items-center justify-center gap-2 rounded-lg bg-muted text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus aria-hidden="true" className="size-4" />
            Criar quadro
          </button>
        }
      />
    </li>
  );
}

// Quadros fechados: reabrir ou excluir de vez (só admin do quadro; o servidor confere).
export function ClosedBoardRow({ board }: { board: BoardSummary }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error);
      else toast.success(done);
      router.refresh();
    });
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <span aria-hidden="true" className="size-8 shrink-0 rounded-md" style={{ background: `var(--ds-label-${board.background}-bold)` }} />
      <Link href={`/b/${board.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
        {board.name}
      </Link>
      <Button size="sm" variant="outline" loading={pending} onClick={() => act(() => setBoardClosed(board.id, false), "Quadro reaberto")}>
        Reabrir
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost" className="text-danger hover:text-danger">
            Excluir
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {board.name} para sempre?</AlertDialogTitle>
            <AlertDialogDescription>Listas, cards, comentários e anexos somem junto. Não tem como desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => act(() => deleteBoard(board.id), "Quadro excluído")}>
              Excluir quadro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
