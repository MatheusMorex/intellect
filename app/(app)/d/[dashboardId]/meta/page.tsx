import type { Metadata } from "next";

import { CampaignsView } from "@/components/tracking/campaigns-view";

export const metadata: Metadata = { title: "Meta" };

export default async function MetaPage({
  params,
  searchParams,
}: {
  params: Promise<{ dashboardId: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { dashboardId } = await params;
  const { periodo } = await searchParams;
  return <CampaignsView dashboardId={dashboardId} provider="meta" periodo={periodo} />;
}
