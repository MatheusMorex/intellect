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
  /** Linha sem id no app (cotações): o que a identifica. */
  identity?: (row: Row) => string;
  /** Grava com "insere ou atualiza" por estas colunas (linhas sem id); nada é apagado. */
  upsertOn?: string;
  /** No app é um objeto { chave: linha } (cobertura do câmbio), não uma lista. */
  recordKey?: string;
  /** Carregado só quando a tela ou ação precisa (vendas e anúncios). */
  tracking?: boolean;
  /** Valores só para linhas novas, nas colunas obrigatórias que o app não tem (nunca em atualização). */
  insertDefaults?: Row;
  /**
   * Mudanças que gravam antes das outras da mesma tabela. Índice único parcial (um só
   * painel padrão por dashboard): o antigo deixa de ser padrão antes de o novo virar.
   */
  updateFirst?: (patch: Row) => boolean;
  /** Ajustes de formato na ida e na volta, sobre a linha já em camelCase. */
  fromDb?: (row: Row) => Row;
  toDb?: (row: Row) => Row;
};

/** snake_case → camelCase; número depois do sublinhado também cola (video_views_3s → videoViews3s). */
const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

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

  // ---- vendas e anúncios (etapa 4) ----
  {
    key: "dashboards",
    table: "dashboards",
    columns: ["id", "workspace_id", "name", "timezone", "currency", "revenue_basis", "include_interest", "revenue_goal_cents", "ad_platforms", "week_start"],
    updatedAt: true,
  },
  {
    key: "adConnections",
    table: "ad_connections",
    columns: ["id", "workspace_id", "provider", "external_user_id", "external_user_name", "token_expires_at", "status", "last_error", "created_by", "created_at"],
    updatedAt: true,
    tracking: true,
    // O token (criptografado) só existe na conexão real. A simulada entra com ele vazio; o app nunca o lê.
    insertDefaults: { access_token_enc: "\\x" },
  },
  {
    key: "adAccounts",
    table: "ad_accounts",
    columns: ["id", "workspace_id", "connection_id", "provider", "external_id", "name", "currency", "timezone", "status", "sync_enabled", "last_synced_at", "last_sync_error"],
    updatedAt: true,
    tracking: true,
  },
  { key: "dashboardAdAccounts", table: "dashboard_ad_accounts", columns: ["id", "dashboard_id", "ad_account_id"], tracking: true },
  {
    key: "campaigns",
    table: "campaigns",
    columns: ["id", "ad_account_id", "external_id", "name", "status", "channel_type", "daily_budget_cents", "target_cpa_cents"],
    updatedAt: true,
    tracking: true,
  },
  { key: "adSets", table: "ad_sets", columns: ["id", "ad_account_id", "campaign_id", "external_id", "name", "status", "daily_budget_cents"], updatedAt: true, tracking: true },
  {
    key: "ads",
    table: "ads",
    columns: ["id", "ad_account_id", "campaign_id", "ad_set_id", "external_id", "name", "status", "creative_format"],
    updatedAt: true,
    tracking: true,
    // O formato do criativo é `format` no app.
    fromDb: ({ creativeFormat, ...r }) => ({ ...r, format: creativeFormat ?? null }),
    toDb: ({ format, ...r }) => (format === undefined ? r : { ...r, creativeFormat: format }),
  },
  { key: "keywords", table: "keywords", columns: ["id", "ad_account_id", "campaign_id", "ad_set_id", "external_id", "text", "match_type", "status"], updatedAt: true, tracking: true },
  {
    key: "adInsightsDaily",
    table: "ad_insights_daily",
    columns: ["id", "ad_account_id", "campaign_id", "ad_set_id", "ad_id", "date", "currency", "spend_cents", "impressions", "clicks", "add_to_carts", "video_views_3s", "video_p75_views"],
    updatedAt: true,
    tracking: true,
  },
  { key: "keywordInsightsDaily", table: "keyword_insights_daily", columns: ["id", "keyword_id", "date", "currency", "spend_cents", "impressions", "clicks"], updatedAt: true, tracking: true },
  {
    key: "stores",
    table: "stores",
    columns: ["id", "workspace_id", "platform", "shop_domain", "name", "currency", "timezone", "status", "webhooks_ok", "last_event_at"],
    updatedAt: true,
    tracking: true,
  },
  { key: "dashboardStores", table: "dashboard_stores", columns: ["id", "dashboard_id", "store_id"], tracking: true },
  {
    key: "webhookDeliveries",
    table: "webhook_deliveries",
    columns: ["id", "store_id", "source", "delivery_id", "topic", "payload", "received_at", "processed_at", "attempts", "error"],
    tracking: true,
  },
  { key: "products", table: "products", columns: ["id", "workspace_id", "store_id", "external_id", "name"], updatedAt: true, tracking: true },
  { key: "productCosts", table: "product_costs", columns: ["id", "product_id", "cost_cents", "currency", "valid_from", "created_by", "created_at"], tracking: true },
  {
    key: "orders",
    table: "orders",
    columns: [
      "id",
      "workspace_id",
      "store_id",
      "external_id",
      "name",
      "status",
      "payment_method",
      "currency",
      "total_cents",
      "subtotal_cents",
      "shipping_cents",
      "tax_cents",
      "discount_cents",
      "refunded_cents",
      "gateway_fee_cents",
      "interest_cents",
      "is_test",
      "placed_at",
      "paid_at",
      "source_updated_at",
      "first_visit",
      "last_visit",
      "landing_page",
      "days_to_conversion",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "src",
      "sck",
      "attribution_status",
      "attributed_platform",
      "campaign_id",
      "ad_set_id",
      "ad_id",
      "created_at",
    ],
    updatedAt: true,
    tracking: true,
  },
  {
    key: "orderItems",
    table: "order_items",
    columns: ["id", "order_id", "product_id", "external_line_id", "name", "quantity", "unit_price_cents", "total_cents"],
    updatedAt: true,
    tracking: true,
  },
  { key: "orderEvents", table: "order_events", columns: ["id", "order_id", "status", "occurred_at", "topic", "webhook_delivery_id"], tracking: true },
  {
    key: "costSettings",
    table: "cost_settings",
    columns: ["id", "dashboard_id", "valid_from", "sales_tax_bp", "meta_ads_tax_bp", "extra_taxes", "created_by", "created_at"],
    tracking: true,
  },
  {
    key: "additionalFees",
    table: "additional_fees",
    columns: ["id", "dashboard_id", "name", "kind", "amount_cents", "currency", "bp", "scope", "product_id", "payment_method", "valid_from", "valid_until", "created_by", "created_at"],
    updatedAt: true,
    tracking: true,
  },
  {
    key: "expenses",
    table: "expenses",
    columns: ["id", "dashboard_id", "kind", "category", "description", "amount_cents", "currency", "date", "end_date", "created_by", "created_at"],
    updatedAt: true,
    tracking: true,
  },
  {
    key: "integrationTests",
    table: "integration_tests",
    columns: ["id", "dashboard_id", "traffic_source", "campaign_url", "test_code", "status", "order_id", "created_by", "created_at"],
    updatedAt: true,
    tracking: true,
  },
  {
    key: "panels",
    table: "dashboard_panels",
    columns: ["id", "dashboard_id", "name", "position", "is_default", "visibility", "viewer_ids", "members_can_filter", "defaults", "widgets", "layout", "created_by", "created_at", "updated_at"],
    tracking: true,
    updateFirst: (patch) => patch.is_default === false,
  },
  {
    // Cotação de referência (1 BRL = rate da moeda) por dia: sem id no app; o banco identifica por dia e moeda.
    key: "fxRates",
    table: "fx_rates",
    columns: ["date", "base", "quote", "rate"],
    identity: (r) => `${r.date}|${r.quote}`,
    upsertOn: "date,base,quote",
    // A moeda base é sempre BRL: no app a linha é só { date, quote, rate }.
    fromDb: ({ date, quote, rate }) => ({ date, quote, rate: Number(rate) }),
    toDb: (r) => ({ ...r, base: "BRL" }),
    tracking: true,
  },
  {
    // Até onde as cotações de cada moeda já foram buscadas: { "USD": { from, to, fetchedAt } } no app.
    key: "fxCoverage",
    table: "fx_coverage",
    columns: ["quote", "from_date", "to_date", "fetched_at"],
    recordKey: "quote",
    upsertOn: "quote",
    fromDb: ({ fromDate, toDate, ...r }) => ({ ...r, from: fromDate, to: toDate }),
    toDb: ({ from, to, ...r }) => ({ ...r, fromDate: from, toDate: to }),
    tracking: true,
  },
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
  // Campos personalizados do quadro; o valor de cada card fica em custom_field_values.
  { key: "customFields", table: "custom_fields", columns: ["id", "board_id", "name", "type", "options", "show_on_front", "rank", "created_at"], updatedAt: true },
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
  {
    key: "cardLinks",
    table: "card_links",
    columns: ["id", "card_id", "dashboard_id", "target_type", "campaign_id", "ad_set_id", "ad_id", "product_id", "created_by", "created_at"],
  },
  { key: "boardStars", table: "board_stars", columns: ["id", "user_id", "board_id", "created_at"] },
  { key: "boardVisits", table: "board_visits", columns: ["id", "user_id", "board_id", "visited_at"] },
  { key: "cardMembers", table: "card_members", columns: ["id", "card_id", "user_id", "created_at"] },
  { key: "cardLabels", table: "card_labels", columns: ["id", "card_id", "label_id"] },
  // Anexos (etapa 5): o arquivo fica no bucket "attachments"; aqui, o nome e o caminho.
  { key: "customFieldValues", table: "custom_field_values", columns: ["id", "card_id", "field_id", "value", "created_at"], updatedAt: true },
  { key: "attachments", table: "attachments", columns: ["id", "card_id", "uploader_id", "kind", "name", "url", "storage_key", "bytes", "mime_type", "created_at"] },
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

/**
 * Tabelas que nada no banco referencia (o teste confere contra as migrações).
 * Apagar uma linha delas não leva nada junto, então as remoções nelas gravam
 * antes das linhas novas: trocar uma linha numa ação só (apagar e criar de novo
 * com a mesma chave única, como o custo do produto na mesma data ou os itens de
 * um pedido atualizado) não esbarra na antiga.
 */
export const LEAF_TABLES: ReadonlySet<string> = new Set([
  "dashboard_ad_accounts",
  "ad_insights_daily",
  "keyword_insights_daily",
  "dashboard_stores",
  "product_costs",
  "order_items",
  "order_events",
  "cost_settings",
  "additional_fees",
  "expenses",
  "integration_tests",
  "dashboard_panels",
  "board_members",
  "card_links",
  "board_stars",
  "board_visits",
  "card_members",
  "card_labels",
  "custom_field_values",
  "attachments",
  "checklist_items",
  "comments",
  "invites",
  "notifications",
]);

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

