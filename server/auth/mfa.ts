// Verificação em duas etapas (2FA) no modo real: o MFA do Supabase, com
// aplicativo autenticador (código de 6 dígitos que muda a cada 30 segundos).
//
// Quem ligou o 2FA só entra de verdade com a sessão no nível aal2 (depois do
// código). O nível vem do token assinado; se a pessoa tem fator ligado vem do
// Supabase com a chave secreta (nunca do cookie, que o navegador pode mexer).
// O banco também confere: migração 20261022120000_mfa_aal2.sql.

import { adminClient } from "@/server/db/admin";

// Guardado por pouco tempo: cada página não precisa perguntar ao Supabase de novo.
const CACHE_MS = 30_000;
const known = new Map<string, { has: boolean; at: number }>();

/** A pessoa tem um fator confirmado (2FA ligado)? */
export async function hasVerifiedFactor(userId: string): Promise<boolean> {
  const hit = known.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.has;
  const { data, error } = await adminClient().auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error(`Não consegui conferir a verificação em duas etapas: ${error.message}`);
  const has = data.factors.some((f) => f.status === "verified");
  known.set(userId, { has, at: Date.now() });
  return has;
}

/** Depois de ligar ou desligar, a próxima conferência vai ao Supabase. */
export function forgetFactor(userId: string) {
  known.delete(userId);
}
