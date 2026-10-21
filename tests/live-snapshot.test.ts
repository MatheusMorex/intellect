// O retrato do modo real (server/live): o mapa entre o armazenamento do app e
// as tabelas do Supabase, e a diferença que decide o que gravar. Roda sem
// banco: confere o mapa contra as migrações e contra os dados de exemplo.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { diffSnapshot, landedBefore, retryOnNetwork, unmappedChanges } from "../server/live/snapshot.ts";
import { LEAF_TABLES, rowFromDb, rowToDb, TABLES, tableOf } from "../server/live/tables.ts";
import { createSeed } from "../server/store/seed.ts";
import type { Store } from "../server/store/types.ts";

type Row = Record<string, unknown>;

// ---- as migrações, lidas do disco ---------------------------------------------------------------

const DIR = path.join(import.meta.dirname, "..", "supabase", "migrations");
const SQL = fs
  .readdirSync(DIR)
  .sort()
  .map((f) => fs.readFileSync(path.join(DIR, f), "utf8"))
  .join("\n");

type Column = { name: string; notNull: boolean; hasDefault: boolean };
const SCHEMA = new Map<string, Column[]>();
for (const m of SQL.matchAll(/create table public\.(\w+) \(([\s\S]*?)\n\);/g)) {
  const columns: Column[] = [];
  for (const line of m[2].split("\n")) {
    const t = line.trim();
    const c = t.match(/^([a-z_][a-z0-9_]*)\s+(uuid|text|integer|bigint|boolean|jsonb|timestamptz|date|smallint|char|numeric|bytea)/);
    if (!c || ["constraint", "unique", "primary"].includes(c[1])) continue;
    columns.push({ name: c[1], notNull: /not null|primary key/.test(t), hasDefault: /default /.test(t) || /primary key/.test(t) });
  }
  SCHEMA.set(m[1], columns);
}
// Colunas acrescentadas depois (alter table ... add column).
for (const m of SQL.matchAll(/alter table public\.(\w+)\s+add column (\w+) ([^;]*);/g)) {
  SCHEMA.get(m[1])?.push({ name: m[2], notNull: /not null/.test(m[3]), hasDefault: /default /.test(m[3]) });
}
const NOW = new Date("2026-10-20T15:00:00Z");
const seed = createSeed(NOW);
// Os dados de exemplo nascem sem atividades nem execuções: uma de cada, completa, para o mapa ser conferido.
seed.activities.push({
  id: "33333333-3333-4333-8333-333333333333",
  workspaceId: seed.workspaces[0].id,
  boardId: seed.boards[0].id,
  cardId: seed.cards[0].id,
  actorId: seed.users[0].id,
  actorKind: "automation",
  type: "card.moved",
  data: { from: "A", to: "B" },
  automationRunId: null,
  automationCheckedAt: NOW.toISOString(),
  createdAt: NOW.toISOString(),
});
seed.automationRuns.push({
  id: "44444444-4444-4444-8444-444444444444",
  automationId: seed.automations[0].id,
  boardId: seed.automations[0].boardId,
  triggerActivityId: null,
  cardId: null,
  status: "success",
  dedupeKey: "chave",
  depth: 0,
  chain: [seed.automations[0].id],
  message: "1 ação feita.",
  operations: 1,
  startedAt: NOW.toISOString(),
  finishedAt: NOW.toISOString(),
});

