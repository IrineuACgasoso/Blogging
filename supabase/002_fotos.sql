-- Rode DEPOIS do schema.sql (Supabase > SQL Editor). Adiciona fotografias + armazenamento de imagens.

create table photos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  path text not null unique,
  width int not null check (width > 0),
  height int not null check (height > 0),
  created_at timestamptz not null default now()
);
create index on photos (created_at desc);

alter table photos enable row level security;
create policy "photos read"  on photos for select using (true);
create policy "photos admin" on photos for all using (is_admin()) with check (is_admin());

grant select on photos to anon, authenticated;
grant insert, update, delete on photos to authenticated;   -- RLS limita a admins
grant all on photos to service_role;

-- Bucket público para leitura; só admin escreve.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "photos bucket admin select" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_admin());
create policy "photos bucket admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_admin());
create policy "photos bucket admin update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_admin()) with check (bucket_id = 'photos' and public.is_admin());
create policy "photos bucket admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());
