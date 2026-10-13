import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Taxas" };

export default function TaxasPage() {
  return (
    <ComingSoon
      screen="S23"
      title="Taxas"
      description="Impostos, taxas adicionais e custo de cada produto, para o lucro sair certo."
    />
  );
}
