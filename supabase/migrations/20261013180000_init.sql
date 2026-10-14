-- INtellect: esquema inicial no Supabase (Postgres 17)
--
-- Cria as 48 tabelas VAZIAS (sem dados de exemplo), liga o RLS em todas, cria
-- as regras de acesso por papel e o bucket privado de imagens ("uploads").
-- Base: replica/schema.sql, com estas mudanças:
--   - Login pelo Supabase Auth: as 5 tabelas de login do plano saem; entra
--     public.profiles (1 linha por pessoa de auth.users, criada sozinha).
--   - RLS em tudo: a chave publishable vai para o navegador, então cada linha
--     só aparece para quem pode vê-la (papéis em architecture.md, "Quem pode o quê").
--   - Imagens (foto, plano de fundo, fundo de quadro) no Storage, bucket "uploads".
--   - Taxa adicional fixa ganha moeda; cotações vêm do Banco Central Europeu.
--
-- Regras de sempre:
--   - Toda tabela tem id uuid, created_at e, quando muda, updated_at.
--   - Horários em timestamptz (UTC). Exceção: o `date` dos insights de anúncio,
--     que é o dia no fuso da conta de anúncio.
--   - Dinheiro em centavos (bigint) com coluna de moeda. Percentuais em pontos
--     base (650 = 6,50%).
--   - Webhooks, sincronização de anúncios e o motor de automação rodam no
--     servidor com a chave secreta (service_role), que passa por cima do RLS.
--     O navegador nunca recebe essa chave.

-- ============================================================
-- Extensões (no schema "extensions", como o Supabase recomenda)
-- ============================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent não é immutable; este invólucro permite usá-lo em índices.
create or replace function public.f_unaccent(text) returns text
  language sql immutable parallel safe strict
  set search_path = ''
  as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- ============================================================
-- Pessoas (o login em si fica em auth.users, do Supabase Auth)
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  username text check (username is null or username ~ '^[a-z0-9._]{2,40}$'),
  bio text not null default '' check (char_length(bio) <= 500),
  timezone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  theme text not null default 'system' check (theme in ('light','dark','system')),
  avatar_color text not null default 'purple',
  -- Foto de perfil no Storage: uploads/avatars/<id da pessoa>/<arquivo>
  avatar_path text,
  preferences jsonb not null default '{"colorblind":false,"reduceMotion":false,"singleKeyShortcuts":true,"emailNotifications":"periodic"}',
  -- Plano de fundo (wallpaper: {path, dim 0-90, blur 0-20} ou null), frases ao lado do logo e tela inicial
  appearance jsonb not null default '{"wallpaper":null,"showTaglines":true,"homePage":"inicio"}',
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));
create unique index profiles_username_key on public.profiles (lower(username)) where username is not null;

-- Toda conta nova do Supabase Auth ganha o perfil na hora.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, coalesce(new.email, ''), coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(coalesce(new.email, ''), '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- E-mail trocado no Auth: o perfil acompanha.
create or replace function public.handle_user_email_change() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ============================================================
-- Workspace e kanban
-- ============================================================

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  description text not null default '' check (char_length(description) <= 1000),
  logo_url text,
  allowed_email_domain text,
  settings jsonb not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'normal' check (role in ('admin','normal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 512),
  description text not null default '' check (char_length(description) <= 16384),
  -- {"type":"color","value":"<uma das 25 cores>"} ou {"type":"image","path":"boards/<id do quadro>/<arquivo>"}
  background jsonb not null default '{"type":"color","value":"purple"}',
  visibility text not null default 'workspace' check (visibility in ('private','workspace')),
  -- prefs (chaves do app): comments, workspaceCanEdit, showCompleteOnFront, cardCovers, labelsExpanded
  prefs jsonb not null default '{"comments":"members","workspaceCanEdit":true,"showCompleteOnFront":true,"cardCovers":true,"labelsExpanded":false}',
  next_card_number integer not null default 1,
  closed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.boards (workspace_id) where closed_at is null;
create index on public.boards (created_by);
create index boards_name_trgm on public.boards using gin (public.f_unaccent(lower(name)) extensions.gin_trgm_ops);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  board_id uuid references public.boards(id) on delete cascade,   -- nulo = convite para o workspace
  email text,                                                     -- nulo = link aberto
  role text not null,
  token_hash text not null unique,                                -- só o hash do token
  expires_at timestamptz not null,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invite_role check (
    (board_id is null and role in ('admin','normal')) or
    (board_id is not null and role in ('admin','normal','observer'))
  )
);
create index on public.invites (workspace_id);
create index on public.invites (board_id);
create index on public.invites (created_by);

create table public.board_members (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'normal' check (role in ('admin','normal','observer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, user_id)
);
create index on public.board_members (user_id);

create table public.board_stars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, board_id)
);
create index on public.board_stars (board_id);

create table public.board_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  visited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, board_id)
);
create index on public.board_visits (user_id, visited_at desc);
create index on public.board_visits (board_id);

