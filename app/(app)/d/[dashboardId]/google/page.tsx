import type { Metadata } from "next";

import { CampaignsView } from "@/components/tracking/campaigns-view";

export const metadata: Metadata = { title: "Google" };

export default async function GooglePage({
  params,
  searchParams,
}: {
  params: Promise<{ dashboardId: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { dashboardId } = await params;
  const { periodo } = await searchParams;
  return <CampaignsView dashboardId={dashboardId} provider="google" periodo={periodo} />;
}
