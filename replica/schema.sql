-- INtellect: esquema inicial (Postgres 17)
-- Especificação do banco. No build, este arquivo vira a primeira migração do
-- Prisma (prisma/migrations/0001_init/migration.sql) e o schema.prisma é
-- gerado a partir dele com `prisma db pull`.
--
-- Regras:
-- - Toda tabela tem id uuid, created_at e, quando muda, updated_at.
-- - Horários são timestamptz em UTC. Exceção documentada: o `date` dos
--   insights de anúncio, que é o dia no fuso da conta de anúncio.
-- - Dinheiro em centavos (bigint) com coluna de moeda. Percentuais em pontos
--   base (650 = 6,50%).
-- - Acesso: checagem na camada de dados (uma função de autorização por
--   consulta), não RLS. Ver architecture.md.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent não é immutable; este invólucro permite usá-lo em índices. O nome
-- vai com o schema porque o Postgres 17+ cria índices com search_path restrito.
create or replace function f_unaccent(text) returns text
  language sql immutable parallel safe strict
  as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- ============================================================
-- Autenticação (formato do Better Auth, colunas em snake_case)
-- ============================================================

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  email_verified boolean not null default false,
  image text,
  username text,
  bio text not null default '',
  timezone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  theme text not null default 'system' check (theme in ('light','dark','system')),
  preferences jsonb not null default '{}',   -- e-mail de notificação, daltonismo, reduzir animações
  two_factor_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));
create unique index users_username_key on users (lower(username)) where username is not null;

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on sessions (user_id);
create index on sessions (expires_at);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id text not null,
  provider_id text not null,                 -- 'credential' (senha) ou 'google'
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,                             -- hash, só para provider_id = 'credential'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, account_id)
);
create index on accounts (user_id);

create table verifications (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on verifications (identifier);

create table two_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  secret text not null,                      -- o Better Auth guarda cifrado
  backup_codes text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Workspace e kanban
-- ============================================================

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  description text not null default '',
  logo_url text,
  allowed_email_domain text,                 -- could: só aceita convites deste domínio
  settings jsonb not null default '{}',      -- quem cria e exclui quadros
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'normal' check (role in ('admin','normal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index on workspace_members (user_id);

create table boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 512),
  description text not null default '',
  background jsonb not null default '{"type":"color","value":"purple"}',  -- roxo da marca
  visibility text not null default 'workspace' check (visibility in ('private','workspace')),
  -- prefs: comment_permission, add_members, workspace_can_edit,
  -- show_complete_on_front, card_covers, metric_badge_period
  prefs jsonb not null default '{}',
  next_card_number integer not null default 1,
  closed_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on boards (workspace_id) where closed_at is null;
create index on boards (created_by);
create index boards_name_trgm on boards using gin (f_unaccent(lower(name)) gin_trgm_ops);

create table invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  board_id uuid references boards(id) on delete cascade,   -- nulo = convite para o workspace
  email text,                                              -- nulo = link aberto
  role text not null,
  token_hash text not null unique,                         -- guardamos só o hash do token
  expires_at timestamptz not null,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0,
  created_by uuid references users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invite_role check (
    (board_id is null and role in ('admin','normal')) or
    (board_id is not null and role in ('admin','normal','observer'))
  )
);
create index on invites (workspace_id);
create index on invites (board_id);
create index on invites (created_by);

create table board_members (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'normal' check (role in ('admin','normal','observer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, user_id)
);
create index on board_members (user_id);

create table board_stars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, board_id)
);
create index on board_stars (board_id);

create table board_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  visited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, board_id)
);
create index on board_visits (user_id, visited_at desc);
create index on board_visits (board_id);

-- Ordem: `rank` é uma chave fracionária em texto (pacote fractional-indexing),
-- comparada byte a byte (collate "C"). Não precisa rebalancear. Empate entre
-- duas inserções simultâneas é desfeito pelo id.
create table lists (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 512),
  rank text collate "C" not null,
  color text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on lists (board_id, rank) where archived_at is null;

