// O retrato (server/live/snapshot.ts) de quem está usando o app, durante uma
// leitura ou uma ação no modo real. Enquanto a função roda, readStore() e
// mutate() (server/store/db.ts) usam este retrato no lugar do arquivo do modo
// simulado; no fim, o que mudou é gravado no Supabase.
//
// Vendas e anúncios só entram quando a tela ou a ação pede ({ tracking: true }).
// Se o retrato já está aberto sem eles e alguém pede, ele é completado na hora.
//
// No modo simulado as funções só chamam a função de dentro.

import { AsyncLocalStorage } from "node:async_hooks";

import { cache } from "react";

import { isLive } from "@/server/mode";
import type { Store } from "@/server/store/types";

import {
  diffSnapshot,
  flushChanges,
  loadSnapshot,
  loadWorkspaceData,
  loadWorkspaceSnapshot,
  NotLiveYet,
  removeDeletedAttachmentFiles,
  removeUnusedBoardImages,
  unmappedChanges,
  WriteConflict,
  type LoadOptions,
} from "./snapshot";
import { TABLES } from "./tables";

type Scope = { userId: string; store: Store; base: Store; tracking: boolean; completing?: Promise<void> };

const als = new AsyncLocalStorage<Scope>();

/** O retrato do pedido em andamento (null fora de withLiveRead/withLiveWrite). */
export function currentLiveStore(): Store | null {
  return als.getStore()?.store ?? null;
}

const open = (userId: string, store: Store, tracking: boolean): Scope => ({ userId, store, base: structuredClone(store), tracking });

/** Listas de vendas e anúncios (as que só entram quando pedidas). */
const TRACKING_KEYS = TABLES.filter((t) => t.tracking).map((t) => t.key);

/** Completa um retrato aberto sem vendas e anúncios (uma vez só, mesmo com leituras em paralelo). */
async function withTracking(scope: Scope) {
  if (scope.tracking) return;
  scope.completing ??= (async () => {
    const data = await loadWorkspaceData(
      scope.store.workspaces.map((w) => w.id),
      { tracking: true },
    );
    for (const key of TRACKING_KEYS) {
      (scope.store as Record<string, unknown>)[key] = data[key];
      (scope.base as Record<string, unknown>)[key] = structuredClone(data[key]);
    }
    scope.tracking = true;
  })();
  await scope.completing;
}

/**
 * Uma tela tem várias leituras (layout, página, metadados): todas usam o mesmo
 * retrato. O cache do React vale só para a renderização de uma tela; fora dela
 * (ações, rotas, testes), cada chamada carrega de novo.
 */
const screenScope = cache(async (userId: string) => open(userId, await loadSnapshot(userId), false));

async function save(scope: Scope) {
  const outside = unmappedChanges(scope.base, scope.store);
  if (outside.length) throw new NotLiveYet(outside);
  const changes = diffSnapshot(scope.base, scope.store);
  if (changes.length === 0) return;
  await flushChanges(changes);
  await removeUnusedBoardImages(scope.base, scope.store);
  await removeDeletedAttachmentFiles(scope.base, scope.store);
  scope.base = structuredClone(scope.store);
}

/**
 * Roda leituras sobre dados já em memória, sem banco e sem gravar nada. Os
 * testes do modo real usam para comparar os números lidos do banco com os
 * mesmos cálculos sobre os dados originais.
 */
export function readOnStore<T>(store: Store, fn: () => T): T {
  return als.run({ userId: "leitura", store, base: store, tracking: true }, fn);
}

/** Leitura no modo real. Se a leitura grava algo (cotação do câmbio, por exemplo), grava no fim. */
export async function withLiveRead<T>(userId: string, fn: () => T | Promise<T>, options: LoadOptions = {}): Promise<T> {
  if (!isLive()) return fn();
  const current = als.getStore();
  if (current) {
    if (options.tracking) await withTracking(current);
    return fn();
  }
  const scope = await screenScope(userId);
  if (options.tracking) await withTracking(scope);
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
export async function withLiveWrite<T>(userId: string, fn: () => Promise<T>, options: LoadOptions = {}, attempts = 8): Promise<T> {
  return write(userId, () => loadSnapshot(userId, options), fn, options, attempts);
}

/** O relógio da automação e o webhook: o mesmo que uma ação, sobre o workspace inteiro (sem pessoa logada). */
export async function withLiveWorkspace<T>(workspaceId: string, fn: () => Promise<T>, options: LoadOptions = {}, attempts = 8): Promise<T> {
  return write("sistema", () => loadWorkspaceSnapshot(workspaceId, options), fn, options, attempts);
}

async function write<T>(userId: string, loader: () => Promise<Store>, fn: () => Promise<T>, options: LoadOptions, attempts: number): Promise<T> {
  if (!isLive()) return fn();
  const current = als.getStore();
  if (current) {
    if (options.tracking) await withTracking(current);
    return fn();
  }
  for (let attempt = 1; ; attempt++) {
    const scope = open(userId, await loader(), options.tracking ?? false);
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
