-- Imita o mínimo do Supabase (schema auth, storage, papéis) para rodar os SQLs do projeto num Postgres local (PGlite).
-- Só existe para os testes: NÃO rode isto no Supabase de verdade.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema auth, storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated;  -- no Supabase real a RLS é quem barra
