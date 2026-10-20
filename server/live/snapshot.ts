// Retrato do kanban no modo real (AUTH_MODE=live). Carrega do Supabase, no
// formato do armazenamento do app, tudo o que uma pessoa enxerga: os workspaces
// dela, os quadros que pode ver (com listas, cards, etiquetas, checklists e
// comentários), as pessoas desses workspaces e as notificações dela. As regras
// do app rodam sobre o retrato; no fim, diffSnapshot diz o que mudou e
// flushChanges grava só isso.
//
// Sem transação entre tabelas (a API do Supabase faz uma operação por pedido).
// Por isso a ordem importa: contadores primeiro (com conferência), depois as
// linhas novas, as mudanças e, por último, as remoções.

import { adminClient } from "@/server/db/admin";
import { UPLOADS_BUCKET } from "@/server/live/settings";
import { emptyStore } from "@/server/store/seed";
import type { Store } from "@/server/store/types";

import { rowFromDb, rowToDb, TABLES, tableOf, type TableSpec } from "./tables";

type Row = Record<string, unknown>;

/** Quantos ids vão num filtro "in" (o endereço do pedido tem limite de tamanho). */
const IN_CHUNK = 120;
/** O Supabase devolve até 1.000 linhas por pedido: o resto vem em páginas. */
const PAGE = 1000;
/** Atividades mais recentes que entram no retrato (histórico do card, do quadro e do perfil). */
export const MAX_ACTIVITIES = 3000;

export class WriteConflict extends Error {
  constructor(what: string) {
    super(`Outra pessoa mudou ${what} ao mesmo tempo.`);
  }
}

/** A regra mexeu numa parte que ainda não vai para o banco (dashboards, automações, arquivos): nada é gravado. */
export class NotLiveYet extends Error {
  constructor(parts: string[]) {
    super("Esta parte ainda está sendo ligada ao banco de dados.");
    console.error("[banco] mudança fora do retrato do kanban:", parts.join(", "));
  }
}

/** Listas do armazenamento que não vão para o banco nesta etapa (fora as que são só do modo simulado). */
const IGNORED: (keyof Store)[] = ["version", "seededAt", "boardStamps", "outbox"];

/** Partes fora do mapa que mudaram (não podem sumir em silêncio). */
export function unmappedChanges(base: Store, current: Store): string[] {
  const mapped = new Set<keyof Store>(TABLES.map((t) => t.key));
  return (Object.keys(current) as (keyof Store)[]).filter((key) => !mapped.has(key) && !IGNORED.includes(key) && JSON.stringify(base[key]) !== JSON.stringify(current[key]));
}

export class WriteFailed extends Error {
  constructor(what: string, cause: string) {
    super(`Não deu para salvar (${what}). Tente de novo em instantes.`);
    console.error(`[banco] gravar ${what}:`, cause);
  }
}

// ---- leitura -------------------------------------------------------------------------------------

// O construtor de consultas do supabase-js muda de tipo a cada filtro; aqui ele só recebe .eq/.in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

/** Todas as linhas de uma consulta, página por página (ordem fixa pelo id). */
async function selectAll(table: string, columns: readonly string[], filter: (q: Query) => Query): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(adminClient().from(table).select(columns.join(", ")))
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`[banco] ler ${table}: ${error.message}`);
    rows.push(...(data as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Linhas cuja coluna está numa lista de ids (em lotes). */
async function selectIn(table: string, columns: readonly string[], column: string, ids: string[], extra: (q: Query) => Query = (q) => q): Promise<Row[]> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) chunks.push(unique.slice(i, i + IN_CHUNK));
  const parts = await Promise.all(chunks.map((chunk) => selectAll(table, columns, (q) => extra(q.in(column, chunk)))));
  return parts.flat();
}

/** Linhas do banco no formato da lista `key` do armazenamento (o mapa em tables.ts garante os campos). */
const load = <K extends keyof Store>(key: K, rows: Row[]) => {
  const spec = tableOf(key);
  return rows.map((r) => rowFromDb(spec, r)) as unknown as Store[K];
};

