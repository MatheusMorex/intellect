// Invólucro das actions no modo real: a action roda sobre o retrato de quem
// está logado (server/live/scope.ts) e o que mudou vai para o Supabase antes da
// resposta. No modo simulado só chama a action.

import { getCurrentUser } from "@/server/auth/session";
import { isLive } from "@/server/mode";

import { withLiveWrite } from "./scope";
import { NotLiveYet, WriteConflict, WriteFailed } from "./snapshot";

/** Para actions que devolvem { ok, error }: falha ao gravar vira a mensagem de erro, sem derrubar a tela. */
export async function liveAction<T>(fn: () => Promise<T>): Promise<T> {
  if (!isLive()) return fn();
  const user = await getCurrentUser();
  // Sem login, a própria action manda para o /login.
  if (!user) return fn();
  try {
    return await withLiveWrite(user.id, fn);
  } catch (error) {
    if (error instanceof WriteConflict || error instanceof WriteFailed || error instanceof NotLiveYet) return { ok: false, error: error.message } as T;
    throw error;
  }
}
