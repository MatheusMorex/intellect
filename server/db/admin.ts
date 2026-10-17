import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente do Supabase com a chave secreta: passa por cima do RLS. Só roda no
// servidor (a variável não começa com NEXT_PUBLIC_, então nunca vai para o
// navegador). Toda função que usa este cliente confere antes quem pode o quê
// (server/access.ts); o RLS das tabelas é a segunda trava, para o navegador.

let cached: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY no .env.local (modo AUTH_MODE=live).");
  }
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

/** Erro do banco com uma mensagem que dá para mostrar a quem usa o app. */
export function dbError(context: string, error: { message: string } | null): never {
  console.error(`[banco] ${context}:`, error?.message);
  throw new Error(`Não deu para ${context}. Tente de novo em instantes.`);
}