create table cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  list_id uuid not null references lists(id) on delete cascade,
  number integer not null,                   -- número curto por quadro (#12)
  name text not null check (char_length(name) between 1 and 16384),
  description jsonb,                         -- documento do editor (Tiptap)
  description_text text not null default '' check (char_length(description_text) <= 16384),
  rank text collate "C" not null,
  start_at timestamptz,
  due_at timestamptz,
  due_complete boolean not null default false,
  due_reminder_minutes integer check (due_reminder_minutes in (0,5,10,15,60,120,1440,2880)),
  due_recurrence text check (due_recurrence in ('daily','weekly','monthly')),
  cover jsonb,
  version integer not null default 1,        -- concorrência otimista na edição de texto
  created_by uuid references users(id) on delete set null,
  last_activity_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_dates check (start_at is null or due_at is null or start_at <= due_at),
  unique (board_id, number)
);
create index on cards (list_id, rank) where archived_at is null;
create index on cards (board_id) where archived_at is not null;
create index on cards (due_at) where due_at is not null and due_complete = false and archived_at is null;
create index on cards (created_by);
create index cards_name_trgm on cards using gin (f_unaccent(lower(name)) gin_trgm_ops);
create index cards_desc_trgm on cards using gin (f_unaccent(lower(description_text)) gin_trgm_ops);

create table card_members (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (card_id, user_id)
);
create index on card_members (user_id);

create table labels (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 100),
  color text check (color ~ '^(green|yellow|orange|red|purple|blue|sky|lime|pink|black)(_light|_dark)?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on labels (board_id);

-- A etiqueta precisa ser do mesmo quadro do card: checado na camada de dados.
create table card_labels (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  label_id uuid not null references labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (card_id, label_id)
);
create index on card_labels (label_id);

create table checklists (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 512),
  rank text collate "C" not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on checklists (card_id, rank);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklists(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 16384),
  rank text collate "C" not null,
  completed_at timestamptz,
  due_at timestamptz,
  assignee_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on checklist_items (checklist_id, rank);
create index on checklist_items (assignee_id);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  uploader_id uuid references users(id) on delete set null,
  kind text not null check (kind in ('file','link')),
  name text not null check (char_length(name) between 1 and 256),
  url text,                                  -- link
  storage_key text,                          -- arquivo (disco local ou R2)
  bytes bigint check (bytes between 1 and 26214400),   -- até 25 MB
  mime_type text,
  created_at timestamptz not null default now(),
  constraint attachment_kind check (
    (kind = 'file' and storage_key is not null and bytes is not null) or
    (kind = 'link' and url is not null)
  )
);
create index on attachments (card_id);
create index on attachments (uploader_id);

create table comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  author_id uuid references users(id) on delete set null,   -- autor removido: "usuário removido"
  body jsonb not null,
  body_text text not null check (char_length(body_text) between 1 and 16384),
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index on comments (card_id, created_at);
create index on comments (author_id);

create table custom_fields (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  type text not null check (type in ('text','number','date','checkbox','list')),
  options jsonb not null default '[]',      -- opções do tipo 'list'
  show_on_front boolean not null default false,
  rank text collate "C" not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on custom_fields (board_id, rank);

create table custom_field_values (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  field_id uuid not null references custom_fields(id) on delete cascade,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, field_id)
);
create index on custom_field_values (field_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('mention','assigned','due_soon','comment','added_to_board','automation_error','integration_error')),
  board_id uuid references boards(id) on delete cascade,
  card_id uuid references cards(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);
create index on notifications (user_id) where read_at is null;
create index on notifications (board_id);
create index on notifications (card_id);
create index on notifications (actor_id);

-- ============================================================
-- Tracking: dashboards, anúncios, loja, pedidos, custos
-- ============================================================