const ids = (rows: Row[], field = "id") => rows.map((r) => r[field] as string);

/**
 * O retrato de uma pessoa. Quadros privados entram só para quem é membro deles
 * (o app confere o papel de novo em cada tela e ação, como no modo simulado).
 */
export async function loadSnapshot(userId: string): Promise<Store> {
  const store = emptyStore();
  const col = (key: keyof Store) => tableOf(key).columns;

  // 1ª rodada: de que workspaces e quadros a pessoa participa.
  const [myMemberships, myBoardMemberships] = await Promise.all([
    selectAll("workspace_members", col("workspaceMembers"), (q) => q.eq("user_id", userId)),
    selectAll("board_members", col("boardMembers"), (q) => q.eq("user_id", userId)),
  ]);
  const workspaceIds = ids(myMemberships, "workspace_id");

  if (workspaceIds.length === 0) {
    store.users = load("users", await selectIn("profiles", col("users"), "id", [userId]));
    return store;
  }

  // 2ª rodada: o que é do workspace e da pessoa (inclusive as pessoas, pela participação no workspace).
  const [workspaces, workspaceMembers, allBoards, invites, notifications, stars, visits, memberProfiles] = await Promise.all([
    selectIn("workspaces", col("workspaces"), "id", workspaceIds),
    selectIn("workspace_members", col("workspaceMembers"), "workspace_id", workspaceIds),
    // updated_at vira o carimbo do quadro (tempo real).
    selectIn("boards", [...col("boards"), "updated_at"], "workspace_id", workspaceIds),
    selectIn("invites", col("invites"), "workspace_id", workspaceIds),
    // Só as 200 mais recentes: o sino mostra 50.
    (async () => {
      const { data, error } = await adminClient()
        .from("notifications")
        .select(col("notifications").join(", "))
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(`[banco] ler notifications: ${error.message}`);
      return data as unknown as Row[];
    })(),
    selectAll("board_stars", col("boardStars"), (q) => q.eq("user_id", userId)),
    selectAll("board_visits", col("boardVisits"), (q) => q.eq("user_id", userId)),
    selectIn("profiles", [...col("users"), "workspace_members!inner(workspace_id)"], "workspace_members.workspace_id", workspaceIds),
  ]);

  const memberOf = new Set(ids(myBoardMemberships, "board_id"));
  const boards = allBoards.filter((b) => b.visibility === "workspace" || memberOf.has(b.id as string));
  const boardIds = ids(boards);

  // 3ª rodada: tudo o que é dos quadros. O que é dos cards vem pelo quadro do card (junção no banco),
  // sem esperar a lista de cards.
  const viaCard = (key: keyof Store) => [...col(key), "cards!inner(board_id)"];
  const [boardMembers, lists, cards, labels, activities, cardMembers, cardLabels, checklists, comments, checklistItems] = await Promise.all([
    selectIn("board_members", col("boardMembers"), "board_id", boardIds),
    selectIn("lists", col("lists"), "board_id", boardIds),
    selectIn("cards", col("cards"), "board_id", boardIds),
    selectIn("labels", col("labels"), "board_id", boardIds),
    (async () => {
      if (boardIds.length === 0) return [];
      const { data, error } = await adminClient()
        .from("activities")
        .select(col("activities").join(", "))
        .in("board_id", boardIds.slice(0, IN_CHUNK))
        .order("created_at", { ascending: false })
        .limit(MAX_ACTIVITIES);
      if (error) throw new Error(`[banco] ler activities: ${error.message}`);
      return data as unknown as Row[];
    })(),
    selectIn("card_members", viaCard("cardMembers"), "cards.board_id", boardIds),
    selectIn("card_labels", viaCard("cardLabels"), "cards.board_id", boardIds),
    selectIn("checklists", viaCard("checklists"), "cards.board_id", boardIds),
    selectIn("comments", viaCard("comments"), "cards.board_id", boardIds),
    selectIn("checklist_items", [...col("checklistItems"), "checklists!inner(cards!inner(board_id))"], "checklists.cards.board_id", boardIds),
  ]);

  // Quem aparece em comentários e atividades mas saiu do workspace (raro): mais uma consulta, só se precisar.
  const known = new Set(ids(memberProfiles));
  const missing = new Set<string>();
  if (!known.has(userId)) missing.add(userId);
  for (const c of comments) if (c.author_id && !known.has(c.author_id as string)) missing.add(c.author_id as string);
  for (const a of activities) if (a.actor_id && !known.has(a.actor_id as string)) missing.add(a.actor_id as string);
  const profiles = missing.size ? [...memberProfiles, ...(await selectIn("profiles", col("users"), "id", [...missing]))] : memberProfiles;

  store.users = load("users", profiles);
  store.workspaces = load("workspaces", workspaces);
  store.workspaceMembers = load("workspaceMembers", workspaceMembers);
  store.boards = load("boards", boards);
  store.boardMembers = load("boardMembers", boardMembers);
  store.boardStars = load("boardStars", stars);
  store.boardVisits = load("boardVisits", visits);
  store.lists = load("lists", lists);
  store.cards = load("cards", cards);
  store.labels = load("labels", labels);
  store.cardMembers = load("cardMembers", cardMembers);
  store.cardLabels = load("cardLabels", cardLabels);
  store.checklists = load("checklists", checklists);
  store.checklistItems = load("checklistItems", checklistItems);
  store.comments = load("comments", comments);
  store.invites = load("invites", invites);
  store.notifications = load("notifications", notifications);
  store.activities = load("activities", activities).reverse();
  // Carimbo do quadro (tempo real): a hora da última mudança.
  store.boardStamps = Object.fromEntries(boards.map((b) => [b.id as string, String(b.updated_at ?? "")]));
  return store;
}