-- Ordem: `rank` é uma chave fracionária em texto (pacote fractional-indexing),
-- comparada byte a byte (collate "C").
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 512),
  rank text collate "C" not null,
  color text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.lists (board_id, rank) where archived_at is null;

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
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
  created_by uuid references public.profiles(id) on delete set null,
  last_activity_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_dates check (start_at is null or due_at is null or start_at <= due_at),
  unique (board_id, number)
);
create index on public.cards (list_id, rank) where archived_at is null;
create index on public.cards (board_id) where archived_at is not null;
create index on public.cards (due_at) where due_at is not null and due_complete = false and archived_at is null;
create index on public.cards (created_by);
create index cards_name_trgm on public.cards using gin (public.f_unaccent(lower(name)) extensions.gin_trgm_ops);
create index cards_desc_trgm on public.cards using gin (public.f_unaccent(lower(description_text)) extensions.gin_trgm_ops);

create table public.card_members (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (card_id, user_id)
);
create index on public.card_members (user_id);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 100),
  color text check (color ~ '^(green|yellow|orange|red|purple|blue|sky|lime|pink|black)(_light|_dark)?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.labels (board_id);

create table public.card_labels (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (card_id, label_id)
);
create index on public.card_labels (label_id);

create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 512),
  rank text collate "C" not null,
  hide_checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.checklists (card_id, rank);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 16384),
  rank text collate "C" not null,
  completed_at timestamptz,
  due_at timestamptz,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.checklist_items (checklist_id, rank);
create index on public.checklist_items (assignee_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  uploader_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('file','link')),
  name text not null check (char_length(name) between 1 and 256),
  url text,                                  -- link
  storage_key text,                          -- arquivo no Storage
  bytes bigint check (bytes between 1 and 26214400),   -- até 25 MB
  mime_type text,
  created_at timestamptz not null default now(),
  constraint attachment_kind check (
    (kind = 'file' and storage_key is not null and bytes is not null) or
    (kind = 'link' and url is not null)
  )
);
create index on public.attachments (card_id);
create index on public.attachments (uploader_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,   -- autor removido: "usuário removido"
  body jsonb not null,
  body_text text not null check (char_length(body_text) between 1 and 16384),
  mentions uuid[] not null default '{}',
  automation_name text,                      -- comentário feito por automação
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.comments (card_id, created_at);
create index on public.comments (author_id);

create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  type text not null check (type in ('text','number','date','checkbox','list')),
  options jsonb not null default '[]',
  show_on_front boolean not null default false,
  rank text collate "C" not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.custom_fields (board_id, rank);

create table public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  field_id uuid not null references public.custom_fields(id) on delete cascade,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, field_id)
);
create index on public.custom_field_values (field_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('mention','assigned','due_soon','comment','added_to_board','automation_error','integration_error')),
  board_id uuid references public.boards(id) on delete cascade,
  card_id uuid references public.cards(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
create index on public.notifications (user_id) where read_at is null;
create index on public.notifications (board_id);
create index on public.notifications (card_id);
create index on public.notifications (actor_id);

-- ============================================================
-- Tracking: dashboards, anúncios, loja, pedidos, custos
-- ============================================================

create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  timezone text not null default 'America/Sao_Paulo',
  -- Moeda em que o dashboard mostra os valores; o resto é convertido pela cotação do dia.
  currency char(3) not null default 'BRL' check (currency in ('BRL','EUR','GBP','CHF')),
  revenue_basis text not null default 'net' check (revenue_basis in ('net','gross')),
  include_interest boolean not null default false,
  revenue_goal_cents bigint check (revenue_goal_cents is null or revenue_goal_cents > 0),
  ad_platforms text[] not null default '{}' check (ad_platforms <@ array['meta','google']::text[]),
  onboarding_completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.dashboards (workspace_id);
create index on public.dashboards (created_by);

-- Tokens cifrados com AES-256-GCM (chave em ENCRYPTION_KEY, fora do banco).
-- O navegador não lê as colunas de token (ver "Permissões por coluna", no fim).
create table public.ad_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('meta','google')),
  external_user_id text not null,
  external_user_name text,
  access_token_enc bytea not null,
  refresh_token_enc bytea,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','expired','revoked','error')),
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_user_id)
);
create index on public.ad_connections (created_by);

create table public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid references public.ad_connections(id) on delete set null,
  provider text not null check (provider in ('meta','google')),
  external_id text not null,
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
create index on public.ad_accounts (connection_id);

create table public.dashboard_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (dashboard_id, ad_account_id)
);
create index on public.dashboard_ad_accounts (ad_account_id);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
  external_id text not null,
  name text not null,
  status text not null check (status in ('active','paused','deleted','archived','in_review','rejected','with_issues','unknown')),
  status_raw text,
  objective text,
  channel_type text,
  daily_budget_cents bigint,                 -- na moeda da conta de anúncio
  lifetime_budget_cents bigint,
  bid_strategy text,
  target_cpa_cents bigint,
  remote_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_account_id, external_id)
);
create index campaigns_name_trgm on public.campaigns using gin (public.f_unaccent(lower(name)) extensions.gin_trgm_ops);

