// Relógio da automação no modo real (AUTH_MODE=live). A cada minuto, consultas
// pequenas dizem quais workspaces têm algo vencido (agendadas, regras de
// métrica, regras por prazo, lembretes de prazo); só para esses o retrato do
// workspace é carregado (server/live/scope.ts, withLiveWorkspace), e as mesmas
// funções do modo simulado fazem o trabalho (server/automation/engine.ts).
//
// Um servidor só: dois relógios ao mesmo tempo não repetem execução (a chave
// única do banco recusa a segunda), mas um deles falharia naquele minuto.

import { dueWork, hasWork, runDueWork } from "@/server/automation/engine";
import { adminClient } from "@/server/db/admin";
import { mutate, readStore } from "@/server/store/db";

import { withLiveWorkspace } from "./scope";

const DAY = 86_400_000;
/** O lembrete de prazo vai até 2 dias antes (due_reminder_minutes = 2880). */
const MAX_REMINDER_MS = 2 * DAY;

type Joined = { boards: { workspace_id: string } | null };

/** Workspaces com algo a fazer agora. Só lê, e pouco: não carrega retratos à toa. */
export async function workspacesWithWork(now = new Date()): Promise<string[]> {
  const db = adminClient();
  const iso = now.toISOString();
  const results = await Promise.all([
    // Agendadas e de métrica vencidas (métrica nova, sem próxima vez marcada, também).
    db.from("automations").select("boards!inner(workspace_id)").eq("enabled", true).in("type", ["scheduled", "metric"]).lte("next_run_at", iso),
    db.from("automations").select("boards!inner(workspace_id)").eq("enabled", true).eq("type", "metric").is("next_run_at", null),
    // Regras por prazo: o motor confere cada card com prazo.
    db.from("automations").select("boards!inner(workspace_id)").eq("enabled", true).eq("type", "due_date"),
    // Lembretes: cards com lembrete cujo prazo está entre ontem e daqui a 2 dias.
    db
      .from("cards")
      .select("boards!inner(workspace_id)")
      .not("due_reminder_minutes", "is", null)
      .eq("due_complete", false)
      .is("archived_at", null)
      .gte("due_at", new Date(now.getTime() - DAY).toISOString())
      .lte("due_at", new Date(now.getTime() + MAX_REMINDER_MS).toISOString()),
  ]);
  const workspaces = new Set<string>();
  for (const { data, error } of results) {
    if (error) throw new Error(`[relógio] ${error.message}`);
    for (const row of (data ?? []) as unknown as Joined[]) if (row.boards) workspaces.add(row.boards.workspace_id);
  }
  return [...workspaces];
}

/** Uma volta do relógio. Devolve em quantos workspaces houve trabalho. */
export async function tickLive(now = new Date()): Promise<number> {
  let worked = 0;
  for (const workspaceId of await workspacesWithWork(now)) {
    try {
      // Com vendas e anúncios: as regras por métrica fazem as contas sobre eles.
      const work = async () => {
        if (!hasWork(dueWork(readStore(), now))) return false;
        mutate((store) => runDueWork(store, now));
        return true;
      };
      if (await withLiveWorkspace(workspaceId, work, { tracking: true })) worked++;
    } catch (error) {
      // Um workspace com problema não segura os outros; tenta de novo no próximo minuto.
      console.error(`[relógio da automação] workspace ${workspaceId}:`, error);
    }
  }
  return worked;
}
