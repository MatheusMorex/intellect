-- Painéis salvos dos dashboards (Fase 5 dos Painéis): os gráficos de cada
-- painel, onde cada um fica na grade de 12 colunas, quem vê e com que filtros
-- abre. É a mesma estrutura que o app usa hoje no modo simulado
-- (server/store/types.ts, PanelRow); a troca para o banco vem com a etapa 4.
--
-- Quem pode o quê (RLS):
-- - admin do workspace do dashboard: vê, cria, muda e apaga todos os painéis;
-- - membro do workspace: vê os painéis do workspace inteiro e os que o liberaram
--   (viewer_ids); não muda nada (os filtros dele ficam só no endereço da página);
-- - quem não é do workspace: não vê nem fica sabendo que o painel existe.
-- A configuração dos gráficos (widgets) é validada pelo servidor (zod) antes de
-- gravar; aqui ficam os limites de forma e de tamanho.

create table public.dashboard_panels (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- Ordem das abas.
  position integer not null default 0 check (position >= 0),
  -- O painel que abre primeiro (um por dashboard, ver o índice abaixo).
  is_default boolean not null default false,
  visibility text not null default 'workspace' check (visibility in ('workspace', 'restricted')),
  viewer_ids uuid[] not null default '{}' check (cardinality(viewer_ids) <= 200),
  members_can_filter boolean not null default true,
  -- Parâmetros do endereço com que o painel abre (periodo, agrupar, comparar, conta, fonte, produto...).
  defaults jsonb not null default '{}'::jsonb check (jsonb_typeof(defaults) = 'object'),
  widgets jsonb not null default '[]'::jsonb check (jsonb_typeof(widgets) = 'array' and jsonb_array_length(widgets) <= 40),
  layout jsonb not null default '[]'::jsonb check (jsonb_typeof(layout) = 'array' and jsonb_array_length(layout) <= 60),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- As abas de um dashboard, em ordem; e um único painel padrão por dashboard.
create index dashboard_panels_dashboard_position on public.dashboard_panels (dashboard_id, position);
create index dashboard_panels_created_by on public.dashboard_panels (created_by);
create unique index dashboard_panels_one_default on public.dashboard_panels (dashboard_id) where is_default;

create trigger dashboard_panels_updated_at before update on public.dashboard_panels
  for each row execute function public.set_updated_at();

alter table public.dashboard_panels enable row level security;

create policy "painéis: admin vê todos; membro vê os do workspace e os liberados" on public.dashboard_panels
  for select to authenticated using (
    public.is_workspace_admin(public.dashboard_workspace(dashboard_id))
    or (
      public.is_workspace_member(public.dashboard_workspace(dashboard_id))
      and (visibility = 'workspace' or (select auth.uid()) = any (viewer_ids))
    )
  );

create policy "painéis: admin do workspace cria, muda e apaga" on public.dashboard_panels
  for all to authenticated
  using (public.is_workspace_admin(public.dashboard_workspace(dashboard_id)))
  with check (public.is_workspace_admin(public.dashboard_workspace(dashboard_id)));
