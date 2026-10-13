import { db } from '@/lib/db/user.repo';

export type ButlerTrigger = {
  metric: 'roas' | 'cpa' | 'revenue' | 'spend';
  operator: 'lt' | 'gt' | 'eq';
  value: number;
};

export type ButlerAction = {
  type: 'move_card' | 'create_card' | 'notify';
  params: {
    targetListId?: string;
    cardTemplateId?: string;
    message?: string;
  };
};

export interface ButlerRule {
  id: string;
  workspaceId: string;
  name: string;
  trigger: ButlerTrigger;
  action: ButlerAction;
  isActive: boolean;
}

export async function evaluateButlerRules(workspaceId: string) {
  console.log(`Evaluating Butler rules for workspace ${workspaceId}...`);

  // 1. Buscar todas as regras ativas do workspace
  const rules = await db.butlerRule.findMany({
    where: { workspaceId, isActive: true }
  });

  if (rules.length === 0) return;

  // 2. Buscar métricas agregadas do workspace (últimas 24h)
  // Em produção, isso viria de uma query complexa de agregação no TrackingRepo
  const metrics = await getWorkspaceCurrentMetrics(workspaceId);

  for (const rule of rules) {
    const currentVal = metrics[rule.trigger.metric];
    let triggered = false;

    switch (rule.trigger.operator) {
      case 'lt': triggered = currentVal < rule.trigger.value; break;
      case 'gt': triggered = currentVal > rule.trigger.value; break;
      case 'eq': triggered = currentVal === rule.trigger.value; break;
    }

    if (triggered) {
      await executeButlerAction(rule.action, workspaceId);
    }
  }
}

async function getWorkspaceCurrentMetrics(workspaceId: string) {
  // Mock de métricas agregadas para o motor de regras
  // No mundo real: SELECT SUM(totalCents) FROM Order ... / SUM(spendCents) FROM AdCampaign ...
  return {
    roas: 1.2, // Ex: ROAS caiu para 1.2
    cpa: 45.0,
    revenue: 5000,
    spend: 4000,
  };
}

async function executeButlerAction(action: ButlerAction, workspaceId: string) {
  console.log(`Executing Butler Action: ${action.type}`);

  if (action.type === 'create_card') {
    await db.card.create({
      data: {
        workspaceId,
        name: `🚨 Butler Alert: Métrica fora do limite`,
        description: action.params.message || 'Atenção: O Butler detectou uma anomalia nas métricas.',
        status: 'todo',
        priority: 'high',
        // Atribui a uma lista padrão do workspace
        list: {
          connect: { id: action.params.targetListId || 'default-list-id' }
        }
      }
    });
  }

  if (action.type === 'move_card') {
    // Lógica para mover cards específicos relacionados à métrica
    console.log('Moving related cards to list:', action.params.targetListId);
  }
}
