import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/shell/page-header";
import { InviteToWorkspace, MembersTable } from "@/components/workspace/members-client";
import { WorkspaceTabs } from "@/components/workspace/workspace-tabs";
import { requireUser } from "@/server/auth/session";
import { getWorkspaceMembers } from "@/server/data/boards";

export const metadata: Metadata = { title: "Membros do workspace" };

// S12 Workspace: membros, papéis e convites.
export default async function WorkspaceMembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const data = await getWorkspaceMembers({ user }, slug);

  return (
    <PageBody>
      <PageHeader title={data.workspace.name} description="Quem faz parte do workspace e com qual papel." />
      <WorkspaceTabs slug={slug} active="members" />
      {data.isAdmin && <InviteToWorkspace workspaceId={data.workspace.id} domain={data.workspace.allowedEmailDomain} />}
      <MembersTable data={data} />
    </PageBody>
  );
}
