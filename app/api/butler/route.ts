import { NextResponse } from 'next/server';
import { evaluateButlerRules } from '@/lib/services/butler/engine';

export async function POST(request: Request) {
  try {
    const { workspaceId } = await request.json();

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId é obrigatório' }, { status: 400 });
    }

    // Executa o motor de regras do Butler para o workspace
    await evaluateButlerRules(workspaceId);

    return NextResponse.json({
      success: true,
      message: 'Butler processou as regras com sucesso'
    });

  } catch (error: any) {
    console.error('Butler error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
