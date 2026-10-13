import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Configuração inicial" };

export default function ConfiguraçãoInicialPage() {
  return (
    <ComingSoon
      screen="S29"
      title="Configuração inicial"
      description="O passo a passo para deixar o dashboard pronto: contas, loja, parâmetros e teste."
    />
  );
}