create table dashboards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  timezone text not null default 'America/Sao_Paulo',
  currency char(3) not null default 'BRL',
  -- "tipo de faturamento" da UTMify, interpretado como a base das métricas
  revenue_basis text not null default 'net' check (revenue_basis in ('net','gross')),
  include_interest boolean not null default false,          -- "contabilizar juros"
  revenue_goal_cents bigint check (revenue_goal_cents is null or revenue_goal_cents > 0),
  ad_platforms text[] not null default '{}' check (ad_platforms <@ array['meta','google']::text[]),
  onboarding_completed_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on dashboards (workspace_id);
create index on dashboards (created_by);

-- Tokens cifrados com AES-256-GCM (chave em ENCRYPTION_KEY, fora do banco).
create table ad_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null check (provider in ('meta','google')),
  external_user_id text not null,
  external_user_name text,
  access_token_enc bytea not null,
  refresh_token_enc bytea,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','expired','revoked','error')),
  last_error text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_user_id)
);
create index on ad_connections (created_by);

create table ad_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  connection_id uuid references ad_connections(id) on delete set null,   -- desconectar não apaga o histórico
  provider text not null check (provider in ('meta','google')),
  external_id text not null,                 -- act_123 no Meta, customer id no Google
  name text not null,
  currency char(3) not null,
  timezone text not null,
  status text not null default 'active' check (status in ('active','disabled','unsettled','closed','unknown')),
  sync_enabled boolean not null default false,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_id)
);
create index on ad_accounts (connection_id);

create table dashboard_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (dashboard_id, ad_account_id)
);
create index on dashboard_ad_accounts (ad_account_id);

-- status normalizado para os dois provedores; o valor original fica em status_raw
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  external_id text not null,
  name text not null,
  status text not null check (status in ('active','paused','deleted','archived','in_review','rejected','with_issues','unknown')),
  status_raw text,
  objective text,
  channel_type text,                         -- Google: SEARCH, PERFORMANCE_MAX...
  daily_budget_cents bigint,
  lifetime_budget_cents bigint,
  bid_strategy text,
  target_cpa_cents bigint,                   -- Google: CPA desejado
  remote_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_account_id, external_id)
);
create index campaigns_name_trgm on campaigns using gin (f_unaccent(lower(name)) gin_trgm_ops);

-- No Google, ad_sets guarda os grupos de anúncios.
create table ad_sets (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  external_id text not null,
  name text not null,
  status text not null check (status in ('active','paused','deleted','archived','in_review','rejected','with_issues','unknown')),
  status_raw text,
  daily_budget_cents bigint,
  bid_amount_cents bigint,                   -- bid cap
  spend_min_cents bigint,
  spend_max_cents bigint,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_account_id, external_id)
);
create index on ad_sets (campaign_id);

create table ads (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  ad_set_id uuid not null references ad_sets(id) on delete cascade,
  external_id text not null,                 -- Google: {creative}
  name text not null,
  status text not null check (status in ('active','paused','deleted','archived','in_review','rejected','with_issues','unknown')),
  status_raw text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_account_id, external_id)
);
create index on ads (campaign_id);
create index on ads (ad_set_id);

-- Só Google. O id do critério é único dentro do grupo de anúncios.
create table keywords (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  ad_set_id uuid not null references ad_sets(id) on delete cascade,
  external_id text not null,                 -- criterion id ({targetid} = kwd-<id>)
  text text not null,
  match_type text not null check (match_type in ('exact','phrase','broad')),
  status text not null check (status in ('active','paused','deleted','archived','in_review','rejected','with_issues','unknown')),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_set_id, external_id)
);
create index on keywords (ad_account_id);
create index on keywords (campaign_id);