-- No Google, ad_sets guarda os grupos de anúncios.
create table public.ad_sets (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  external_id text not null,
  name text not null,
  status text not null check (status in ('active','paused','deleted','archived','in_review','rejected','with_issues','unknown')),
  status_raw text,
  daily_budget_cents bigint,
  bid_amount_cents bigint,
  spend_min_cents bigint,
  spend_max_cents bigint,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_account_id, external_id)
);
create index on public.ad_sets (campaign_id);

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  ad_set_id uuid not null references public.ad_sets(id) on delete cascade,
  external_id text not null,
  name text not null,
  status text not null check (status in ('active','paused','deleted','archived','in_review','rejected','with_issues','unknown')),
  status_raw text,
  -- Formato do criativo: hook e hold só existem para vídeo.
  creative_format text check (creative_format in ('video','image','carousel')),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_account_id, external_id)
);
create index on public.ads (campaign_id);
create index on public.ads (ad_set_id);

-- Só Google. O id do critério é único dentro do grupo de anúncios.
create table public.keywords (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  ad_set_id uuid not null references public.ad_sets(id) on delete cascade,
  external_id text not null,
  text text not null,
  match_type text not null check (match_type in ('exact','phrase','broad')),
  status text not null check (status in ('active','paused','deleted','archived','in_review','rejected','with_issues','unknown')),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_set_id, external_id)
);
create index on public.keywords (ad_account_id);
create index on public.keywords (campaign_id);

-- Um registro por objeto e por dia, no menor nível que cobre todo o gasto.
create table public.ad_insights_daily (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  ad_set_id uuid references public.ad_sets(id) on delete cascade,
  ad_id uuid references public.ads(id) on delete cascade,
  date date not null,
  currency char(3) not null,
  spend_cents bigint not null default 0 check (spend_cents >= 0),
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  landing_page_views bigint not null default 0,
  add_to_carts bigint not null default 0,
  initiate_checkouts bigint not null default 0,
  leads bigint not null default 0,
  -- Vídeo (Meta): visualizações de 3 s (base do hook) e até 75% do vídeo (hold de 75%).
  -- O alcance não fica aqui: ele não se soma dia a dia e vem pronto da API para o período.
  video_views_3s bigint not null default 0 check (video_views_3s >= 0),
  video_p75_views bigint not null default 0 check (video_p75_views >= 0),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insight_level check (ad_id is null or ad_set_id is not null),
  unique nulls not distinct (campaign_id, ad_set_id, ad_id, date)
);
create index on public.ad_insights_daily (ad_account_id, date);
create index on public.ad_insights_daily (ad_set_id, date);
create index on public.ad_insights_daily (ad_id, date);

-- Gasto por palavra-chave é um recorte do gasto do grupo: nunca entra nos totais.
create table public.keyword_insights_daily (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.keywords(id) on delete cascade,
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
create table public.ad_account_insights_hourly (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
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
create index on public.ad_account_insights_hourly (hour_start);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
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
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, shop_domain)
);
create index on public.stores (workspace_id);
create index on public.stores (created_by);

create table public.dashboard_stores (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (dashboard_id, store_id)
);
create index on public.dashboard_stores (store_id);

-- Uma linha por entrega (X-Shopify-Webhook-Id). O payload traz dados pessoais
-- do comprador e é apagado depois de processado; o navegador não lê esta tabela.
create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
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
create index on public.webhook_deliveries (store_id, received_at);
create index on public.webhook_deliveries (received_at) where processed_at is null;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text not null,
  name text not null,
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, external_id)
);
create index on public.products (workspace_id);

-- Custo vale a partir de valid_from; o custo de uma venda é o vigente na data dela.
create table public.product_costs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  cost_cents bigint not null check (cost_cents >= 0),
  currency char(3) not null,
  valid_from date not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (product_id, valid_from)
);
create index on public.product_costs (created_by);

