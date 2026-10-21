-- Até onde as cotações de cada moeda já foram buscadas (etapa 4 da troca para o
-- Supabase). Sem isto, nos fins de semana e feriados (sem cotação nova do BCE)
-- o app buscaria as cotações de novo a cada tela. Só o servidor lê e grava
-- (chave secreta); o navegador não tem acesso.

create table public.fx_coverage (
  quote char(3) primary key,
  from_date date not null,
  to_date date not null,
  fetched_at timestamptz not null default now(),
  constraint fx_coverage_range check (from_date <= to_date)
);

alter table public.fx_coverage enable row level security;
revoke all on public.fx_coverage from anon, authenticated;
