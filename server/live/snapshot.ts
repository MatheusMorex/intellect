// Retrato do kanban no modo real (AUTH_MODE=live). Carrega do Supabase, no
// formato do armazenamento do app, tudo o que uma pessoa enxerga: os workspaces
// dela, os quadros que pode ver (com listas, cards, etiquetas, checklists e
// comentários), as pessoas desses workspaces e as notificações dela. As regras
// do app rodam sobre o retrato; no fim, diffSnapshot diz o que mudou e
// flushChanges grava só isso.
//
// Sem transação entre tabelas (a API do Supabase faz uma operação por pedido).
// Por isso a ordem importa: contadores primeiro (com conferência), remoções em
// tabelas que nada referencia, linhas novas, mudanças e, por último, as outras
// remoções.

import { adminClient } from "@/server/db/admin";
import { ATTACHMENTS_BUCKET, UPLOADS_BUCKET } from "@/server/live/settings";
import { emptyStore } from "@/server/store/seed";
import type { Store } from "@/server/store/types";

import { LEAF_TABLES, rowFromDb, rowToDb, TABLES, tableOf, type TableSpec } from "./tables";

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

/**
 * Todas as linhas de uma consulta, página por página (ordem fixa, pelo id por padrão).
 * Falha de rede numa leitura: o próprio supabase-js tenta de novo (até 3 vezes), e
 * cada pedido tem tempo-limite (server/db/admin.ts).
 */
async function selectAll(table: string, columns: readonly string[], filter: (q: Query) => Query, orderBy = "id"): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(adminClient().from(table).select(columns.join(", ")))
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`[banco] ler ${table}: ${error.message}`);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
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

export type LoadOptions = {
  /** Vendas e anúncios: contas, campanhas, gastos, lojas, pedidos, custos, painéis e câmbio. */
  tracking?: boolean;
  /** Entregas de webhook (o retrato normal não traz nenhuma: elas se acumulam e só o webhook precisa). */
  deliveries?: { ids?: string[]; deliveryIds?: string[] };
};

/**
 * Dashboards e vínculos de card (sempre: o menu e o kanban usam) e, se pedido,
 * vendas e anúncios do workspace. Tudo filtrado pelo workspace com junções no
 * banco, numa rodada só.
 */
