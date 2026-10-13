"use client";

import { OctagonAlert } from "lucide-react";

import { EmptyState } from "@/components/ds/empty-state";
import { Button } from "@/components/ui/button";

// Erro inesperado numa tela logada: explica e oferece tentar de novo.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-content p-4 sm:p-6">
      <div className="rounded-lg border bg-card" role="alert">
        <EmptyState
          icon={OctagonAlert}
          title="Não deu para carregar esta tela"
          description="Algo deu errado do nosso lado. Tente de novo; se continuar, recarregue a página."
          action={<Button onClick={reset}>Tentar de novo</Button>}
        />
      </div>
    </div>
  );
}