-- Sem nome, e-mail, telefone, documento ou IP do comprador (LGPD e regras de
-- dados protegidos da Shopify).
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text not null,
  name text not null,
  status text not null check (status in ('waiting_payment','paid','refused','refunded','chargedback','cancelled')),
  payment_method text not null default 'other' check (payment_method in ('credit_card','pix','boleto','paypal','other')),
  currency char(3) not null,
  total_cents bigint not null check (total_cents >= 0),
  subtotal_cents bigint not null default 0,
  shipping_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  gateway_fee_cents bigint,
  interest_cents bigint not null default 0,
  is_test boolean not null default false,
  external_customer_id text,
  customer_order_index integer,
  placed_at timestamptz not null,
  paid_at timestamptz,
  refunded_at timestamptz,
  cancelled_at timestamptz,
  source_updated_at timestamptz not null,
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
  attribution_keys jsonb not null default '{}',
  attribution_status text not null default 'pending' check (attribution_status in ('pending','tracked','untracked','other_source')),
  attributed_platform text check (attributed_platform in ('meta','google')),
  campaign_id uuid references public.campaigns(id) on delete set null,
  ad_set_id uuid references public.ad_sets(id) on delete set null,
  ad_id uuid references public.ads(id) on delete set null,
  keyword_id uuid references public.keywords(id) on delete set null,
  journey_attempts smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, external_id)
);
create index on public.orders (workspace_id, placed_at);
create index on public.orders (store_id, placed_at);
create index on public.orders (campaign_id, placed_at);
create index on public.orders (ad_set_id, placed_at);
create index on public.orders (ad_id, placed_at);
create index on public.orders (keyword_id);
create index on public.orders (placed_at) where attribution_status = 'pending';
create index on public.orders (utm_campaign);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
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
create index on public.order_items (product_id);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null check (status in ('waiting_payment','paid','refused','refunded','chargedback','cancelled')),
  occurred_at timestamptz not null,
  topic text not null,
  webhook_delivery_id uuid references public.webhook_deliveries(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.order_events (order_id, occurred_at);
create index on public.order_events (webhook_delivery_id);

create table public.cost_settings (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  valid_from date not null,
  sales_tax_bp integer not null default 0 check (sales_tax_bp between 0 and 10000),
  meta_ads_tax_bp integer not null default 0 check (meta_ads_tax_bp between 0 and 10000),
  extra_taxes jsonb not null default '[]',   -- [{name, bp}]
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (dashboard_id, valid_from)
);
create index on public.cost_settings (created_by);

create table public.additional_fees (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  kind text not null check (kind in ('fixed','percent')),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  -- Moeda do valor fixo (a do dashboard quando a taxa foi salva).
  currency char(3) not null,
  bp integer check (bp is null or bp between 0 and 10000),
  scope text not null default 'all' check (scope in ('all','product','payment_method')),
  product_id uuid references public.products(id) on delete cascade,
  payment_method text check (payment_method in ('credit_card','pix','boleto','paypal','other')),
  valid_from date not null default current_date,
  valid_until date,
  created_by uuid references public.profiles(id) on delete set null,
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
create index on public.additional_fees (dashboard_id);
create index on public.additional_fees (product_id);
create index on public.additional_fees (created_by);

-- Recorrente: o mesmo valor no mesmo dia de cada mês, de `date` até `end_date`.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  kind text not null check (kind in ('once','recurring')),
  category text not null check (category in ('traffic','tools','staff','accounting','other')),
  description text not null check (char_length(description) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null,
  date date not null,
  end_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_end check (end_date is null or (kind = 'recurring' and end_date >= date))
);
create index on public.expenses (dashboard_id, date);
create index on public.expenses (created_by);

create table public.integration_tests (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  traffic_source text not null check (traffic_source in ('meta','google','organic')),
  campaign_url text not null,
  test_code text not null unique,
  status text not null default 'waiting' check (status in ('waiting','received','attributed','failed')),
  order_id uuid references public.orders(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.integration_tests (dashboard_id, created_at desc);
create index on public.integration_tests (order_id);
create index on public.integration_tests (created_by);

-- Cotação de referência do Banco Central Europeu (api.frankfurter.dev):
-- 1 unidade de base = rate unidades de quote, no dia útil `date`.
create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  base char(3) not null default 'BRL',
  quote char(3) not null,
  rate numeric(18,8) not null check (rate > 0),
  source text not null default 'ecb',
  created_at timestamptz not null default now(),
  unique (date, base, quote)
);

-- ============================================================
-- Automação
-- ============================================================

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  type text not null check (type in ('rule','scheduled','due_date','card_button','board_button','metric')),
  name text not null check (char_length(name) between 1 and 200),
  trigger jsonb not null,
  filters jsonb not null default '[]',
  actions jsonb not null check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) between 1 and 20),
  enabled boolean not null default true,
  timezone text not null default 'America/Sao_Paulo',
  next_run_at timestamptz,
  dashboard_id uuid references public.dashboards(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  failure_count integer not null default 0,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metric_needs_dashboard check (type <> 'metric' or dashboard_id is not null)
);
create index on public.automations (board_id, type);
create index on public.automations (next_run_at) where enabled and next_run_at is not null;
create index on public.automations (dashboard_id);
create index on public.automations (created_by);

-- O log de atividade também é o barramento de eventos da automação.
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  board_id uuid references public.boards(id) on delete cascade,
  card_id uuid references public.cards(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_kind text not null default 'user' check (actor_kind in ('user','automation','system')),
  automation_run_id uuid,                    -- FK adicionada abaixo
  type text not null,
  data jsonb not null default '{}',
  automation_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.activities (board_id, created_at desc);
create index on public.activities (card_id, created_at desc);
create index on public.activities (actor_id);
create index on public.activities (workspace_id, created_at desc);
create index on public.activities (created_at) where automation_checked_at is null;

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  trigger_activity_id uuid references public.activities(id) on delete set null,
  card_id uuid references public.cards(id) on delete set null,
  status text not null default 'running' check (status in ('running','success','error','skipped')),
  dedupe_key text,
  depth smallint not null default 0 check (depth between 0 and 5),
  chain uuid[] not null default '{}',
  message text,
  operations integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (automation_id, dedupe_key)
);
create index on public.automation_runs (automation_id, started_at desc);
create index on public.automation_runs (trigger_activity_id);
create index on public.automation_runs (card_id);

alter table public.activities
  add constraint activities_automation_run_fk
  foreign key (automation_run_id) references public.automation_runs(id) on delete set null;
create index on public.activities (automation_run_id);

-- ============================================================
-- A cola: card ligado a um alvo de métrica
-- ============================================================

create table public.card_links (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  target_type text not null check (target_type in ('campaign','ad_set','ad','product','dashboard')),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  ad_set_id uuid references public.ad_sets(id) on delete cascade,
  ad_id uuid references public.ads(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
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
create index on public.card_links (dashboard_id);
create index on public.card_links (campaign_id);
create index on public.card_links (ad_set_id);
create index on public.card_links (ad_id);
create index on public.card_links (product_id);
create index on public.card_links (created_by);

-- ============================================================
-- updated_at automático em toda tabela que tem a coluna
-- ============================================================

create or replace function public.set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
  as $$
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
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;

-- ============================================================
-- Funções de acesso (usadas pelas regras de RLS)
-- ============================================================
-- security definer: leem as tabelas sem passar pelo RLS de novo (evita regra
-- que consulta a própria tabela e entra em loop). search_path vazio e nomes
-- completos, como o Supabase recomenda.

create or replace function public.try_uuid(p text) returns uuid
  language plpgsql immutable
  set search_path = ''
  as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function public.is_workspace_member(p_workspace uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = (select auth.uid())) $$;

create or replace function public.is_workspace_admin(p_workspace uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = (select auth.uid()) and m.role = 'admin') $$;

create or replace function public.workspace_has_members(p_workspace uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace) $$;

/** Divide algum workspace com a pessoa logada (para ver nome e foto). */
create or replace function public.shares_workspace(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (
      select 1 from public.workspace_members a
      join public.workspace_members b on b.workspace_id = a.workspace_id
      where a.user_id = (select auth.uid()) and b.user_id = p_user
    )
  $$;

/** Papel efetivo no quadro: o de membro; ou, em quadro do workspace, o de quem é do workspace. */
create or replace function public.board_role(p_board uuid) returns text
  language sql stable security definer set search_path = ''
  as $$
    select coalesce(
      (select bm.role from public.board_members bm where bm.board_id = p_board and bm.user_id = (select auth.uid())),
      (select case when coalesce((b.prefs->>'workspaceCanEdit')::boolean, true) then 'normal' else 'observer' end
         from public.boards b
         join public.workspace_members wm on wm.workspace_id = b.workspace_id and wm.user_id = (select auth.uid())
        where b.id = p_board and b.visibility = 'workspace')
    )
  $$;

create or replace function public.can_read_board(p_board uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select public.board_role(p_board) is not null $$;

create or replace function public.can_edit_board(p_board uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select coalesce(public.board_role(p_board) in ('admin','normal'), false) $$;

create or replace function public.is_board_admin(p_board uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select coalesce(public.board_role(p_board) = 'admin', false) $$;

/** Comentar: quem edita; observador só se o quadro deixar ("comments" = "observers"). */
create or replace function public.can_comment(p_board uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select case public.board_role(p_board)
      when 'admin' then true
      when 'normal' then true
      when 'observer' then coalesce((select b.prefs->>'comments' = 'observers' from public.boards b where b.id = p_board), false)
      else false
    end
  $$;

create or replace function public.board_has_members(p_board uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.board_members m where m.board_id = p_board) $$;

create or replace function public.board_created_by_me(p_board uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.boards b where b.id = p_board and b.created_by = (select auth.uid())) $$;

create or replace function public.workspace_created_by_me(p_workspace uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.workspaces w where w.id = p_workspace and w.created_by = (select auth.uid())) $$;

create or replace function public.card_board(p_card uuid) returns uuid
  language sql stable security definer set search_path = ''
  as $$ select c.board_id from public.cards c where c.id = p_card $$;

create or replace function public.checklist_board(p_checklist uuid) returns uuid
  language sql stable security definer set search_path = ''
  as $$ select c.board_id from public.checklists cl join public.cards c on c.id = cl.card_id where cl.id = p_checklist $$;

create or replace function public.automation_board(p_automation uuid) returns uuid
  language sql stable security definer set search_path = ''
  as $$ select a.board_id from public.automations a where a.id = p_automation $$;

create or replace function public.dashboard_workspace(p_dashboard uuid) returns uuid
  language sql stable security definer set search_path = ''
  as $$ select d.workspace_id from public.dashboards d where d.id = p_dashboard $$;

create or replace function public.ad_account_workspace(p_account uuid) returns uuid
  language sql stable security definer set search_path = ''
  as $$ select a.workspace_id from public.ad_accounts a where a.id = p_account $$;

create or replace function public.keyword_workspace(p_keyword uuid) returns uuid
  language sql stable security definer set search_path = ''
  as $$ select a.workspace_id from public.keywords k join public.ad_accounts a on a.id = k.ad_account_id where k.id = p_keyword $$;

create or replace function public.store_workspace(p_store uuid) returns uuid
  language sql stable security definer set search_path = ''
  as $$ select s.workspace_id from public.stores s where s.id = p_store $$;

create or replace function public.order_workspace(p_order uuid) returns uuid
  language sql stable security definer set search_path = ''
  as $$ select o.workspace_id from public.orders o where o.id = p_order $$;

create or replace function public.product_workspace(p_product uuid) returns uuid
  language sql stable security definer set search_path = ''
  as $$ select p.workspace_id from public.products p where p.id = p_product $$;

-- ============================================================
-- RLS: ligado nas 48 tabelas
-- ============================================================

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---- pessoas -----------------------------------------------------------------------------

create policy "perfis: ver o próprio e o de quem divide workspace" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.shares_workspace(id));
create policy "perfis: mudar só o próprio" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Criar e apagar perfil: só o gatilho do Auth (on_auth_user_created) e o cascade.

-- ---- workspace -----------------------------------------------------------------------------

create policy "workspaces: membros veem" on public.workspaces
  for select to authenticated using (public.is_workspace_member(id) or created_by = (select auth.uid()));
create policy "workspaces: qualquer pessoa logada cria o seu" on public.workspaces
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "workspaces: admin muda" on public.workspaces
  for update to authenticated using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));
create policy "workspaces: admin apaga" on public.workspaces
  for delete to authenticated using (public.is_workspace_admin(id));

create policy "membros do workspace: membros veem" on public.workspace_members
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "membros do workspace: admin adiciona; quem criou o workspace entra como primeiro admin" on public.workspace_members
  for insert to authenticated with check (
    public.is_workspace_admin(workspace_id)
    or (user_id = (select auth.uid()) and role = 'admin' and public.workspace_created_by_me(workspace_id) and not public.workspace_has_members(workspace_id))
  );
create policy "membros do workspace: admin muda o papel" on public.workspace_members
  for update to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy "membros do workspace: admin remove; a pessoa pode sair" on public.workspace_members
  for delete to authenticated using (public.is_workspace_admin(workspace_id) or user_id = (select auth.uid()));

-- Aceitar convite (a pessoa ainda não é membro) passa pelo servidor com a chave secreta.
create policy "convites: admin do workspace ou do quadro gerencia" on public.invites
  for all to authenticated
  using (public.is_workspace_admin(workspace_id) or (board_id is not null and public.is_board_admin(board_id)))
  with check (public.is_workspace_admin(workspace_id) or (board_id is not null and public.is_board_admin(board_id)));

-- ---- quadros -----------------------------------------------------------------------------

create policy "quadros: quem pode ver" on public.boards
  for select to authenticated using (public.can_read_board(id) or created_by = (select auth.uid()));
create policy "quadros: membro do workspace cria" on public.boards
  for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy "quadros: quem edita muda" on public.boards
  for update to authenticated using (public.can_edit_board(id)) with check (public.can_edit_board(id));
create policy "quadros: admin do quadro apaga" on public.boards
  for delete to authenticated using (public.is_board_admin(id));

create policy "membros do quadro: quem vê o quadro vê" on public.board_members
  for select to authenticated using (public.can_read_board(board_id));
create policy "membros do quadro: admin adiciona; quem criou entra como primeiro admin" on public.board_members
  for insert to authenticated with check (
    public.is_board_admin(board_id)
    or (user_id = (select auth.uid()) and role = 'admin' and public.board_created_by_me(board_id) and not public.board_has_members(board_id))
  );
create policy "membros do quadro: admin muda o papel" on public.board_members
  for update to authenticated using (public.is_board_admin(board_id)) with check (public.is_board_admin(board_id));
create policy "membros do quadro: admin remove; a pessoa pode sair" on public.board_members
  for delete to authenticated using (public.is_board_admin(board_id) or user_id = (select auth.uid()));

create policy "estrelas: cada um as suas" on public.board_stars
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_read_board(board_id));

create policy "visitas: cada um as suas" on public.board_visits
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_read_board(board_id));

-- Tabelas que pertencem direto a um quadro: quem vê o quadro lê; quem edita escreve.
do $$
declare t text;
begin
  foreach t in array array['lists','labels','custom_fields','automations','cards']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can_read_board(board_id))', t || ': quem vê o quadro lê', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit_board(board_id))', t || ': quem edita o quadro cria', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id))', t || ': quem edita o quadro muda', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit_board(board_id))', t || ': quem edita o quadro apaga', t);
  end loop;
