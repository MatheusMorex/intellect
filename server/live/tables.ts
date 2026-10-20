// Mapa entre o armazenamento do app (server/store/types.ts, em camelCase) e as
// tabelas do Supabase (snake_case). O modo real (AUTH_MODE=live) carrega um
// "retrato" com o formato do armazenamento (server/live/snapshot.ts), as mesmas
// regras do app rodam sobre ele, e só o que mudou volta para o banco.
//
// As colunas de cada tabela estão escritas aqui à mão; o teste
// tests/live-snapshot.test.ts confere cada uma contra as migrações.

import type { Store } from "@/server/store/types";

type Row = Record<string, unknown>;

export type TableSpec = {
  /** Lista do armazenamento (store.cards, store.boardMembers...). */
  key: keyof Store;
  table: string;
  /** Colunas do banco que o app lê e grava (as outras ficam com o valor padrão do banco). */
  columns: readonly string[];
  /** Só leitura neste retrato: quem grava é outra parte do app (perfil e workspace: server/live/identity.ts). */
  readOnly?: boolean;
  /** No retrato só estas colunas podem mudar (o resto é ignorado ao gravar). */
  writable?: readonly string[];
  /** A tabela tem updated_at: toda atualização grava a hora. */
  updatedAt?: boolean;
  /** Contadores: só gravam se o valor no banco ainda for o lido (senão, conflito e a ação roda de novo). */
  compareAndSet?: readonly string[];
  /**
   * Referências que entram numa segunda passada: a linha nova entra com elas vazias e,
   * depois de todas as linhas novas, ganha o valor (referência circular entre tabelas).
   */
  deferred?: readonly string[];
  /** Campos que só existem no app (calculados ao carregar): não vão para o banco. */
  appOnly?: readonly string[];
  /** Ajustes de formato na ida e na volta, sobre a linha já em camelCase. */
  fromDb?: (row: Row) => Row;
  toDb?: (row: Row) => Row;
};

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Fundo do quadro: no app a imagem é { fileId }, no banco { path } (caminho no Storage). */
function backgroundFromDb(value: unknown) {
  const bg = value as { type?: string; value?: string; path?: string } | null;
  if (bg?.type === "image" && bg.path) return { type: "image", fileId: bg.path };
  return bg ?? { type: "color", value: "purple" };
}
function backgroundToDb(value: unknown) {
  const bg = value as { type?: string; value?: string; fileId?: string };
  if (bg?.type === "image" && bg.fileId) return { type: "image", path: bg.fileId };
  return bg;
}

/** Aparência do perfil: o plano de fundo é { fileId } no app e { path } no banco. */
function appearanceFromDb(value: unknown) {
  const a = (value ?? {}) as { wallpaper?: { path?: string; dim?: number; blur?: number } | null; showTaglines?: boolean; homePage?: string };
  return {
    showTaglines: a.showTaglines ?? true,
    homePage: a.homePage ?? "inicio",
    wallpaper: a.wallpaper?.path ? { fileId: a.wallpaper.path, dim: a.wallpaper.dim ?? 0, blur: a.wallpaper.blur ?? 0 } : null,
  };
}

const DEFAULT_PREFERENCES = { colorblind: false, reduceMotion: false, singleKeyShortcuts: true, emailNotifications: "periodic" };

