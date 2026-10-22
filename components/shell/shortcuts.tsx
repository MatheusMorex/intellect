"use client";

import { Keyboard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { isTyping } from "@/components/shell/global-search";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

const LIST: [string[], string][] = [
  [["/"], "Abrir a busca"],
  [["F"], "Filtrar os cards (no quadro)"],
  [["Q"], "Ir para Meus cards"],
  [["?"], "Mostrar estes atalhos"],
  [["N"], "Novo card na lista sob o mouse"],
  [["E"], "Edição rápida do card sob o mouse ou em foco"],
  [["L"], "Etiquetas do card sob o mouse ou em foco"],
  [["M"], "Membros do card sob o mouse ou em foco"],
  [["D"], "Prazo do card sob o mouse ou em foco"],
  [["C"], "Arquivar o card sob o mouse ou em foco"],
  [["Enter"], "Abrir o card em foco"],
  [["Espaço"], "Pegar ou soltar o card em foco para arrastar"],
  [["←", "→", "↑", "↓"], "Mover o card pego (com as setas)"],
  [["Esc"], "Fechar janela ou cancelar a edição"],
  [["Ctrl", "Enter"], "Salvar descrição ou enviar comentário"],
];

// Atalhos de uma tecla (desligáveis no perfil) e a janela de ajuda "?".
export function Shortcuts({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen(true);
      }
      if (!enabled) return;
      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        router.push("/me/cards");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Atalhos de teclado" onClick={() => setOpen(true)}>
        <Keyboard aria-hidden="true" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
          <DialogDescription>
            {enabled ? "Os atalhos de uma tecla não funcionam enquanto você digita num campo." : "Os atalhos de uma tecla estão desligados no seu perfil. Os outros continuam valendo."}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2">
          {LIST.map(([keys, what]) => (
            <div key={what} className="flex items-center justify-between gap-4 border-b pb-2 text-sm last:border-0">
              <dt>{what}</dt>
              <dd className="flex shrink-0 gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

// Preferências do perfil aplicadas na página: modo para daltônicos e reduzir animações.
export function ApplyPreferences({ colorblind, reduceMotion }: { colorblind: boolean; reduceMotion: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    if (colorblind) root.dataset.colorblind = "on";
    else delete root.dataset.colorblind;
    if (reduceMotion) root.dataset.motion = "reduced";
    else delete root.dataset.motion;
  }, [colorblind, reduceMotion]);
  return null;
}