describe("mapa do retrato × migrações", () => {
  test("cada coluna do mapa existe na tabela", () => {
    for (const spec of TABLES) {
      const schema = SCHEMA.get(spec.table);
      assert.ok(schema, `tabela ${spec.table} não está nas migrações`);
      const names = new Set(schema.map((c) => c.name));
      for (const column of spec.columns) assert.ok(names.has(column), `${spec.table}.${column} não existe`);
    }
  });

  test("coluna obrigatória sem valor padrão vai em toda linha nova", () => {
    for (const spec of TABLES) {
      if (spec.readOnly || spec.writable) continue;
      for (const column of SCHEMA.get(spec.table)!) {
        if (column.notNull && !column.hasDefault) {
          const covered = spec.columns.includes(column.name) || (spec.insertDefaults && column.name in spec.insertDefaults);
          assert.ok(covered, `${spec.table}.${column.name} é obrigatória e não está no mapa`);
        }
      }
    }
  });

  test("todo campo dos dados de exemplo tem coluna (nada some ao gravar)", () => {
    for (const spec of TABLES) {
      if (spec.readOnly || spec.writable) continue;
      // Os dados de exemplo não têm convites: os testes com o banco (tests/live) criam e conferem.
      const value = seed[spec.key] as unknown;
      const rows = spec.recordKey
        ? Object.entries(value as Record<string, Row>).map(([k, v]) => ({ [spec.recordKey!]: k, ...v }))
        : (value as Row[]);
      for (const row of rows.slice(0, 50)) {
        for (const [field, fieldValue] of Object.entries(row)) {
          if (spec.appOnly?.includes(field) || fieldValue === undefined) continue;
          // O campo sozinho tem que virar alguma coluna (com os ajustes de nome do mapa).
          const columns = Object.keys(rowToDb(spec, { [field]: fieldValue }));
          assert.ok(columns.length > 0, `${String(spec.key)}.${field} não tem coluna em ${spec.table}`);
        }
      }
    }
  });

  test("ida e volta (app → banco → app) devolve a mesma linha", () => {
    for (const spec of TABLES) {
      if (spec.key === "users") continue; // o perfil não tem senha no banco
      const value = seed[spec.key] as unknown;
      const rows = spec.recordKey
        ? Object.entries(value as Record<string, Row>).map(([k, v]) => ({ [spec.recordKey!]: k, ...v }))
        : (value as Row[]);
      for (const row of rows.slice(0, 30)) {
        const back = rowFromDb(spec, rowToDb(spec, row));
        const expected = Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== undefined && !spec.appOnly?.includes(k)));
        assert.deepEqual(back, expected, `${spec.table} ${row.id}`);
      }
    }
  });

  test("execução de automação: profundidade até 5 no banco; o quadro não vai (vem da automação)", () => {
    const spec = tableOf("automationRuns");
    const run = seed.automationRuns[0];
    const db = rowToDb(spec, { ...run, depth: 6 });
    assert.equal(db.depth, 5);
    assert.ok(!("board_id" in db) && !("boardId" in db));
  });

  test("fundo de quadro com imagem: { fileId } no app, { path } no banco", () => {
    const spec = tableOf("boards");
    const db = rowToDb(spec, { ...seed.boards[0], background: { type: "image", fileId: "boards/x/y.png" } });
    assert.deepEqual(db.background, { type: "image", path: "boards/x/y.png" });
    assert.deepEqual(rowFromDb(spec, db).background, { type: "image", fileId: "boards/x/y.png" });
  });

  test("hora do banco (+00:00, microssegundos) vira o formato do app", () => {
    const card = rowFromDb(tableOf("cards"), { ...rowToDb(tableOf("cards"), seed.cards[0]), due_at: "2026-10-20T15:00:00.123456+00:00" });
    assert.equal(card.dueAt, "2026-10-20T15:00:00.123Z");
  });

  test("perfil: o app só lê, fora a última atividade", () => {
    const profile = rowFromDb(tableOf("users"), {
      id: "u1",
      name: "Ana",
      email: "ana@x.test",
      username: null,
      bio: "",
      timezone: "America/Sao_Paulo",
      theme: "dark",
      avatar_color: "purple",
      avatar_path: "avatars/u1/a.png",
      preferences: { colorblind: true },
      appearance: { wallpaper: { path: "wallpapers/u1/w.png", dim: 40, blur: 2 } },
      last_active_at: null,
    });
    assert.equal(profile.avatarFileId, "avatars/u1/a.png");
    assert.deepEqual(profile.appearance, { showTaglines: true, homePage: "inicio", wallpaper: { fileId: "wallpapers/u1/w.png", dim: 40, blur: 2 } });
    assert.equal((profile.preferences as Row).colorblind, true);
    assert.equal((profile.preferences as Row).singleKeyShortcuts, true);
  });
});

// ---- a diferença ----------------------------------------------------------------------------------

const clone = (s: Store) => structuredClone(s);
const changesOf = (base: Store, current: Store, table: string) => diffSnapshot(base, current).find((c) => c.spec.table === table);

