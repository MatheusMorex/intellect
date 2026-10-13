import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AutomationBuilder } from "@/components/automation/builder";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { TYPE_INFO } from "@/lib/automation/describe";
import { requireUser } from "@/server/auth/session";
import { getAutomationEditor } from "@/server/data/automation";

export const metadata: Metadata = { title: "Editar automação" };

// S15 Construtor de automação (editar).
export default async function EditAutomationPage({ params }: { params: Promise<{ boardId: string; automationId: string }> }) {
  const { boardId, automationId } = await params;
  const user = await requireUser();
  const editor = await getAutomationEditor({ user }, boardId, automationId);
  const automation = editor.automation!;

  return (
    <PageBody>
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/b/${boardId}/automation?aba=${TYPE_INFO[automation.type].tab}`}>
            <ArrowLeft aria-hidden="true" />
            Automação de {editor.board.name}
          </Link>
        </Button>
      </div>
      <PageHeader title={`Editar: ${automation.name}`} description={`${TYPE_INFO[automation.type].title}. ${TYPE_INFO[automation.type].hint}`} />
      <AutomationBuilder type={automation.type} editor={editor} />
    </PageBody>
  );
}
