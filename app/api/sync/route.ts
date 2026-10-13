import { NextResponse } from 'next/server';
import { syncMetaAdsMetrics } from '@/lib/services/meta-ads-sync';
import { syncGoogleAdsMetrics } from '@/lib/services/google-ads-sync';
import { db } from '@/lib/db/user.repo';

export async function POST(request: Request) {
  try {
    const { platform, accountId, workspaceId } = await request.json();

    if (!platform || !accountId || !workspaceId) {
      return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 });
    }

    let result;
    const dateRange = {
      start: new Date(new Date().setHours(0,0,0,0)).toISOString(),
      end: new Date().toISOString(),
    };

    if (platform === 'meta') {
      // Em produção, buscaríamos o accessToken no banco de dados cifrado
      const account = {
        accountId,
        workspaceId,
        accessToken: process.env.META_ACCESS_TOKEN || 'mock_token'
      };
      result = await syncMetaAdsMetrics(account, dateRange);
    } else if (platform === 'google') {
      const account = {
        customerId: accountId,
        workspaceId,
        accessToken: process.env.GOOGLE_ACCESS_TOKEN || 'mock_token',
        developerToken: process.env.GOOGLE_DEV_TOKEN || 'mock_dev_token'
      };
      result = await syncGoogleAdsMetrics(account, dateRange);
    } else {
      return NextResponse.json({ error: 'Plataforma não suportada' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Sincronização de ${platform} concluída`,
      updatedCampaigns: result.length
    });

  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