export async function loadWorkspaceData(workspaceIds: string[], options: LoadOptions): Promise<Partial<Store>> {
  const col = (key: keyof Store) => tableOf(key).columns;
  const via = (key: keyof Store, join: string) => [...col(key), join];
  const byDashboard = (key: keyof Store, table: string) => selectIn(table, via(key, "dashboards!inner(workspace_id)"), "dashboards.workspace_id", workspaceIds);
  const byAccount = (key: keyof Store, table: string) => selectIn(table, via(key, "ad_accounts!inner(workspace_id)"), "ad_accounts.workspace_id", workspaceIds);
  const byWorkspace = (key: keyof Store, table: string) => selectIn(table, col(key), "workspace_id", workspaceIds);
  const none = async () => [] as Row[];
  const t = options.tracking ?? false;
  const d = options.deliveries;

  const [dashboards, cardLinks, ...rest] = await Promise.all([
    byWorkspace("dashboards", "dashboards"),
    byDashboard("cardLinks", "card_links"),
    t ? byWorkspace("adConnections", "ad_connections") : none(),
    t ? byWorkspace("adAccounts", "ad_accounts") : none(),
    t ? byDashboard("dashboardAdAccounts", "dashboard_ad_accounts") : none(),
    t ? byAccount("campaigns", "campaigns") : none(),
    t ? byAccount("adSets", "ad_sets") : none(),
    t ? byAccount("ads", "ads") : none(),
    t ? byAccount("keywords", "keywords") : none(),
    t ? byAccount("adInsightsDaily", "ad_insights_daily") : none(),
    t
      ? selectIn("keyword_insights_daily", via("keywordInsightsDaily", "keywords!inner(ad_accounts!inner(workspace_id))"), "keywords.ad_accounts.workspace_id", workspaceIds)
      : none(),
    t ? byWorkspace("stores", "stores") : none(),
    t ? byDashboard("dashboardStores", "dashboard_stores") : none(),
    d?.ids?.length ? selectIn("webhook_deliveries", col("webhookDeliveries"), "id", d.ids) : none(),
    d?.deliveryIds?.length ? selectIn("webhook_deliveries", col("webhookDeliveries"), "delivery_id", d.deliveryIds) : none(),
    t ? byWorkspace("products", "products") : none(),
    t ? selectIn("product_costs", via("productCosts", "products!inner(workspace_id)"), "products.workspace_id", workspaceIds) : none(),
    t ? byWorkspace("orders", "orders") : none(),
    t ? selectIn("order_items", via("orderItems", "orders!inner(workspace_id)"), "orders.workspace_id", workspaceIds) : none(),
    t ? selectIn("order_events", via("orderEvents", "orders!inner(workspace_id)"), "orders.workspace_id", workspaceIds) : none(),
    t ? byDashboard("costSettings", "cost_settings") : none(),
    t ? byDashboard("additionalFees", "additional_fees") : none(),
    t ? byDashboard("expenses", "expenses") : none(),
    t ? byDashboard("integrationTests", "integration_tests") : none(),
    t ? byDashboard("panels", "dashboard_panels") : none(),
    t ? selectAll("fx_rates", col("fxRates"), (q) => q.eq("base", "BRL")) : none(),
    t ? selectAll("fx_coverage", col("fxCoverage"), (q) => q, "quote") : none(),
  ]);
  const [
    adConnections,
    adAccounts,
    dashboardAdAccounts,
    campaigns,
    adSets,
    ads,
    keywords,
    adInsightsDaily,
    keywordInsightsDaily,
    stores,
    dashboardStores,
    deliveriesById,
    deliveriesByDeliveryId,
    products,
    productCosts,
    orders,
    orderItems,
    orderEvents,
    costSettings,
    additionalFees,
    expenses,
    integrationTests,
    panels,
    fxRates,
    fxCoverage,
  ] = rest;
  const deliveries = new Map([...deliveriesById, ...deliveriesByDeliveryId].map((r) => [r.id as string, r]));
  const coverageSpec = tableOf("fxCoverage");
  return {
    dashboards: load("dashboards", dashboards),
    cardLinks: load("cardLinks", cardLinks),
    adConnections: load("adConnections", adConnections),
    adAccounts: load("adAccounts", adAccounts),
    dashboardAdAccounts: load("dashboardAdAccounts", dashboardAdAccounts),
    campaigns: load("campaigns", campaigns),
    adSets: load("adSets", adSets),
    ads: load("ads", ads),
    keywords: load("keywords", keywords),
    adInsightsDaily: load("adInsightsDaily", adInsightsDaily),
    keywordInsightsDaily: load("keywordInsightsDaily", keywordInsightsDaily),
    stores: load("stores", stores),
    dashboardStores: load("dashboardStores", dashboardStores),
    webhookDeliveries: load("webhookDeliveries", [...deliveries.values()]),
    products: load("products", products),
    productCosts: load("productCosts", productCosts),
    orders: load("orders", orders),
    orderItems: load("orderItems", orderItems),
    orderEvents: load("orderEvents", orderEvents),
    costSettings: load("costSettings", costSettings),
    additionalFees: load("additionalFees", additionalFees),
    expenses: load("expenses", expenses),
    integrationTests: load("integrationTests", integrationTests),
    panels: load("panels", panels),
    fxRates: load("fxRates", fxRates),
    fxCoverage: Object.fromEntries(
      fxCoverage.map((r) => {
        const { quote, ...rest } = rowFromDb(coverageSpec, r);
        return [String(quote), rest];
      }),
    ) as Store["fxCoverage"],
  };
}

