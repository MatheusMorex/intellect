import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Despesas" };

export default function DespesasPage() {
  return (
    <ComingSoon
      screen="S26"
      title="Despesas"
      description="Gastos que não são anúncio: ferramentas, equipe, contabilidade, únicos ou mensais."
    />
  );
}