/** Na ordem em que as linhas novas entram no banco (quem é referenciado vem antes). */
export const TABLES: readonly TableSpec[] = [
  {
    key: "users",
    table: "profiles",
    columns: ["id", "name", "email", "username", "bio", "timezone", "theme", "avatar_color", "avatar_path", "preferences", "appearance", "last_active_at"],
    writable: ["last_active_at"],
    fromDb: ({ avatarPath, preferences, appearance, ...r }) => ({
      ...r,
      // Login fica no Supabase Auth: o retrato não tem senha.
      passwordHash: "",
      avatarFileId: avatarPath,
      preferences: { ...DEFAULT_PREFERENCES, ...((preferences as Row | null) ?? {}) },
      appearance: appearanceFromDb(appearance),
    }),
  },
  { key: "workspaces", table: "workspaces", columns: ["id", "name", "slug", "description", "allowed_email_domain", "created_at"], readOnly: true },
  { key: "workspaceMembers", table: "workspace_members", columns: ["id", "workspace_id", "user_id", "role"], readOnly: true },
  {
    key: "boards",
    table: "boards",
    columns: ["id", "workspace_id", "name", "description", "background", "visibility", "prefs", "next_card_number", "closed_at", "created_by", "created_at"],
    updatedAt: true,
    compareAndSet: ["next_card_number"],
    fromDb: (r) => ({ ...r, background: backgroundFromDb(r.background) }),
    toDb: (r) => ("background" in r ? { ...r, background: backgroundToDb(r.background) } : r),
  },
  { key: "boardMembers", table: "board_members", columns: ["id", "board_id", "user_id", "role"], updatedAt: true },
  { key: "lists", table: "lists", columns: ["id", "board_id", "name", "rank", "color", "archived_at"], updatedAt: true },
  { key: "labels", table: "labels", columns: ["id", "board_id", "name", "color", "created_at"], updatedAt: true },
  {
    key: "automations",
    table: "automations",
    columns: [
      "id",
      "board_id",
      "type",
      "name",
      "trigger",
      "filters",
      "actions",
      "enabled",
      "timezone",
      "next_run_at",
      "dashboard_id",
      "created_by",
      "failure_count",
      "disabled_reason",
      "created_at",
      "updated_at",
    ],
  },
  {
    // Antes dos cards e das atividades: a chave única (automação, dedupe_key) recusa a execução
    // repetida antes de qualquer card ser criado. O card e a atividade de origem entram depois.
    key: "automationRuns",
    table: "automation_runs",
    columns: ["id", "automation_id", "trigger_activity_id", "card_id", "status", "dedupe_key", "depth", "chain", "message", "operations", "started_at", "finished_at"],
    deferred: ["card_id", "trigger_activity_id"],
    // O quadro vem da automação, ao carregar (server/live/snapshot.ts).
    appOnly: ["boardId"],
    // O banco aceita profundidade até 5; a execução parada por passar disso fica com 5.
    toDb: (r) => ("depth" in r ? { ...r, depth: Math.min(Number(r.depth), 5) } : r),
  },
  {
    key: "cards",
    table: "cards",
    columns: [
      "id",
      "board_id",
      "list_id",
      "number",
      "name",
      "description",
      "description_text",
      "version",
      "rank",
      "start_at",
      "due_at",
      "due_complete",
      "due_reminder_minutes",
      "due_recurrence",
      "cover",
      "created_by",
      "last_activity_at",
      "archived_at",
      "created_at",
    ],
    updatedAt: true,
    compareAndSet: ["version"],
  },
  { key: "boardStars", table: "board_stars", columns: ["id", "user_id", "board_id", "created_at"] },
  { key: "boardVisits", table: "board_visits", columns: ["id", "user_id", "board_id", "visited_at"] },
  { key: "cardMembers", table: "card_members", columns: ["id", "card_id", "user_id", "created_at"] },
  { key: "cardLabels", table: "card_labels", columns: ["id", "card_id", "label_id"] },
  { key: "checklists", table: "checklists", columns: ["id", "card_id", "name", "rank", "hide_checked", "created_at"], updatedAt: true },
  {
    key: "checklistItems",
    table: "checklist_items",
    columns: ["id", "checklist_id", "name", "rank", "completed_at", "due_at", "assignee_id", "created_at"],
    updatedAt: true,
  },
  { key: "comments", table: "comments", columns: ["id", "card_id", "author_id", "body", "body_text", "mentions", "automation_name", "edited_at", "created_at"] },
  {
    key: "invites",
    table: "invites",
    columns: ["id", "workspace_id", "board_id", "email", "role", "token_hash", "expires_at", "max_uses", "used_count", "created_by", "revoked_at", "created_at"],
  },
  { key: "notifications", table: "notifications", columns: ["id", "user_id", "type", "board_id", "card_id", "actor_id", "data", "read_at", "created_at"] },
  {
    key: "activities",
    table: "activities",
    columns: ["id", "workspace_id", "board_id", "card_id", "actor_id", "actor_kind", "automation_run_id", "type", "data", "automation_checked_at", "created_at"],
  },
];

export const tableOf = (key: keyof Store) => TABLES.find((t) => t.key === key)!;

/** Datas e horas do banco ("…+00:00", com microssegundos) no formato do app (toISOString). */
function normalizeTime(value: unknown) {
  if (typeof value !== "string") return value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

/** Linha do banco → linha do app. */
export function rowFromDb(spec: TableSpec, dbRow: Row): Row {
  const row: Row = {};
  for (const [column, value] of Object.entries(dbRow)) {
    if (!spec.columns.includes(column)) continue;
    row[camel(column)] = column.endsWith("_at") ? normalizeTime(value) : value;
  }
  return spec.fromDb ? spec.fromDb(row) : row;
}

/** Linha (ou parte de uma linha) do app → colunas do banco. Campos que o banco não tem ficam de fora. */
export function rowToDb(spec: TableSpec, appRow: Row): Row {
  const source = spec.toDb ? spec.toDb(appRow) : appRow;
  const out: Row = {};
  for (const column of spec.columns) {
    const field = camel(column);
    if (field in source && source[field] !== undefined) out[column] = source[field];
  }
  return out;
}

