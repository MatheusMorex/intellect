import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Membros do workspace" };

export default function MembrosDoWorkspacePage() {
  return (
    <ComingSoon
      screen="S12"
      title="Membros do workspace"
      description="Convide pessoas, mude papéis e veja a última atividade de cada um."
    />
  );
}
