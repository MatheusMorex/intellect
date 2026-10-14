"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { HelpTip } from "@/components/ds/help-tip";
import { ImageUploadButton } from "@/components/ds/image-upload";
import { UserAvatar } from "@/components/ds/user-avatar";
import { Button } from "@/components/ui/button";
import { removeAvatar } from "@/server/actions/settings";

// Foto de perfil: importada do computador, cortada em quadrado no meio da imagem.
export function AvatarSettings({ person }: { person: { name: string; avatarColor: string; avatarUrl: string | null } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section aria-labelledby="foto-perfil" className="grid gap-4 rounded-lg border bg-card p-4 sm:p-6">
      <div className="flex items-center gap-1">
        <h2 id="foto-perfil" className="text-base font-semibold">
          Foto de perfil
        </h2>
        <HelpTip topic="perfil-foto" className="size-5" />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <UserAvatar person={person} className="size-20" textClassName="text-2xl" />
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <ImageUploadButton kind="avatar" label={person.avatarUrl ? "Trocar foto" : "Importar foto do computador"} successMessage="Foto de perfil salva" />
            {person.avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeAvatar();
                    if (!result.ok) toast.error(result.error);
                    else toast.success("Foto removida");
                    router.refresh();
                  })
                }
              >
                <Trash2 aria-hidden="true" />
                Remover foto
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">JPG, PNG ou WebP. O centro da imagem vira um quadrado; sem foto, aparecem as suas iniciais.</p>
        </div>
      </div>
    </section>
  );
}