-- Um registro por objeto e por dia, no menor nível que cobre todo o gasto:
-- anúncio no Meta e no Google Search/Display; campanha no Performance Max
-- (sem conjunto e sem anúncio). Somar estas linhas nunca conta gasto duas vezes.
create table ad_insights_daily (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  ad_set_id uuid references ad_sets(id) on delete cascade,
  ad_id uuid references ads(id) on delete cascade,
  date date not null,                        -- dia no fuso da conta de anúncio
  currency char(3) not null,
  spend_cents bigint not null default 0 check (spend_cents >= 0),
  impressions bigint not null default 0,
  clicks bigint not null default 0,          -- cliques no link
  landing_page_views bigint not null default 0,
  add_to_carts bigint not null default 0,
  initiate_checkouts bigint not null default 0,
  leads bigint not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insight_level check (ad_id is null or ad_set_id is not null),
  unique nulls not distinct (campaign_id, ad_set_id, ad_id, date)
);
create index on ad_insights_daily (ad_account_id, date);
create index on ad_insights_daily (ad_set_id, date);
create index on ad_insights_daily (ad_id, date);

-- Gasto por palavra-chave é um recorte do gasto do grupo: nunca entra nos totais.
create table keyword_insights_daily (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references keywords(id) on delete cascade,
  date date not null,
  currency char(3) not null,
  spend_cents bigint not null default 0 check (spend_cents >= 0),
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (keyword_id, date)
);

-- Para o relatório por hora. Guardado por 35 dias.
create table ad_account_insights_hourly (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  hour_start timestamptz not null,
  currency char(3) not null,
  spend_cents bigint not null default 0 check (spend_cents >= 0),
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  initiate_checkouts bigint not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_account_id, hour_start)
);
create index on ad_account_insights_hourly (hour_start);

create table stores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  platform text not null default 'shopify' check (platform in ('shopify')),
  shop_domain text not null check (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  name text,
  currency char(3),
  timezone text,
  access_token_enc bytea,
  refresh_token_enc bytea,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','uninstalled','error')),
  webhooks_ok boolean not null default false,
  last_event_at timestamptz,
  installed_at timestamptz,
  uninstalled_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, shop_domain)
);
create index on stores (workspace_id);
create index on stores (created_by);

create table dashboard_stores (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (dashboard_id, store_id)
);
create index on dashboard_stores (store_id);

-- Uma linha por entrega (X-Shopify-Webhook-Id). O payload é apagado depois de
-- processado, porque traz dados pessoais do comprador.
create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  source text not null default 'shopify' check (source in ('shopify')),
  delivery_id text not null,
  topic text not null,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  unique (source, delivery_id)
);
create index on webhook_deliveries (store_id, received_at);
create index on webhook_deliveries (received_at) where processed_at is null;

create table products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  external_id text not null,                 -- gid://shopify/Product/...
  name text not null,
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, external_id)
);
create index on products (workspace_id);

-- Custo vale a partir de valid_from; o custo de uma venda é o vigente na data dela.
create table product_costs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  cost_cents bigint not null check (cost_cents >= 0),
  currency char(3) not null,
  valid_from date not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (product_id, valid_from)
);
create index on product_costs (created_by);

-- Sem nome, e-mail, telefone, documento ou IP do comprador (minimização: LGPD
-- e regras de dados protegidos da Shopify). O pedido mostra o número e um link
-- para o admin da Shopify.
create table orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  external_id text not null,                 -- gid://shopify/Order/...
  name text not null,                        -- #1001
  status text not null check (status in ('waiting_payment','paid','refused','refunded','chargedback','cancelled')),
  payment_method text not null default 'other' check (payment_method in ('credit_card','pix','boleto','paypal','other')),
  currency char(3) not null,
  total_cents bigint not null check (total_cents >= 0),
  subtotal_cents bigint not null default 0,
  shipping_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  gateway_fee_cents bigint,                  -- quando a Shopify informa (Shopify Payments)
  interest_cents bigint not null default 0,  -- juros de parcelamento, se houver
  is_test boolean not null default false,
  external_customer_id text,
  customer_order_index integer,
  placed_at timestamptz not null,
  paid_at timestamptz,
  refunded_at timestamptz,
  cancelled_at timestamptz,
  source_updated_at timestamptz not null,    -- updated_at da Shopify: evento mais antigo não sobrescreve
  -- origem
  first_visit jsonb,
  last_visit jsonb,
  landing_page text,
  days_to_conversion integer,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  src text,
  sck text,
  attribution_keys jsonb not null default '{}',   -- {platform, campaign_id, adset_id, ad_id, keyword_id, gclid} externos
  attribution_status text not null default 'pending' check (attribution_status in ('pending','tracked','untracked','other_source')),
  attributed_platform text check (attributed_platform in ('meta','google')),
  campaign_id uuid references campaigns(id) on delete set null,
  ad_set_id uuid references ad_sets(id) on delete set null,
  ad_id uuid references ads(id) on delete set null,
  keyword_id uuid references keywords(id) on delete set null,
  journey_attempts smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, external_id)
);
create index on orders (workspace_id, placed_at);
create index on orders (store_id, placed_at);
create index on orders (campaign_id, placed_at);
create index on orders (ad_set_id, placed_at);
create index on orders (ad_id, placed_at);
create index on orders (keyword_id);
create index on orders (placed_at) where attribution_status = 'pending';
create index on orders (utm_campaign);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  external_line_id text not null,
  name text not null,
  variant_name text,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, external_line_id)
);
create index on order_items (product_id);