// ---- diferença -----------------------------------------------------------------------------------

export type TableChanges = {
  spec: TableSpec;
  inserts: Row[];
  /** id → colunas que mudaram (já no formato do banco) e os valores lidos dos contadores. */
  updates: { id: string; patch: Row; expected: Row }[];
  deletes: string[];
};

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** O que mudou entre o retrato lido (base) e o retrato depois das regras (current). */
export function diffSnapshot(base: Store, current: Store): TableChanges[] {
  const result: TableChanges[] = [];
  for (const spec of TABLES) {
    if (spec.readOnly) continue;
    const before = new Map((base[spec.key] as unknown as Row[]).map((r) => [r.id as string, r]));
    const after = new Map((current[spec.key] as unknown as Row[]).map((r) => [r.id as string, r]));
    const changes: TableChanges = { spec, inserts: [], updates: [], deletes: [] };
    const allowed = spec.writable;

    for (const [id, row] of after) {
      const old = before.get(id);
      if (!old) {
        if (!allowed) changes.inserts.push(rowToDb(spec, row));
        continue;
      }
      const changed: Row = {};
      for (const field of Object.keys(row)) if (!same(row[field], old[field])) changed[field] = row[field];
      const patch = rowToDb(spec, changed);
      if (allowed) for (const column of Object.keys(patch)) if (!allowed.includes(column)) delete patch[column];
      if (Object.keys(patch).length === 0) continue;
      const expected = rowToDb(spec, old);
      const check: Row = {};
      for (const column of spec.compareAndSet ?? []) if (column in patch) check[column] = expected[column];
      changes.updates.push({ id, patch, expected: check });
    }
    if (!allowed) for (const id of before.keys()) if (!after.has(id)) changes.deletes.push(id);

    // Quadro mudou (carimbo trocado): a hora do quadro anda, e quem está com ele aberto recarrega.
    if (spec.key === "boards") {
      for (const id of after.keys()) {
        if (!before.has(id) || base.boardStamps[id] === current.boardStamps[id]) continue;
        const update = changes.updates.find((u) => u.id === id);
        if (!update) changes.updates.push({ id, patch: {}, expected: {} });
      }
    }
    if (changes.inserts.length || changes.updates.length || changes.deletes.length) result.push(changes);
  }
  return result;
}