/**
 * O retrato de uma pessoa. Quadros privados entram só para quem é membro deles
 * (o app confere o papel de novo em cada tela e ação, como no modo simulado).
 */
export async function loadSnapshot(userId: string, options: LoadOptions = {}): Promise<Store> {
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
  const [workspaceData, workspaces, workspaceMembers, allBoards, invites, notifications, stars, visits, memberProfiles] = await Promise.all([
    loadWorkspaceData(workspaceIds, options),
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

  Object.assign(store, workspaceData);
  store.workspaces = load("workspaces", workspaces);
  store.workspaceMembers = load("workspaceMembers", workspaceMembers);
  store.boardStars = load("boardStars", stars);
  store.boardVisits = load("boardVisits", visits);
  store.invites = load("invites", invites);
  store.notifications = load("notifications", notifications);
  await fillBoards(store, boards, memberProfiles, userId);
  return store;
}

/**
 * Retrato de um workspace inteiro, sem pessoa logada: o relógio da automação
 * (agendadas, prazos e lembretes) olha todos os quadros. As notificações que
 * entram são só os lembretes de prazo recentes (para não lembrar duas vezes).
 */
export async function loadWorkspaceSnapshot(workspaceId: string, options: LoadOptions = {}): Promise<Store> {
  const store = emptyStore();
  const col = (key: keyof Store) => tableOf(key).columns;
  const [workspaceData, workspaces, workspaceMembers, boards, memberProfiles] = await Promise.all([
    loadWorkspaceData([workspaceId], options),
    selectIn("workspaces", col("workspaces"), "id", [workspaceId]),
    selectIn("workspace_members", col("workspaceMembers"), "workspace_id", [workspaceId]),
    selectIn("boards", [...col("boards"), "updated_at"], "workspace_id", [workspaceId]),
    selectIn("profiles", [...col("users"), "workspace_members!inner(workspace_id)"], "workspace_members.workspace_id", [workspaceId]),
  ]);
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const reminders = await selectIn("notifications", col("notifications"), "board_id", ids(boards), (q) => q.eq("type", "due_soon").gte("created_at", since));
  Object.assign(store, workspaceData);
  store.workspaces = load("workspaces", workspaces);
  store.workspaceMembers = load("workspaceMembers", workspaceMembers);
  store.notifications = load("notifications", reminders);
  await fillBoards(store, boards, memberProfiles, null);
  return store;
}

/** Execuções com chave de repetição dos últimos dias (para a mesma automação não rodar duas vezes). */
const RUNS_DAYS = 32;
/** Execuções mais recentes, para o histórico (S16). */
const RECENT_RUNS = 300;

/**
 * Última rodada, comum aos dois retratos: tudo o que é dos quadros. O que é dos
 * cards vem pelo quadro do card (junção no banco), sem esperar a lista de cards.
 */
async function fillBoards(store: Store, boards: Row[], memberProfiles: Row[], userId: string | null) {
  const col = (key: keyof Store) => tableOf(key).columns;
  const boardIds = ids(boards);
  const viaCard = (key: keyof Store) => [...col(key), "cards!inner(board_id)"];
  const viaAutomation = [...col("automationRuns"), "automations!inner(board_id)"];
  const latest = async (table: string, columns: readonly string[], filter: (q: Query) => Query, order: string, limit: number) => {
    if (boardIds.length === 0) return [];
    const { data, error } = await filter(adminClient().from(table).select(columns.join(", ")))
      .order(order, { ascending: false })
      .limit(limit);
    if (error) throw new Error(`[banco] ler ${table}: ${error.message}`);
    return data as unknown as Row[];
  };
  const someBoards = boardIds.slice(0, IN_CHUNK);
  const since = new Date(Date.now() - RUNS_DAYS * 86_400_000).toISOString();
  const [boardMembers, lists, cards, labels, activities, cardMembers, cardLabels, checklists, comments, checklistItems, automations, keyedRuns, recentRuns, attachments] =
    await Promise.all([
      selectIn("board_members", col("boardMembers"), "board_id", boardIds),
      selectIn("lists", col("lists"), "board_id", boardIds),
      selectIn("cards", col("cards"), "board_id", boardIds),
      selectIn("labels", col("labels"), "board_id", boardIds),
      latest("activities", col("activities"), (q) => q.in("board_id", someBoards), "created_at", MAX_ACTIVITIES),
      selectIn("card_members", viaCard("cardMembers"), "cards.board_id", boardIds),
      selectIn("card_labels", viaCard("cardLabels"), "cards.board_id", boardIds),
      selectIn("checklists", viaCard("checklists"), "cards.board_id", boardIds),
      selectIn("comments", viaCard("comments"), "cards.board_id", boardIds),
      selectIn("checklist_items", [...col("checklistItems"), "checklists!inner(cards!inner(board_id))"], "checklists.cards.board_id", boardIds),
      selectIn("automations", col("automations"), "board_id", boardIds),
      selectIn("automation_runs", viaAutomation, "automations.board_id", boardIds, (q) => q.not("dedupe_key", "is", null).gte("started_at", since)),
      latest("automation_runs", viaAutomation, (q) => q.in("automations.board_id", someBoards), "started_at", RECENT_RUNS),
      selectIn("attachments", viaCard("attachments"), "cards.board_id", boardIds),
    ]);

  // Quem aparece em comentários e atividades mas saiu do workspace (raro): mais uma consulta, só se precisar.
  const known = new Set(ids(memberProfiles));
  const missing = new Set<string>();
  if (userId && !known.has(userId)) missing.add(userId);
  for (const c of comments) if (c.author_id && !known.has(c.author_id as string)) missing.add(c.author_id as string);
  for (const a of activities) if (a.actor_id && !known.has(a.actor_id as string)) missing.add(a.actor_id as string);
  const profiles = missing.size ? [...memberProfiles, ...(await selectIn("profiles", col("users"), "id", [...missing]))] : memberProfiles;

  // Execuções: as duas listas juntas, sem repetir, da mais antiga para a mais nova; o quadro vem da automação.
  const runRows = new Map<string, Row>();
  for (const r of [...keyedRuns, ...recentRuns]) runRows.set(r.id as string, r);
  const sortedRuns = [...runRows.values()].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
  const runs = load("automationRuns", sortedRuns);
  sortedRuns.forEach((r, i) => (runs[i].boardId = (r.automations as { board_id: string }).board_id));

  store.users = load("users", profiles);
  store.boards = load("boards", boards);
  store.boardMembers = load("boardMembers", boardMembers);
  store.lists = load("lists", lists);
  store.cards = load("cards", cards);
  store.labels = load("labels", labels);
  store.cardMembers = load("cardMembers", cardMembers);
  store.cardLabels = load("cardLabels", cardLabels);
  store.checklists = load("checklists", checklists);
  store.checklistItems = load("checklistItems", checklistItems);
  store.comments = load("comments", comments);
  store.attachments = load("attachments", attachments);
  store.activities = load("activities", activities).reverse();
  store.automations = load("automations", automations);
  store.automationRuns = runs;
  // Carimbo do quadro (tempo real): a hora da última mudança.
  store.boardStamps = Object.fromEntries(boards.map((b) => [b.id as string, String(b.updated_at ?? "")]));
}

// ---- diferença -----------------------------------------------------------------------------------

export type TableChanges = {
  spec: TableSpec;
  inserts: Row[];
  /**
   * id → colunas que mudaram (já no formato do banco) e os valores lidos dos contadores.
   * deferred: a segunda passada de uma linha nova (referência circular).
   */
  updates: { id: string; patch: Row; expected: Row; deferred?: boolean }[];
  deletes: string[];
  /** Linhas sem id (câmbio): novas ou mudadas, gravadas com "insere ou atualiza". */
  upserts: Row[];
};

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** As linhas de uma tabela no retrato, cada uma com o que a identifica. */
function keyedRows(spec: TableSpec, store: Store): Map<string, Row> {
  const value = store[spec.key] as unknown;
  if (spec.recordKey) {
    const key = spec.recordKey;
    return new Map(Object.entries((value ?? {}) as Record<string, Row>).map(([k, v]) => [k, { [key]: k, ...v }]));
  }
  const identity = spec.identity ?? ((r: Row) => r.id as string);
  return new Map((value as Row[]).map((r) => [identity(r), r]));
}

/** O que mudou entre o retrato lido (base) e o retrato depois das regras (current). */
export function diffSnapshot(base: Store, current: Store): TableChanges[] {
  const result: TableChanges[] = [];
  for (const spec of TABLES) {
    if (spec.readOnly) continue;
    const before = keyedRows(spec, base);
    const after = keyedRows(spec, current);
    const changes: TableChanges = { spec, inserts: [], updates: [], deletes: [], upserts: [] };
    const allowed = spec.writable;

    // Sem id (câmbio): o que é novo ou mudou vai inteiro; nada é apagado.
    if (spec.upsertOn) {
      for (const [key, row] of after) if (!same(row, before.get(key))) changes.upserts.push(rowToDb(spec, row));
      if (changes.upserts.length) result.push(changes);
      continue;
    }

    for (const [id, row] of after) {
      const old = before.get(id);
      if (!old) {
        if (allowed) continue;
        const insert = { ...spec.insertDefaults, ...rowToDb(spec, row) };
        // Referência circular: entra vazia e ganha o valor depois de todas as linhas novas
        // (uma coluna por vez: uma referência que não existe não leva a outra junto).
        for (const column of spec.deferred ?? []) {
          if (insert[column] != null) changes.updates.push({ id, patch: { [column]: insert[column] }, expected: {}, deferred: true });
          insert[column] = null;
        }
        changes.inserts.push(insert);
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

type WriteResult = { error: { message: string; code?: string } | null };

/**
 * Uma gravação, com até 3 tentativas quando a falha é de rede (erro sem código do
 * banco, como o tempo-limite de server/db/admin.ts). Toda gravação daqui pode ser
 * repetida: mudança e remoção pelo id dão o mesmo resultado, e a linha nova já vem
 * com o id (se a tentativa anterior entrou sem resposta, a nova acusa id repetido).
 */
export async function retryOnNetwork<T extends WriteResult>(write: () => PromiseLike<T>, waitMs = 500): Promise<{ result: T; attempts: number }> {
  for (let attempt = 1; ; attempt++) {
    const result = await write();
    if (!result.error || result.error.code || attempt >= 3) return { result, attempts: attempt };
    await new Promise((resolve) => setTimeout(resolve, waitMs * attempt));
  }
}

/** Linha nova recusada por id repetido numa nova tentativa: ela tinha entrado na anterior (sem resposta). */
export function landedBefore(attempts: number, error: { message: string; code?: string }) {
  return attempts > 1 && error.code === "23505" && /_pkey\b/.test(error.message);
}

async function runAll<T>(items: T[], each: (item: T) => Promise<void>, parallel = 8) {
  for (let i = 0; i < items.length; i += parallel) await Promise.all(items.slice(i, i + parallel).map(each));
}

async function applyUpdate(spec: TableSpec, update: TableChanges["updates"][number], now: string) {
  const patch = { ...update.patch, ...(spec.updatedAt ? { updated_at: now } : {}) };
  const {
    result: { data, error },
  } = await retryOnNetwork(() => {
    let query = adminClient().from(spec.table).update(patch).eq("id", update.id);
    for (const [column, value] of Object.entries(update.expected)) query = query.eq(column, value as never);
    return query.select("id");
  });
  // Segunda passada apontando para algo que não chegou a existir (a automação criou um card e
  // desfez tudo por erro): a referência fica vazia, como o banco faria se o card fosse apagado.
  if (error?.code === "23503" && update.deferred) return;
  if (error) throw new WriteFailed(spec.table, error.message);
  if (Object.keys(update.expected).length > 0 && (data?.length ?? 0) === 0) throw new WriteConflict(spec.table === "cards" ? "este card" : "este quadro");
}

async function removeRows(c: TableChanges) {
  for (let i = 0; i < c.deletes.length; i += IN_CHUNK) {
    const ids = c.deletes.slice(i, i + IN_CHUNK);
    const {
      result: { error },
    } = await retryOnNetwork(() => adminClient().from(c.spec.table).delete().in("id", ids));
    if (error) throw new WriteFailed(c.spec.table, error.message);
  }
}

/** Grava as mudanças: contadores (com conferência), remoções sem efeito em outras tabelas, linhas novas, mudanças e as outras remoções. */
export async function flushChanges(changes: TableChanges[], now = new Date().toISOString()) {
  // 1. Contadores primeiro: se outra pessoa mexeu ao mesmo tempo, nada mais é gravado.
  for (const c of changes) {
    for (const u of c.updates.filter((x) => Object.keys(x.expected).length > 0)) await applyUpdate(c.spec, u, now);
  }
  // 2. Remoções em tabelas que nada referencia: a linha trocada sai antes de a nova entrar.
  for (const c of changes) if (LEAF_TABLES.has(c.spec.table)) await removeRows(c);
  // 3. Linhas novas, na ordem do mapa (quem é referenciado entra antes).
  for (const c of changes) {
    for (let i = 0; i < c.inserts.length; i += 500) {
      const rows = c.inserts.slice(i, i + 500);
      const { result, attempts } = await retryOnNetwork(() => adminClient().from(c.spec.table).insert(rows));
      if (result.error && !landedBefore(attempts, result.error)) throw new WriteFailed(c.spec.table, result.error.message);
    }
    for (let i = 0; i < c.upserts.length; i += 500) {
      const rows = c.upserts.slice(i, i + 500);
      const {
        result: { error },
      } = await retryOnNetwork(() => adminClient().from(c.spec.table).upsert(rows, { onConflict: c.spec.upsertOn }));
      if (error) throw new WriteFailed(c.spec.table, error.message);
    }
  }
  // 4. Mudanças (as marcadas para ir primeiro, depois o resto).
  for (const c of changes) {
    const plain = c.updates.filter((x) => Object.keys(x.expected).length === 0);
    const first = c.spec.updateFirst ? plain.filter((u) => c.spec.updateFirst!(u.patch)) : [];
    await runAll(first, (u) => applyUpdate(c.spec, u, now));
    await runAll(
      plain.filter((u) => !first.includes(u)),
      (u) => applyUpdate(c.spec, u, now),
    );
  }
  // 5. As outras remoções, de trás para a frente (o que depende sai antes).
  for (const c of [...changes].reverse()) if (!LEAF_TABLES.has(c.spec.table)) await removeRows(c);
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

/**
 * Depois de gravar: arquivo de anexo cuja linha saiu (anexo excluído, card ou
 * quadro apagado) é apagado do Storage. Falha aqui só deixa um arquivo sobrando.
 */
export async function removeDeletedAttachmentFiles(base: Store, current: Store) {
  const kept = new Set(current.attachments.map((a) => a.id));
  const keys = base.attachments.flatMap((a) => (!kept.has(a.id) && a.storageKey ? [a.storageKey] : []));
  if (keys.length === 0) return;
  const { error } = await adminClient().storage.from(ATTACHMENTS_BUCKET).remove(keys);
  if (error) console.error("[storage] apagar arquivos de anexos excluídos:", error.message);
}
