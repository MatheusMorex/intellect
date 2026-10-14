// Armazenamento simulado: um arquivo JSON em .data/store.json, criado pelo seed
// na primeira leitura. Serve para construir e testar as telas sem banco; o
// /replica-backend troca isto por Postgres + Prisma com as mesmas funções em
// server/data.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createSeed, STORE_VERSION, upgradeStore } from "./seed";
import type { Store } from "./types";

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "store.json");

let cache: { mtimeMs: number; store: Store } | null = null;

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
}

export function readStore(): Store {
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

const afterHooks: ((store: Store) => void)[] = [];

/** Roda antes de gravar cada mutate (o motor de automação avalia as atividades novas aqui). */
export function afterMutate(hook: (store: Store) => void) {
  if (!afterHooks.includes(hook)) afterHooks.push(hook);
}

/** Muda o armazenamento e grava. Tudo dentro de fn acontece de uma vez (como uma transação). */
export function mutate<T>(fn: (store: Store) => T): T {
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
