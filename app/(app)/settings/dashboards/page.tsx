import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Dashboards" };

export default function DashboardsPage() {
  return (
    <ComingSoon
      screen="S20"
      title="Dashboards"
      description="Criar e separar operações, com fuso, moeda e plataformas de anúncio."
    />
  );
}