describe("diferença entre o retrato lido e o retrato depois das regras", () => {
  test("nada mudou, nada a gravar", () => {
    assert.deepEqual(diffSnapshot(seed, clone(seed)), []);
  });

  test("card novo vira inserção, com as colunas do banco", () => {
    const current = clone(seed);
    const card = { ...seed.cards[0], id: "11111111-1111-4111-8111-111111111111", number: 999, name: "Novo" };
    current.cards.push(card);
    const c = changesOf(seed, current, "cards")!;
    assert.equal(c.inserts.length, 1);
    assert.equal(c.inserts[0].name, "Novo");
    assert.equal(c.inserts[0].list_id, card.listId);
    assert.ok(!("listId" in c.inserts[0]));
  });

  test("mudança grava só as colunas que mudaram; a versão da descrição é conferida", () => {
    const current = clone(seed);
    const card = current.cards[0];
    card.name = "Nome novo";
    card.version += 1;
    const update = changesOf(seed, current, "cards")!.updates[0];
    assert.equal(update.id, card.id);
    assert.deepEqual(update.patch, { name: "Nome novo", version: seed.cards[0].version + 1 });
    assert.deepEqual(update.expected, { version: seed.cards[0].version });
  });

  test("número do próximo card é conferido (dois cards ao mesmo tempo não repetem número)", () => {
    const current = clone(seed);
    current.boards[0].nextCardNumber += 1;
    const update = changesOf(seed, current, "boards")!.updates[0];
    assert.deepEqual(update.expected, { next_card_number: seed.boards[0].nextCardNumber });
  });

  test("remoção vira delete pelo id", () => {
    const current = clone(seed);
    const gone = current.comments.pop()!;
    assert.deepEqual(changesOf(seed, current, "comments")!.deletes, [gone.id]);
  });

  test("carimbo do quadro trocado (lista renomeada): o quadro é atualizado, para quem está com ele aberto recarregar", () => {
    const current = clone(seed);
    const boardId = seed.boards[0].id;
    current.boardStamps[boardId] = "outro";
    const update = changesOf(seed, current, "boards")!.updates.find((u) => u.id === boardId)!;
    assert.deepEqual(update.patch, {});
  });

  test("tabelas só de leitura e colunas fora do permitido ficam de fora", () => {
    const current = clone(seed);
    current.workspaces[0].name = "Outro nome";
    current.workspaceMembers.pop();
    current.users[0].name = "Outra pessoa";
    current.users[0].lastActiveAt = "2026-10-20T16:00:00.000Z";
    const changes = diffSnapshot(seed, current);
    assert.equal(changes.find((c) => c.spec.table === "workspaces"), undefined);
    assert.equal(changes.find((c) => c.spec.table === "workspace_members"), undefined);
    const profiles = changes.find((c) => c.spec.table === "profiles")!;
    assert.deepEqual(profiles.updates, [{ id: current.users[0].id, patch: { last_active_at: "2026-10-20T16:00:00.000Z" }, expected: {} }]);
    assert.equal(profiles.inserts.length + profiles.deletes.length, 0);
  });

  test("mudança numa parte fora do mapa (arquivos, que entram na etapa 5) é acusada, não some em silêncio", () => {
    const current = clone(seed);
    assert.deepEqual(unmappedChanges(seed, current), []);
    current.files.push({ id: "f", ownerId: seed.users[0].id, kind: "avatar", boardId: null, mime: "image/png", size: 10, createdAt: NOW.toISOString() });
    current.outbox.push({ id: "x", to: "a@b.c", subject: "s", text: "t", link: null, createdAt: NOW.toISOString() });
    current.boardStamps[seed.boards[0].id] = "outro";
    assert.deepEqual(unmappedChanges(seed, current), ["files"]);
  });

  test("câmbio: cotação sem id vai inteira, com a moeda base; a cobertura vira linha por moeda", () => {
    const base = clone(seed);
    base.fxRates = [{ date: "2026-10-19", quote: "USD", rate: 0.18 }];
    base.fxCoverage = {};
    const current = clone(base);
    current.fxRates[0].rate = 0.181;
    current.fxRates.push({ date: "2026-10-20", quote: "USD", rate: 0.182 });
    current.fxCoverage.USD = { from: "2026-09-01", to: "2026-10-20", fetchedAt: NOW.toISOString() };
    const rates = changesOf(base, current, "fx_rates")!;
    assert.deepEqual(rates.upserts, [
      { date: "2026-10-19", base: "BRL", quote: "USD", rate: 0.181 },
      { date: "2026-10-20", base: "BRL", quote: "USD", rate: 0.182 },
    ]);
    assert.deepEqual(changesOf(base, current, "fx_coverage")!.upserts, [{ quote: "USD", from_date: "2026-09-01", to_date: "2026-10-20", fetched_at: NOW.toISOString() }]);
  });

  test("execução nova: o card e a atividade de origem entram numa segunda passada (referência circular)", () => {
    const current = clone(seed);
    const run = { ...seed.automationRuns[0], id: "22222222-2222-4222-8222-222222222222", cardId: seed.cards[0].id, triggerActivityId: seed.activities.at(-1)!.id };
    current.automationRuns.push(run);
    const c = changesOf(seed, current, "automation_runs")!;
    assert.equal(c.inserts[0].card_id, null);
    assert.equal(c.inserts[0].trigger_activity_id, null);
    assert.deepEqual(
      c.updates.map((u) => [u.id, u.patch, u.deferred]),
      [
        [run.id, { card_id: run.cardId }, true],
        [run.id, { trigger_activity_id: run.triggerActivityId }, true],
      ],
    );
  });

  test("ordem das tabelas: quem é referenciado entra antes", () => {
    const order = TABLES.map((t) => t.table);
    const before = (a: string, b: string) => assert.ok(order.indexOf(a) < order.indexOf(b), `${a} antes de ${b}`);
    before("boards", "lists");
    before("lists", "cards");
    before("labels", "card_labels");
    before("cards", "card_labels");
    before("cards", "checklists");
    before("checklists", "checklist_items");
    before("cards", "comments");
    before("cards", "notifications");
    before("cards", "activities");
    before("automations", "automation_runs");
    // A execução entra antes dos cards: a chave única recusa a repetida antes de qualquer card novo.
    before("automation_runs", "cards");
    before("automation_runs", "activities");
  });

  test("tabelas que nada referencia (remoção antes das linhas novas) batem com as migrações", () => {
    const referenced = new Set([...SQL.matchAll(/references public\.(\w+)/g)].map((m) => m[1]));
    const leaves = TABLES.filter((t) => !t.readOnly && !t.upsertOn && !referenced.has(t.table)).map((t) => t.table);
    assert.deepEqual([...LEAF_TABLES].sort(), leaves.sort());
  });

  test("painel padrão: o antigo deixa de ser padrão antes de o novo virar (um só por dashboard no banco)", () => {
    const base = structuredClone(seed);
    base.panels.push({ ...base.panels[0], id: "55555555-5555-4555-8555-555555555555", isDefault: false, position: 1 });
    const current = structuredClone(base);
    current.panels[0].isDefault = false;
    current.panels[1].isDefault = true;
    const spec = tableOf("panels");
    const updates = diffSnapshot(base, current).find((c) => c.spec === spec)!.updates;
    assert.deepEqual(
      updates.filter((u) => spec.updateFirst!(u.patch)).map((u) => u.id),
      [current.panels[0].id],
    );
  });
});