end $$;

-- Tabelas que pertencem a um card: o quadro do card decide.
do $$
declare t text;
begin
  foreach t in array array['card_members','card_labels','checklists','attachments','custom_field_values','card_links']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can_read_board(public.card_board(card_id)))', t || ': quem vê o quadro lê', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit_board(public.card_board(card_id)))', t || ': quem edita o quadro cria', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit_board(public.card_board(card_id))) with check (public.can_edit_board(public.card_board(card_id)))', t || ': quem edita o quadro muda', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit_board(public.card_board(card_id)))', t || ': quem edita o quadro apaga', t);
  end loop;
end $$;

create policy "itens de checklist: quem vê o quadro lê" on public.checklist_items
  for select to authenticated using (public.can_read_board(public.checklist_board(checklist_id)));
create policy "itens de checklist: quem edita o quadro escreve" on public.checklist_items
  for all to authenticated
  using (public.can_edit_board(public.checklist_board(checklist_id)))
  with check (public.can_edit_board(public.checklist_board(checklist_id)));

create policy "comentários: quem vê o quadro lê" on public.comments
  for select to authenticated using (public.can_read_board(public.card_board(card_id)));
create policy "comentários: quem pode comentar escreve em seu nome" on public.comments
  for insert to authenticated with check (author_id = (select auth.uid()) and public.can_comment(public.card_board(card_id)));
