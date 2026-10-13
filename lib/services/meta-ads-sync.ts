import { db } from '@/lib/db/user.repo';

export interface MetaAdsAccount {
  accountId: string;
  accessToken: string;
  workspaceId: string;
}

export async function syncMetaAdsMetrics(account: MetaAdsAccount, dateRange: { start: string, end: string }) {
  console.log(`Syncing Meta Ads for account ${account.accountId}...`);

  // Mock de chamada à API do Meta (Graph API)
  // No mundo real: fetch(`https://graph.facebook.com/v18.0/act_${account.accountId}/insights...`)
  const mockInsights = [
    { campaign_name: 'Black Friday', spend: 1500.50, impressions: 50000, clicks: 1200, conversions: 45 },
    { campaign_name: 'Institucional', spend: 200.00, impressions: 10000, clicks: 300, conversions: 2 },
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
        platform: 'meta',
      },
    });
  }));

  return updates;
}
