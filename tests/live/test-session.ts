// Sessão dos testes do modo real: tudo como em server/auth/session.ts, menos
// quem está logado, que o teste escolhe com actAs().

import type { SessionUser } from "../../server/auth/session.ts";

export * from "../../server/auth/session.ts";

let current: SessionUser | null = null;

export function actAs(user: SessionUser | null) {
  current = user;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return current;
}

export async function requireUser(): Promise<SessionUser> {
  if (!current) throw new Error("teste sem pessoa logada (use actAs)");
  return current;
}