describe("gravação com a internet instável", () => {
  test("falha de rede (sem código do banco, como o tempo-limite) tenta de novo, até 3 vezes", async () => {
    let calls = 0;
    const { result, attempts } = await retryOnNetwork(async () => {
      calls++;
      return calls < 3 ? { error: { message: "TimeoutError: The operation was aborted due to timeout", code: "" } } : { error: null };
    }, 1);
    assert.equal(attempts, 3);
    assert.equal(result.error, null);
  });

  test("depois da 3ª falha de rede, devolve o erro; erro do banco não se repete", async () => {
    let calls = 0;
    const network = await retryOnNetwork(async () => {
      calls++;
      return { error: { message: "TypeError: fetch failed" } };
    }, 1);
    assert.equal(calls, 3);
    assert.equal(network.result.error?.message, "TypeError: fetch failed");
    calls = 0;
    const database = await retryOnNetwork(async () => {
      calls++;
      return { error: { message: 'duplicate key value violates unique constraint "cards_board_id_number_key"', code: "23505" } };
    }, 1);
    assert.equal(calls, 1);
    assert.equal(database.attempts, 1);
  });

  test("linha nova que entrou na tentativa sem resposta conta como gravada (só id repetido, só em nova tentativa)", () => {
    const pkey = { message: 'duplicate key value violates unique constraint "cards_pkey"', code: "23505" };
    assert.equal(landedBefore(2, pkey), true);
    assert.equal(landedBefore(1, pkey), false);
    assert.equal(landedBefore(2, { message: 'duplicate key value violates unique constraint "cards_board_id_number_key"', code: "23505" }), false);
    assert.equal(landedBefore(2, { message: "violates foreign key constraint", code: "23503" }), false);
  });
});
