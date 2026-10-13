import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AutomationBuilder } from "@/components/automation/builder";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { TYPE_INFO } from "@/lib/automation/describe";
import { AUTOMATION_TYPES, type AutomationType } from "@/lib/automation/schema";
import { requireUser } from "@/server/auth/session";
import { getAutomationEditor } from "@/server/data/automation";

export const metadata: Metadata = { title: "Nova automação" };

// S15 Construtor de automação (criar).
export default async function NewAutomationPage({ params, searchParams }: { params: Promise<{ boardId: string }>; searchParams: Promise<{ tipo?: string }> }) {
  const { boardId } = await params;
  const { tipo } = await searchParams;
  const type: AutomationType = (AUTOMATION_TYPES as readonly string[]).includes(tipo ?? "") ? (tipo as AutomationType) : "rule";
  const user = await requireUser();
  const editor = await getAutomationEditor({ user }, boardId, null);

  return (
    <PageBody>
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/b/${boardId}/automation?aba=${TYPE_INFO[type].tab}`}>
            <ArrowLeft aria-hidden="true" />
            Automação de {editor.board.name}
          </Link>
        </Button>
      </div>
      <PageHeader title={TYPE_INFO[type].create} description={TYPE_INFO[type].hint} />
      {type === "metric" && editor.options.dashboards.length === 0 ? (
        <p className="text-muted-foreground">Este workspace ainda não tem dashboard de vendas para olhar as métricas.</p>
      ) : (
        <AutomationBuilder type={type} editor={editor} />
      )}
    </PageBody>
  );
}
