-- Etapa 5 da troca para o Supabase: anexos dos cards.
--
-- A tabela public.attachments já existe (migração inicial, com RLS pelo quadro
-- do card). Aqui entra o lugar dos arquivos: o bucket privado "attachments",
-- com caminhos cards/<id do card>/<arquivo>. Qualquer tipo de arquivo, até 25 MB
-- (o mesmo limite da tabela). O nome original do arquivo fica na tabela; no
-- Storage o nome é sempre um id novo, então ninguém adivinha o caminho.
--
-- Quem vê o quadro do card baixa; quem edita o quadro envia e apaga.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 26214400, null)
on conflict (id) do nothing;

create policy "anexos: quem vê o quadro do card baixa" on storage.objects
  for select to authenticated using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = 'cards'
    and public.can_read_board(public.card_board(public.try_uuid((storage.foldername(name))[2])))
  );

create policy "anexos: quem edita o quadro do card envia" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = 'cards'
    and public.can_edit_board(public.card_board(public.try_uuid((storage.foldername(name))[2])))
  );

create policy "anexos: quem edita o quadro do card apaga" on storage.objects
  for delete to authenticated using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = 'cards'
    and public.can_edit_board(public.card_board(public.try_uuid((storage.foldername(name))[2])))
  );
