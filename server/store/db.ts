// Armazenamento simulado: um arquivo JSON em .data/store.json, criado pelo seed
// na primeira leitura. Serve para construir e testar as telas sem banco.
//
// No modo real (AUTH_MODE=live), readStore() e mutate() usam o retrato do
// Supabase do pedido em andamento (server/live/scope.ts): as mesmas regras do
// app rodam sobre ele, e o que mudou é gravado no fim do pedido.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { currentLiveStore } from "../live/scope";
import { isLive } from "../mode";
import { createSeed, emptyStore, STORE_VERSION, upgradeStore } from "./seed";
import type { Store } from "./types";

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "store.json");

let cache: { mtimeMs: number; store: Store } | null = null;
/** Sobe a cada gravação e quando o arquivo muda por fora (outro processo, como o simulate:order). */
let generation = 0;

function writeFile(store: Store) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store));
  // No Windows o antivírus às vezes segura o arquivo por um instante.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, FILE);
      break;
    } catch (error) {
      if (attempt >= 5) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  cache = { mtimeMs: fs.statSync(FILE).mtimeMs, store };
  generation++;
}

/** No modo real, fora de um retrato (partes ainda não ligadas ao banco), tudo aparece vazio (zerado). */
let liveEmpty: Store | null = null;

export class NotInLiveModeError extends Error {
  constructor() {
    super("Esta função ainda está sendo ligada ao banco de dados.");
  }
}

export function readStore(): Store {
  if (isLive()) return currentLiveStore() ?? (liveEmpty ??= emptyStore());
  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(FILE);
  } catch {
    stat = null;
  }
  if (stat && cache && cache.mtimeMs === stat.mtimeMs) return cache.store;
  if (stat) {
    const store = JSON.parse(fs.readFileSync(FILE, "utf8")) as Store;
    if (store.version === STORE_VERSION) {
      cache = { mtimeMs: stat.mtimeMs, store };
      generation++;
      return store;
    }
    const upgraded = upgradeStore(store);
    if (upgraded) {
      writeFile(upgraded);
      return upgraded;
    }
  }
  const seeded = createSeed(new Date());
  writeFile(seeded);
  return seeded;
}

/**
 * Versão dos dados: muda sempre que algo é gravado. O cache dos Painéis
 * (server/charts/cache.ts) joga fora o que calculou quando ela muda. No banco,
 * vira um contador por dashboard que sobe quando chegam pedidos ou gastos.
 */
export function storeVersion(): number {
  readStore(); // confere se o arquivo mudou por fora
  return generation;
}

const afterHooks: ((store: Store) => void)[] = [];

/** Roda antes de gravar cada mutate (o motor de automação avalia as atividades novas aqui). */
export function afterMutate(hook: (store: Store) => void) {
  if (!afterHooks.includes(hook)) afterHooks.push(hook);
}

/**
 * Muda o armazenamento e grava. Tudo dentro de fn acontece de uma vez (como uma
 * transação). No modo real muda o retrato; a gravação no Supabase acontece no
 * fim do pedido (server/live/scope.ts).
 */
export function mutate<T>(fn: (store: Store) => T): T {
  if (isLive()) {
    const live = currentLiveStore();
    // Fora de um retrato, gravar numa loja vazia perderia o dado em silêncio: melhor avisar.
    if (!live) throw new NotInLiveModeError();
    const result = fn(live);
    for (const hook of afterHooks) hook(live);
    return result;
  }
  const store = readStore();
  const result = fn(store);
  for (const hook of afterHooks) hook(store);
  writeFile(store);
  return result;
}

export function newId() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}