// ---- gravação ------------------------------------------------------------------------------------

async function runAll<T>(items: T[], each: (item: T) => Promise<void>, parallel = 8) {
  for (let i = 0; i < items.length; i += parallel) await Promise.all(items.slice(i, i + parallel).map(each));
}

async function applyUpdate(spec: TableSpec, update: TableChanges["updates"][number], now: string) {
  const patch = { ...update.patch, ...(spec.updatedAt ? { updated_at: now } : {}) };
  let query = adminClient().from(spec.table).update(patch).eq("id", update.id);
  for (const [column, value] of Object.entries(update.expected)) query = query.eq(column, value as never);
  const { data, error } = await query.select("id");
  if (error) throw new WriteFailed(spec.table, error.message);
  if (Object.keys(update.expected).length > 0 && (data?.length ?? 0) === 0) throw new WriteConflict(spec.table === "cards" ? "este card" : "este quadro");
}

/** Grava as mudanças: contadores (com conferência), linhas novas, mudanças e remoções. */
export async function flushChanges(changes: TableChanges[], now = new Date().toISOString()) {
  // 1. Contadores primeiro: se outra pessoa mexeu ao mesmo tempo, nada mais é gravado.
  for (const c of changes) {
    for (const u of c.updates.filter((x) => Object.keys(x.expected).length > 0)) await applyUpdate(c.spec, u, now);
  }
  // 2. Linhas novas, na ordem do mapa (quem é referenciado entra antes).
  for (const c of changes) {
    if (c.inserts.length === 0) continue;
    for (let i = 0; i < c.inserts.length; i += 500) {
      const { error } = await adminClient().from(c.spec.table).insert(c.inserts.slice(i, i + 500));
      if (error) throw new WriteFailed(c.spec.table, error.message);
    }
  }
  // 3. Mudanças.
  for (const c of changes) {
    await runAll(
      c.updates.filter((x) => Object.keys(x.expected).length === 0),
      (u) => applyUpdate(c.spec, u, now),
    );
  }
  // 4. Remoções, de trás para a frente (o que depende sai antes).
  for (const c of [...changes].reverse()) {
    for (let i = 0; i < c.deletes.length; i += IN_CHUNK) {
      const { error } = await adminClient().from(c.spec.table).delete().in("id", c.deletes.slice(i, i + IN_CHUNK));
      if (error) throw new WriteFailed(c.spec.table, error.message);
    }
  }
}

// ---- imagens que saíram de uso -------------------------------------------------------------------

const imagePath = (store: Store, boardId: string) => {
  const bg = store.boards.find((b) => b.id === boardId)?.background;
  return bg?.type === "image" ? bg.fileId : null;
};

/**
 * Depois de gravar: imagem de fundo que saiu de uso (trocada por outra ou por uma
 * cor, ou quadro excluído) é apagada do Storage. Falha aqui só deixa um arquivo
 * sobrando; não desfaz nada.
 */
export async function removeUnusedBoardImages(base: Store, current: Store) {
  const paths: string[] = [];
  const deleted: string[] = [];
  for (const board of base.boards) {
    const before = imagePath(base, board.id);
    const stillThere = current.boards.some((b) => b.id === board.id);
    if (!stillThere) deleted.push(board.id);
    if (before && (!stillThere || imagePath(current, board.id) !== before)) paths.push(before);
  }
  if (paths.length === 0 && deleted.length === 0) return;
  const storage = adminClient().storage.from(UPLOADS_BUCKET);
  // Quadro excluído: tudo o que estava na pasta dele (inclusive sobras de envios antigos).
  for (const boardId of deleted) {
    const { data } = await storage.list(`boards/${boardId}`);
    for (const file of data ?? []) paths.push(`boards/${boardId}/${file.name}`);
  }
  if (paths.length === 0) return;
  const { error } = await storage.remove([...new Set(paths)]);
  if (error) console.error("[storage] apagar fundos de quadro sem uso:", error.message);
}
