import { NextResponse } from 'next/server';
import { exportOrdersToCSV } from '@/lib/services/export/orders-export';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dashboardId = searchParams.get('dashboardId');

    if (!dashboardId) {
      return NextResponse.json({ error: 'dashboardId é obrigatório' }, { status: 400 });
    }

    const csvContent = await exportOrdersToCSV(dashboardId);

    if (!csvContent) {
      return NextResponse.json({ error: 'Nenhum dado encontrado para exportação' }, { status: 404 });
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=vendas-intellect-${dashboardId}.csv`,
      },
    });

  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
