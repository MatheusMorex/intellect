import type { Metadata } from "next";

import { CampaignsView } from "@/components/tracking/campaigns-view";
import type { SearchParams } from "@/server/data/tracking";

export const metadata: Metadata = { title: "Google" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ dashboardId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { dashboardId } = await params;
  return <CampaignsView dashboardId={dashboardId} provider="google" sp={await searchParams} />;
}
