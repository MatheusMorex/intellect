-- Verificação em duas etapas (2FA) com o MFA do Supabase: aplicativo
-- autenticador (código de 6 dígitos que muda a cada 30 segundos).
--
-- Quem ligou o 2FA só acessa os dados depois de digitar o código: a sessão
-- precisa estar no nível aal2. Sem isto, quem soubesse só a senha conseguiria
-- ler os dados direto pela API do Supabase (o app também confere, no servidor).
-- Quem não ligou o 2FA segue como antes.
--
-- As regras são "restrictive": valem junto com as que já existem (todas
-- precisam passar), em todas as tabelas do schema public e nos arquivos.
-- Tabela nova em migração futura precisa da mesma regra.

create or replace function public.mfa_ok() returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
        or not exists (
          select 1 from auth.mfa_factors f
          where f.user_id = (select auth.uid()) and f.status = 'verified'
        )
  $$;

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))',
      '2fa: com o código digitado, se estiver ligado', t);
  end loop;
end $$;

create policy "2fa: com o código digitado, se estiver ligado" on storage.objects
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