create table order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null check (status in ('waiting_payment','paid','refused','refunded','chargedback','cancelled')),
  occurred_at timestamptz not null,
  topic text not null,
  webhook_delivery_id uuid references webhook_deliveries(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on order_events (order_id, occurred_at);
create index on order_events (webhook_delivery_id);

create table cost_settings (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  valid_from date not null,
  sales_tax_bp integer not null default 0 check (sales_tax_bp between 0 and 10000),
  meta_ads_tax_bp integer not null default 0 check (meta_ads_tax_bp between 0 and 10000),
  extra_taxes jsonb not null default '[]',   -- [{name, bp}]
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (dashboard_id, valid_from)
);
create index on cost_settings (created_by);

create table additional_fees (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  kind text not null check (kind in ('fixed','percent')),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),   -- por pedido
  bp integer check (bp is null or bp between 0 and 10000),
  scope text not null default 'all' check (scope in ('all','product','payment_method')),
  product_id uuid references products(id) on delete cascade,
  payment_method text check (payment_method in ('credit_card','pix','boleto','paypal','other')),
  valid_from date not null default current_date,
  valid_until date,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fee_value check (
    (kind = 'fixed' and amount_cents is not null and bp is null) or
    (kind = 'percent' and bp is not null and amount_cents is null)
  ),
  constraint fee_scope check (
    (scope = 'all' and product_id is null and payment_method is null) or
    (scope = 'product' and product_id is not null and payment_method is null) or
    (scope = 'payment_method' and payment_method is not null and product_id is null)
  ),
  constraint fee_period check (valid_until is null or valid_until >= valid_from)
);
create index on additional_fees (dashboard_id);
create index on additional_fees (product_id);
create index on additional_fees (created_by);

