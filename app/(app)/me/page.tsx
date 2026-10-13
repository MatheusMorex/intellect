import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Perfil e preferências" };

export default function PerfilEPreferênciasPage() {
  return (
    <ComingSoon
      screen="S13"
      title="Perfil e preferências"
      description="Nome, foto, fuso, tema, notificações, modo para daltônicos e reduzir animações."
    />
  );
}
