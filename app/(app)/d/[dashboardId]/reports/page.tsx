import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Relatórios" };

export default function RelatóriosPage() {
  return (
    <ComingSoon
      screen="S28"
      title="Relatórios"
      description="A curva de vendas, gasto, lucro e ROAS por dia ou por hora."
    />
  );
}