-- Recorrente: o mesmo valor no mesmo dia de cada mês, de `date` até `end_date`.
create table expenses (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  kind text not null check (kind in ('once','recurring')),
  category text not null check (category in ('traffic','tools','staff','accounting','other')),
  description text not null check (char_length(description) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null,
  date date not null,
  end_date date,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_end check (end_date is null or (kind = 'recurring' and end_date >= date))
);
create index on expenses (dashboard_id, date);
create index on expenses (created_by);

create table integration_tests (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  traffic_source text not null check (traffic_source in ('meta','google','organic')),
  campaign_url text not null,
  test_code text not null unique,            -- vai na URL como itl_test=<código>
  status text not null default 'waiting' check (status in ('waiting','received','attributed','failed')),
  order_id uuid references orders(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on integration_tests (dashboard_id, created_at desc);
create index on integration_tests (order_id);
create index on integration_tests (created_by);

-- Cotação PTAX do Banco Central (venda), para converter gasto em USD.
create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  base char(3) not null,
  quote char(3) not null,
  rate numeric(18,8) not null check (rate > 0),
  source text not null default 'bcb_ptax',
  created_at timestamptz not null default now(),
  unique (date, base, quote)
);

-- ============================================================
-- Automação
-- ============================================================

-- trigger e actions são validados por esquemas Zod no código (até 20 ações).
-- type 'metric': checagem agendada de métricas do dashboard (a cola).
create table automations (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  type text not null check (type in ('rule','scheduled','due_date','card_button','board_button','metric')),
  name text not null check (char_length(name) between 1 and 200),
  trigger jsonb not null,
  actions jsonb not null check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) between 1 and 20),
  enabled boolean not null default true,
  timezone text not null default 'America/Sao_Paulo',
  next_run_at timestamptz,                   -- agendadas e de métrica
  dashboard_id uuid references dashboards(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  failure_count integer not null default 0,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metric_needs_dashboard check (type <> 'metric' or dashboard_id is not null)
);
create index on automations (board_id, type);
create index on automations (next_run_at) where enabled and next_run_at is not null;
create index on automations (dashboard_id);
create index on automations (created_by);

-- O log de atividade também é o barramento de eventos da automação:
-- automation_checked_at nulo = ainda não avaliado pelas regras.
create table activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  board_id uuid references boards(id) on delete cascade,
  card_id uuid references cards(id) on delete set null,     -- card excluído: a atividade fica, com o nome em data
  actor_id uuid references users(id) on delete set null,
  actor_kind text not null default 'user' check (actor_kind in ('user','automation','system')),
  automation_run_id uuid,                    -- FK adicionada abaixo
  type text not null,
  data jsonb not null default '{}',
  automation_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on activities (board_id, created_at desc);
create index on activities (card_id, created_at desc);
create index on activities (actor_id);
create index on activities (workspace_id, created_at desc);
create index on activities (created_at) where automation_checked_at is null;

create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  trigger_activity_id uuid references activities(id) on delete set null,
  card_id uuid references cards(id) on delete set null,
  status text not null default 'running' check (status in ('running','success','error','skipped')),
  dedupe_key text,                           -- clique de botão, janela da métrica: roda uma vez
  depth smallint not null default 0 check (depth between 0 and 5),   -- proteção contra loop
  message text,
  operations integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (automation_id, dedupe_key)
);
create index on automation_runs (automation_id, started_at desc);
create index on automation_runs (trigger_activity_id);
create index on automation_runs (card_id);

alter table activities
  add constraint activities_automation_run_fk
  foreign key (automation_run_id) references automation_runs(id) on delete set null;
create index on activities (automation_run_id);

-- ============================================================
-- A cola: card ligado a um alvo de métrica
-- ============================================================

create table card_links (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  target_type text not null check (target_type in ('campaign','ad_set','ad','product','dashboard')),
  campaign_id uuid references campaigns(id) on delete cascade,
  ad_set_id uuid references ad_sets(id) on delete cascade,
  ad_id uuid references ads(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint link_target check (
    (target_type = 'campaign'  and campaign_id is not null and ad_set_id is null and ad_id is null and product_id is null) or
    (target_type = 'ad_set'    and ad_set_id is not null and campaign_id is null and ad_id is null and product_id is null) or
    (target_type = 'ad'        and ad_id is not null and campaign_id is null and ad_set_id is null and product_id is null) or
    (target_type = 'product'   and product_id is not null and campaign_id is null and ad_set_id is null and ad_id is null) or
    (target_type = 'dashboard' and campaign_id is null and ad_set_id is null and ad_id is null and product_id is null)
  ),
  unique nulls not distinct (card_id, dashboard_id, target_type, campaign_id, ad_set_id, ad_id, product_id)
);
create index on card_links (dashboard_id);
create index on card_links (campaign_id);
create index on card_links (ad_set_id);
create index on card_links (ad_id);
create index on card_links (product_id);
create index on card_links (created_by);

-- ============================================================
-- updated_at automático em toda tabela que tem a coluna
-- ============================================================

create or replace function set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;
