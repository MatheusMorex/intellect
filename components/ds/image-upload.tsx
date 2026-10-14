"use client";

import { ImageUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { IMAGE_ACCEPT, prepareImage, type ImagePurpose } from "@/lib/image-prepare";

// Botão "Importar do computador": abre o seletor de arquivos, prepara a imagem
// no navegador (lib/image-prepare.ts) e envia para /api/uploads.

export function ImageUploadButton({
  kind,
  boardId,
  label = "Importar imagem do computador",
  successMessage = "Imagem salva",
  variant = "outline",
  size = "default",
  disabled = false,
  className,
}: {
  kind: ImagePurpose;
  boardId?: string;
  label?: string;
  successMessage?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "default" | "sm";
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const blob = await prepareImage(file, kind);
      const form = new FormData();
      form.set("kind", kind);
      if (boardId) form.set("boardId", boardId);
      form.set("file", blob, blob.type === "image/webp" ? "imagem.webp" : "imagem.jpg");
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const result = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!res.ok || !result?.ok) throw new Error(result?.error ?? "Não deu para enviar a imagem. Tente de novo.");
      toast.success(successMessage);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu para enviar a imagem.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button type="button" variant={variant} size={size} loading={busy} disabled={disabled} className={className} onClick={() => input.current?.click()}>
        <ImageUp aria-hidden="true" />
        {label}
      </Button>
    </>
  );
}
