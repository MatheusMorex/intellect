-- Perfil: pelo navegador (chave publishable + login), a pessoa só muda as colunas
-- que o app deixa editar. E-mail vem do Auth (gatilho on_auth_user_email_changed),
-- e id, datas e last_active_at são do servidor.
--
-- O Supabase dá UPDATE em todas as colunas por padrão; sem isto, a pessoa poderia
-- trocar o e-mail do próprio perfil direto pela API.

revoke update on public.profiles from anon, authenticated;

grant update (name, username, bio, timezone, locale, theme, avatar_color, avatar_path, preferences, appearance)
  on public.profiles to authenticated;
