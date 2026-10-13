import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Automação" };

export default function AutomaçãoPage() {
  return (
    <ComingSoon
      screen="S14"
      title="Automação"
      description="Regras, botões, agendadas e por data de entrega, com o histórico de execuções."
    />
  );
}
