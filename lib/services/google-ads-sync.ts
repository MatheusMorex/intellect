import { db } from '@/lib/db/user.repo';

export interface GoogleAdsAccount {
  customerId: string;
  developerToken: string;
  accessToken: string;
  workspaceId: string;
}

export async function syncGoogleAdsMetrics(account: GoogleAdsAccount, dateRange: { start: string, end: string }) {
  console.log(`Syncing Google Ads for customer ${account.customerId}...`);

  // Mock de chamada à API do Google Ads (Google Ads API)
  // No mundo real: gRPC call ou REST API
  const mockInsights = [
    { campaign_name: 'Search Brand', spend: 800.00, impressions: 20000, clicks: 800, conversions: 30 },
    { campaign_name: 'Performance Max', spend: 1200.00, impressions: 100000, clicks: 4000, conversions: 60 },
  ];

  const updates = await Promise.all(mockInsights.map(async (insight) => {
    return db.adCampaign.upsert({
      where: {
        campaignExternalId: insight.campaign_name, // Simplificação para o MVP
      },
      update: {
        spendCents: Math.round(insight.spend * 100),
        impressions: insight.impressions,
        clicks: insight.clicks,
        conversions: insight.conversions,
        updatedAt: new Date(),
      },
      create: {
        workspaceId: account.workspaceId,
        name: insight.campaign_name,
        campaignExternalId: insight.campaign_name,
        spendCents: Math.round(insight.spend * 100),
        impressions: insight.impressions,
        clicks: insight.clicks,
        conversions: insight.conversions,
        platform: 'google',
      },
    });
  }));

  return updates;
}
