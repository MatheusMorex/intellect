import { MailOpen } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { EmptyState } from "@/components/ds/empty-state";
import { Button } from "@/components/ui/button";

// S02 Aceitar convite: chega com o kanban (fase 2), junto com os convites.
export default function InvitePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="grid w-full max-w-md justify-items-center gap-6">
        <Logo height={32} />
        <div className="w-full rounded-lg border bg-card">
          <EmptyState
            icon={MailOpen}
            title="Convites chegam numa próxima etapa"
            description="Por enquanto, entre com um usuário de teste. (S02 no mapa de telas)"
            action={
              <Button asChild>
                <Link href="/login">Ir para o login</Link>
              </Button>
            }
          />
        </div>
      </div>
    </main>
  );
}
