// O retrato (server/live/snapshot.ts) de quem está usando o app, durante uma
// leitura ou uma ação no modo real. Enquanto a função roda, readStore() e
// mutate() (server/store/db.ts) usam este retrato no lugar do arquivo do modo
// simulado; no fim, o que mudou é gravado no Supabase.
//
// No modo simulado as duas funções só chamam a função de dentro.

import { AsyncLocalStorage } from "node:async_hooks";

import { cache } from "react";

import { isLive } from "@/server/mode";
import type { Store } from "@/server/store/types";

import { diffSnapshot, flushChanges, loadSnapshot, NotLiveYet, removeUnusedBoardImages, unmappedChanges, WriteConflict } from "./snapshot";

type Scope = { userId: string; store: Store; base: Store };

const als = new AsyncLocalStorage<Scope>();

/** O retrato do pedido em andamento (null fora de withLiveRead/withLiveWrite). */
export function currentLiveStore(): Store | null {
  return als.getStore()?.store ?? null;
}

const open = (userId: string, store: Store): Scope => ({ userId, store, base: structuredClone(store) });

/**
 * Uma tela tem várias leituras (layout, página, metadados): todas usam o mesmo
 * retrato. O cache do React vale só para a renderização de uma tela; fora dela
 * (ações, rotas, testes), cada chamada carrega de novo.
 */
const screenScope = cache(async (userId: string) => open(userId, await loadSnapshot(userId)));

async function save(scope: Scope) {
  const outside = unmappedChanges(scope.base, scope.store);
  if (outside.length) throw new NotLiveYet(outside);
  const changes = diffSnapshot(scope.base, scope.store);
  if (changes.length === 0) return;
  await flushChanges(changes);
  await removeUnusedBoardImages(scope.base, scope.store);
  scope.base = structuredClone(scope.store);
}

/** Leitura no modo real. Se a leitura grava algo (a visita ao quadro), grava no fim. */
export async function withLiveRead<T>(userId: string, fn: () => T | Promise<T>): Promise<T> {
  if (!isLive() || als.getStore()) return fn();
  const scope = await screenScope(userId);
  const result = await als.run(scope, fn);
  await save(scope);
  return result;
}

/**
 * Ação no modo real: retrato novo, as regras do app, gravação. Se outra pessoa
 * mudou um contador ao mesmo tempo (número do card, versão da descrição), a ação
 * roda de novo sobre o retrato atualizado, depois de uma espera curta e
 * aleatória (para as tentativas não baterem de novo).
 */
export async function withLiveWrite<T>(userId: string, fn: () => Promise<T>, attempts = 8): Promise<T> {
  if (!isLive() || als.getStore()) return fn();
  for (let attempt = 1; ; attempt++) {
    const scope = open(userId, await loadSnapshot(userId));
    try {
      const result = await als.run(scope, fn);
      await save(scope);
      return result;
    } catch (error) {
      if (!(error instanceof WriteConflict) || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 200 * attempt));
    }
  }
}
