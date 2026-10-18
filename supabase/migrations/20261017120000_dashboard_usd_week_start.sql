-- Dashboard: dólar (USD) entra na lista de moedas e o dashboard ganha o dia em
-- que a semana começa nos Painéis (segunda, o padrão ISO 8601, ou domingo).
-- Quem já existe fica com segunda-feira. As regras de acesso (RLS) da tabela
-- continuam as mesmas.

alter table public.dashboards drop constraint dashboards_currency_check;
alter table public.dashboards
  add constraint dashboards_currency_check check (currency in ('BRL','EUR','GBP','CHF','USD'));

alter table public.dashboards
  add column week_start text not null default 'monday' check (week_start in ('monday','sunday'));
