"use client";

import { Check, Globe, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { LABEL_HUES, LABEL_HUE_NAME } from "@/components/ds/label-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { createBoard } from "@/server/actions/kanban";

// S04 Criar quadro: nome, fundo e quem vê. Ao criar, abre o quadro novo.
export function CreateBoardDialog({ workspaceId, workspaceName, trigger }: { workspaceId: string; workspaceName: string; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [background, setBackground] = useState<string>("purple");
  const [visibility, setVisibility] = useState<"private" | "workspace">("workspace");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setName("");
    setBackground("purple");
    setVisibility("workspace");
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Criar quadro</DialogTitle>
          <DialogDescription>Um quadro junta listas e cards de um projeto ou rotina.</DialogDescription>
        </DialogHeader>
        <div aria-hidden="true" className="flex h-24 items-start rounded-lg p-3 text-sm font-semibold text-white" style={{ background: `var(--ds-label-${background}-bold)` }}>
          <span className="truncate">{name.trim() || "Nome do quadro"}</span>
        </div>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await createBoard({ workspaceId, name, background, visibility });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setOpen(false);
              reset();
              router.push(`/b/${result.data.id}`);
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="board-name">Nome do quadro</Label>
            <Input
              id="board-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Criativos de dezembro"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "board-error" : undefined}
            />
            {error && (
              <p id="board-error" role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Fundo</legend>
            <div role="radiogroup" aria-label="Cor do fundo" className="grid grid-cols-5 gap-2">
              {LABEL_HUES.map((hue) => (
                <button
                  key={hue}
                  type="button"
                  role="radio"
                  aria-checked={background === hue}
                  aria-label={LABEL_HUE_NAME[hue]}
                  onClick={() => setBackground(hue)}
                  className={cn(
                    "grid h-10 place-items-center rounded-md text-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                    background === hue && "ring-2 ring-ring ring-offset-2 ring-offset-popover",
                  )}
                  style={{ background: `var(--ds-label-${hue}-bold)` }}
                >
                  {background === hue && <Check aria-hidden="true" className="size-4" />}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Quem vê</legend>
            <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)} className="gap-1">
              <Label className="items-start gap-3 rounded-md p-2 font-normal hover:bg-accent">
                <RadioGroupItem value="workspace" className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Globe aria-hidden="true" className="size-3.5" /> Workspace
                  </span>
                  <span className="text-xs text-muted-foreground">Todo mundo do {workspaceName} vê e pode participar.</span>
                </span>
              </Label>
              <Label className="items-start gap-3 rounded-md p-2 font-normal hover:bg-accent">
                <RadioGroupItem value="private" className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Lock aria-hidden="true" className="size-3.5" /> Privado
                  </span>
                  <span className="text-xs text-muted-foreground">Só quem você convidar.</span>
                </span>
              </Label>
            </RadioGroup>
          </fieldset>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending} disabled={!name.trim()}>
              Criar quadro
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
