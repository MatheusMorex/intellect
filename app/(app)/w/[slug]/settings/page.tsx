import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/shell/page-header";
import { WorkspaceSettingsForm } from "@/components/workspace/settings-form";
import { WorkspaceTabs } from "@/components/workspace/workspace-tabs";
import { requireUser } from "@/server/auth/session";
import { getWorkspaceMembers } from "@/server/data/boards";

export const metadata: Metadata = { title: "Configurações do workspace" };

// S12 Configurações do workspace.
export default async function WorkspaceSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const data = await getWorkspaceMembers({ user }, slug);

  return (
    <PageBody>
      <PageHeader title={data.workspace.name} description="Nome, descrição e regras de convite." />
      <WorkspaceTabs slug={slug} active="settings" />
      <WorkspaceSettingsForm workspace={data.workspace} canEdit={data.isAdmin} />
    </PageBody>
  );
}
