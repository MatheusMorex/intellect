import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Configurações do workspace" };

export default function ConfiguraçõesDoWorkspacePage() {
  return (
    <ComingSoon
      screen="S12"
      title="Configurações do workspace"
      description="Nome, logo, quem cria e exclui quadros e o domínio permitido nos convites."
    />
  );
}
