import { SearchX } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { EmptyState } from "@/components/ds/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="grid w-full max-w-md justify-items-center gap-6">
        <Logo height={32} />
        <div className="w-full rounded-lg border bg-card">
          <EmptyState
            icon={SearchX}
            title="Página não encontrada"
            description="O endereço não existe ou você não tem acesso a ele."
            action={
              <Button asChild>
                <Link href="/">Voltar para o início</Link>
              </Button>
            }
          />
        </div>
      </div>
    </main>
  );
}