create policy "comentários: o autor edita o seu" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and public.can_comment(public.card_board(card_id)));
create policy "comentários: o autor ou o admin do quadro apaga" on public.comments
  for delete to authenticated using (author_id = (select auth.uid()) or public.is_board_admin(public.card_board(card_id)));

create policy "notificações: cada um vê as suas" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notificações: avisar quem divide workspace, em seu nome" on public.notifications
  for insert to authenticated with check (actor_id = (select auth.uid()) and public.shares_workspace(user_id));
create policy "notificações: cada um marca as suas como lidas" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notificações: cada um apaga as suas" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "atividades: quem vê o quadro (ou o workspace, sem quadro) lê" on public.activities
  for select to authenticated using (
    case when board_id is null then public.is_workspace_member(workspace_id) else public.can_read_board(board_id) end
  );
create policy "atividades: registrar ação própria" on public.activities
  for insert to authenticated with check (
    actor_id = (select auth.uid()) and actor_kind = 'user'
    and (case when board_id is null then public.is_workspace_member(workspace_id) else public.can_read_board(board_id) end)
  );
-- Mudar e apagar atividades, e as execuções das automações: só o servidor (chave secreta).

create policy "execuções de automação: quem vê o quadro lê" on public.automation_runs
  for select to authenticated using (public.can_read_board(public.automation_board(automation_id)));

