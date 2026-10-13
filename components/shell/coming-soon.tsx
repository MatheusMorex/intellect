import { Construction } from "lucide-react";

import { PageBody, PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ds/empty-state";

// Tela que existe no mapa (recon.md) mas ainda não foi construída.
export function ComingSoon({ screen, title, description }: { screen: string; title: string; description: string }) {
  return (
    <PageBody>
      <PageHeader title={title} />
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={Construction}
          title="Esta tela chega numa próxima etapa"
          description={`${description} (${screen} no mapa de telas)`}
        />
      </div>
    </PageBody>
  );
}
