"use client";

// Anexos no verso do card (S06/S07, F04): a lista (abrir, baixar, renomear, usar
// como capa, excluir) e o botão "Anexo" (arquivo do computador ou link).
// O arquivo sobe pela rota POST /api/cards/<id>/attachments, com a barra de progresso.

import { Download, FileText, ImageIcon, Link2, MoreHorizontal, Paperclip, Pencil, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { fileSize, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addLinkAttachment, deleteAttachment, renameAttachment, setAttachmentCover } from "@/server/actions/attachments";
import type { CardDetail } from "@/server/data/boards";

/** O mesmo limite do servidor (server/attachments.ts). */
const MAX_BYTES = 25 * 1024 * 1024;

type Attachment = CardDetail["attachments"][number];

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error ?? "Não deu certo.");
      else after?.();
      router.refresh();
    });
  return { pending, run };
}

/** Envia um arquivo com XMLHttpRequest (o fetch não informa o progresso do envio). */
function sendFile(cardId: string, file: File, onProgress: (fraction: number) => void): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/cards/${cardId}/attachments`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as { ok: boolean; error?: string };
        resolve(body.ok ? { ok: true } : { ok: false, error: body.error ?? "Não deu para anexar o arquivo." });
      } catch {
        resolve({ ok: false, error: xhr.status === 413 ? "O arquivo passou de 25 MB." : "Não deu para anexar o arquivo. Tente de novo." });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Sem conexão. Confira a internet e tente de novo." });
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

// ---- botão "Anexo" -------------------------------------------------------------------------------

export function AttachPopover({ cardId, trigger }: { cardId: string; trigger: React.ReactNode }) {
  const router = useRouter();
  const { pending, run } = useRun();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("O arquivo passou de 25 MB. Escolha um menor ou anexe um link.");
      return;
    }
    setProgress(0);
    const result = await sendFile(cardId, file, setProgress);
    setProgress(null);
    if (input.current) input.current.value = "";
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${file.name} anexado`);
    setOpen(false);
    router.refresh();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="mb-3 text-center text-sm font-semibold">Anexo</p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload(e.dataTransfer.files[0]);
          }}
          className={cn("grid justify-items-center gap-2 rounded-md border border-dashed p-4 text-center", dragging && "border-primary bg-primary-subtle")}
        >
          <input ref={input} type="file" className="sr-only" aria-label="Arquivo do computador" onChange={(e) => void upload(e.target.files?.[0])} />
          <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={progress != null}>
            <Upload aria-hidden="true" />
            Escolher arquivo
          </Button>
          <p className="text-xs text-muted-foreground">ou arraste o arquivo para cá (até 25 MB)</p>
          {progress != null && (
            <div className="grid w-full gap-1" role="status">
              <Progress value={Math.round(progress * 100)} aria-label="Enviando o arquivo" />
              <span className="text-xs text-muted-foreground">Enviando… {Math.round(progress * 100)}%</span>
            </div>
          )}
        </div>
        <form
          className="mt-4 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addLinkAttachment({ cardId, url, name: text.trim() || null }),
              () => {
                toast.success("Link anexado");
                setUrl("");
                setText("");
                setOpen(false);
              },
            );
          }}
        >
          <Label htmlFor="anexo-link">Link</Label>
          <Input id="anexo-link" type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <Label htmlFor="anexo-texto">Texto para mostrar (opcional)</Label>
          <Input id="anexo-texto" value={text} maxLength={256} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" loading={pending}>
            Anexar link
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

// ---- lista no verso ----------------------------------------------------------------------------------

export function AttachmentsSection({ detail }: { detail: CardDetail }) {
  if (detail.attachments.length === 0) return null;
  return (
    <section aria-labelledby="card-attachments" className="grid grid-cols-1 gap-3">
      <div className="flex items-center gap-3">
        <Paperclip aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <h3 id="card-attachments" className="flex-1 text-base font-semibold">
          Anexos
        </h3>
        {detail.canEdit && (
          <AttachPopover
            cardId={detail.card.id}
            trigger={
              <Button variant="secondary" size="sm">
                Adicionar
              </Button>
            }
          />
        )}
      </div>
      <ul className="grid grid-cols-1 gap-2">
        {detail.attachments.map((a) => (
          <AttachmentItem key={a.id} attachment={a} canEdit={detail.canEdit} />
        ))}
      </ul>
    </section>
  );
}

function AttachmentItem({ attachment: a, canEdit }: { attachment: Attachment; canEdit: boolean }) {
  const { pending, run } = useRun();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(a.name);
  const [confirm, setConfirm] = useState(false);
  const Icon = a.kind === "link" ? Link2 : a.isImage ? ImageIcon : FileText;

  const save = () => {
    setRenaming(false);
    const value = name.replace(/\s+/g, " ").trim();
    if (value && value !== a.name) run(() => renameAttachment({ attachmentId: a.id, name: value }));
    else setName(a.name);
  };

  return (
    <li className="flex min-w-0 items-center gap-3 rounded-md p-1 hover:bg-muted">
      <a
        href={a.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        tabIndex={-1}
        aria-hidden="true"
        className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem do anexo, servida pela rota com conferência de acesso */}
        {a.isImage ? <img src={a.href} alt="" loading="lazy" className="size-full object-cover" /> : <Icon className="size-6" />}
      </a>
      <div className="grid min-w-0 flex-1 gap-0.5">
        {renaming ? (
          <Input
            autoFocus
            aria-label="Nome do anexo"
            value={name}
            maxLength={256}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                e.stopPropagation();
                setName(a.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <a href={a.href} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
              {a.name}
            </a>
            {a.isCover && <span className="shrink-0 rounded-sm bg-primary-subtle px-1.5 text-[11px] font-medium text-primary">Capa</span>}
          </span>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {a.kind === "link" ? "Link" : fileSize(a.bytes ?? 0)} · anexado {relative(new Date(a.createdAt))}
          {a.uploader ? ` por ${a.uploader.name}` : ""}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Ações do anexo ${a.name}`} disabled={pending}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {a.downloadHref && (
            <DropdownMenuItem asChild>
              <a href={a.downloadHref} download>
                <Download aria-hidden="true" />
                Baixar
              </a>
            </DropdownMenuItem>
          )}
          {canEdit && (
            <>
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil aria-hidden="true" />
                Renomear
              </DropdownMenuItem>
              {a.isImage && (
                <DropdownMenuItem onSelect={() => run(() => setAttachmentCover({ attachmentId: a.id, cover: !a.isCover }))}>
                  <ImageIcon aria-hidden="true" />
                  {a.isCover ? "Tirar da capa" : "Usar como capa"}
                </DropdownMenuItem>
              )}
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
            <AlertDialogTitle>Excluir o anexo {a.name}?</AlertDialogTitle>
            <AlertDialogDescription>{a.kind === "link" ? "O link sai do card." : "O arquivo sai do card e não dá para recuperar."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run(() => deleteAttachment({ attachmentId: a.id }), () => toast.success("Anexo excluído"))}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