-- ---- tracking ------------------------------------------------------------------------------

create policy "dashboards: membros do workspace veem" on public.dashboards
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "dashboards: admin cria, muda e apaga" on public.dashboards
  for all to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

-- Conexões guardam token: só admin vê a linha, e mesmo assim sem as colunas de token.
create policy "conexões de anúncio: só admin vê" on public.ad_connections
  for select to authenticated using (public.is_workspace_admin(workspace_id));
create policy "conexões de anúncio: admin desconecta" on public.ad_connections
  for delete to authenticated using (public.is_workspace_admin(workspace_id));

create policy "contas de anúncio: membros veem" on public.ad_accounts
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "contas de anúncio: admin liga e desliga" on public.ad_accounts
  for update to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

create policy "contas do dashboard: membros veem" on public.dashboard_ad_accounts
  for select to authenticated using (public.is_workspace_member(public.dashboard_workspace(dashboard_id)));
create policy "contas do dashboard: admin liga e desliga" on public.dashboard_ad_accounts
  for all to authenticated
  using (public.is_workspace_admin(public.dashboard_workspace(dashboard_id)))
  with check (
    public.is_workspace_admin(public.dashboard_workspace(dashboard_id))
    and public.ad_account_workspace(ad_account_id) = public.dashboard_workspace(dashboard_id)
  );

-- Campanhas e conjuntos: membros veem; admin pausa, ativa e muda o orçamento.
do $$
declare t text;
begin
  foreach t in array array['campaigns','ad_sets']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(public.ad_account_workspace(ad_account_id)))', t || ': membros veem', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_workspace_admin(public.ad_account_workspace(ad_account_id))) with check (public.is_workspace_admin(public.ad_account_workspace(ad_account_id)))', t || ': admin muda status e orçamento', t);
  end loop;
end $$;

-- Dados que só a sincronização escreve: membros leem.
do $$
declare t text;
begin
  foreach t in array array['ads','keywords','ad_insights_daily','ad_account_insights_hourly']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(public.ad_account_workspace(ad_account_id)))', t || ': membros veem', t);
  end loop;
end $$;

create policy "gasto por palavra-chave: membros veem" on public.keyword_insights_daily
  for select to authenticated using (public.is_workspace_member(public.keyword_workspace(keyword_id)));

create policy "lojas: membros veem (sem as colunas de token)" on public.stores
  for select to authenticated using (public.is_workspace_member(workspace_id));

create policy "lojas do dashboard: membros veem" on public.dashboard_stores
  for select to authenticated using (public.is_workspace_member(public.dashboard_workspace(dashboard_id)));
create policy "lojas do dashboard: admin liga e desliga" on public.dashboard_stores
  for all to authenticated
  using (public.is_workspace_admin(public.dashboard_workspace(dashboard_id)))
  with check (
    public.is_workspace_admin(public.dashboard_workspace(dashboard_id))
    and public.store_workspace(store_id) = public.dashboard_workspace(dashboard_id)
  );

-- webhook_deliveries: RLS ligado e nenhuma regra = o navegador não lê nem escreve.

