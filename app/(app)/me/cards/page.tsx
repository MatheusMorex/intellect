import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Meus cards" };

export default function MeusCardsPage() {
  return (
    <ComingSoon
      screen="S30"
      title="Meus cards"
      description="Os cards atribuídos a você em todos os quadros, por quadro ou por prazo."
    />
  );
}
