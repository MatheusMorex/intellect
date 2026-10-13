import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Integrações" };

export default function IntegraçõesPage() {
  return (
    <ComingSoon
      screen="S21"
      title="Integrações"
      description="Conectar Meta, Google e a loja Shopify, ver o status e testar o rastreio."
    />
  );
}
