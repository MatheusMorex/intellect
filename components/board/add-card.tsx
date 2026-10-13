"use client";

import { Plus, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createCard } from "@/server/actions/cards";

// Compositor de card no rodapé da lista (components.md, "Coluna de lista"):
// Enter adiciona e mantém aberto; Esc fecha.
export function AddCard({ boardId, listId, listName }: { boardId: string; listId: string; listName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    setName("");
    requestAnimationFrame(() => opener.current?.focus());
  }

  function submit() {
    const value = name.trim();
    if (!value) {
      field.current?.focus();
      return;
    }
    startTransition(async () => {
      const result = await createCard({ boardId, listId, name: value });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setName("");
      field.current?.focus();
    });
  }

  if (!open) {
    return (
      <Button ref={opener} variant="ghost" className="justify-start text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Adicionar card
      </Button>
    );
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={field}
        autoFocus
        value={name}
        maxLength={512}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape") close();
        }}
        aria-label={`Nome do novo card em ${listName}`}
        placeholder="Nome do card"
        className="min-h-16 bg-card shadow-card"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Adicionar
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar" onClick={close}>
          <X aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