create policy "produtos: membros veem" on public.products
  for select to authenticated using (public.is_workspace_member(workspace_id));

create policy "custo de produto: membros veem" on public.product_costs
  for select to authenticated using (public.is_workspace_member(public.product_workspace(product_id)));
create policy "custo de produto: admin cadastra e muda" on public.product_costs
  for all to authenticated
  using (public.is_workspace_admin(public.product_workspace(product_id)))
  with check (public.is_workspace_admin(public.product_workspace(product_id)) and created_by = (select auth.uid()));

create policy "pedidos: membros veem" on public.orders
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "itens do pedido: membros veem" on public.order_items
  for select to authenticated using (public.is_workspace_member(public.order_workspace(order_id)));
create policy "histórico do pedido: membros veem" on public.order_events
  for select to authenticated using (public.is_workspace_member(public.order_workspace(order_id)));

-- Custos e testes do dashboard: membros veem; admin escreve.
do $$
declare t text;
begin
  foreach t in array array['cost_settings','additional_fees','expenses','integration_tests']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(public.dashboard_workspace(dashboard_id)))', t || ': membros veem', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_workspace_admin(public.dashboard_workspace(dashboard_id))) with check (public.is_workspace_admin(public.dashboard_workspace(dashboard_id)))', t || ': admin escreve', t);
  end loop;
end $$;

-- Cotação é dado público; quem grava é o servidor.
create policy "cotações: qualquer pessoa logada lê" on public.fx_rates
  for select to authenticated using (true);

-- ============================================================
-- Permissões por coluna: token nunca sai para o navegador
-- ============================================================
-- Com a tabela inteira liberada, revogar uma coluna não tem efeito; por isso a
-- leitura é dada coluna a coluna, sem as de token. Escrever nessas tabelas é
-- tarefa do servidor (chave secreta).

revoke all on public.ad_connections from anon, authenticated;
grant select (id, workspace_id, provider, external_user_id, external_user_name, token_expires_at, scopes, status, last_error, created_by, created_at, updated_at)
  on public.ad_connections to authenticated;
grant delete on public.ad_connections to authenticated;

revoke all on public.stores from anon, authenticated;
grant select (id, workspace_id, platform, shop_domain, name, currency, timezone, scopes, status, webhooks_ok, last_event_at, installed_at, uninstalled_at, created_by, created_at, updated_at)
  on public.stores to authenticated;

revoke all on public.webhook_deliveries from anon, authenticated;

-- ============================================================
-- Imagens: bucket privado "uploads" no Storage
-- ============================================================
-- Caminhos: avatars/<id da pessoa>/<arquivo>, wallpapers/<id da pessoa>/<arquivo>,
-- boards/<id do quadro>/<arquivo>. Só JPG, PNG e WebP, até 5 MB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "uploads: ver foto de quem divide workspace, o próprio plano de fundo e o fundo dos quadros que vê" on storage.objects
  for select to authenticated using (
    bucket_id = 'uploads' and (
      ((storage.foldername(name))[1] = 'avatars' and ((storage.foldername(name))[2] = (select auth.uid())::text or public.shares_workspace(public.try_uuid((storage.foldername(name))[2]))))
      or ((storage.foldername(name))[1] = 'wallpapers' and (storage.foldername(name))[2] = (select auth.uid())::text)
      or ((storage.foldername(name))[1] = 'boards' and public.can_read_board(public.try_uuid((storage.foldername(name))[2])))
    )
  );

create policy "uploads: enviar a própria foto, o próprio plano de fundo e o fundo dos quadros que edita" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'uploads' and (
      ((storage.foldername(name))[1] in ('avatars','wallpapers') and (storage.foldername(name))[2] = (select auth.uid())::text)
      or ((storage.foldername(name))[1] = 'boards' and public.can_edit_board(public.try_uuid((storage.foldername(name))[2])))
    )
  );

create policy "uploads: trocar a própria foto, o próprio plano de fundo e o fundo dos quadros que edita" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'uploads' and (
      ((storage.foldername(name))[1] in ('avatars','wallpapers') and (storage.foldername(name))[2] = (select auth.uid())::text)
      or ((storage.foldername(name))[1] = 'boards' and public.can_edit_board(public.try_uuid((storage.foldername(name))[2])))
    )
  )
  with check (
    bucket_id = 'uploads' and (
      ((storage.foldername(name))[1] in ('avatars','wallpapers') and (storage.foldername(name))[2] = (select auth.uid())::text)
      or ((storage.foldername(name))[1] = 'boards' and public.can_edit_board(public.try_uuid((storage.foldername(name))[2])))
    )
  );

create policy "uploads: apagar a própria foto, o próprio plano de fundo e o fundo dos quadros que edita" on storage.objects
  for delete to authenticated using (
    bucket_id = 'uploads' and (
      ((storage.foldername(name))[1] in ('avatars','wallpapers') and (storage.foldername(name))[2] = (select auth.uid())::text)
      or ((storage.foldername(name))[1] = 'boards' and public.can_edit_board(public.try_uuid((storage.foldername(name))[2])))
    )
  );
