-- Rode este arquivo inteiro no Supabase > SQL Editor (uma vez).

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  created_at timestamptz default now()
);
create table admins (user_id uuid primary key references auth.users on delete cascade);
create table bio (
  id int primary key default 1 check (id = 1),
  content text not null default '',
  updated_at timestamptz default now()
);
insert into bio default values;

create table themes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text unique not null check (char_length(name) <= 40),
  last_shown_on date
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  body text not null,
  theme_id uuid not null references themes on delete restrict,
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  queue_level smallint not null default 0 check (queue_level between 0 and 3),
  last_shown_at timestamptz,
  views_count int not null default 0,
  likes_count int not null default 0
);
create index on posts (theme_id, published_at desc);
create index on posts (theme_id, likes_count desc);
create index on posts (status, published_at desc);

create table likes (
  user_id uuid references auth.users on delete cascade,
  post_id uuid references posts on delete cascade,
  primary key (user_id, post_id)
);
create table post_views (
  post_id uuid references posts on delete cascade,
  viewer_key text not null check (char_length(viewer_key) <= 64),
  day date not null,
  primary key (post_id, viewer_key, day)
);
create table daily_lineup (
  day date not null,
  position smallint not null,
  post_id uuid not null references posts on delete cascade,
  pinned boolean not null default false,
  constraint lineup_pk primary key (day, position) deferrable initially deferred
);
create table lineup_runs (day date primary key);

create function is_admin() returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from admins where user_id = auth.uid()) $$;

create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'Leitor'), 60));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create function bump_likes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update posts set likes_count = greatest(0, likes_count + (case when tg_op = 'INSERT' then 1 else -1 end))
  where id = coalesce(new.post_id, old.post_id);
  return null;
end $$;
create trigger likes_count_t after insert or delete on likes for each row execute function bump_likes();

-- 1 view por visitante/dia (idempotente)
create function register_view(p_post uuid, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'America/Recife')::date;
begin
  if not exists (select 1 from posts where id = p_post and status = 'published') then return; end if;
  insert into post_views values (p_post, left(p_key, 64), d) on conflict do nothing;
  if found then update posts set views_count = views_count + 1 where id = p_post; end if;
end $$;

-- PUBLICAR: fixa no topo de hoje SEM alterar prioridades dos outros posts.
create function publish_post(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'America/Recife')::date; slots int := 6;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(42);
  update posts set status = 'published', published_at = coalesce(published_at, now()),
         queue_level = 0, last_shown_at = now() where id = p_post;
  delete from daily_lineup where day = d and post_id = p_post;
  update daily_lineup set position = position + 1 where day = d;  -- PK deferrable
  insert into daily_lineup values (d, 0, p_post, true);
  delete from daily_lineup where day = d and position >= slots;   -- os de baixo só "descem"
end $$;

-- Virada do dia, passo 1: rebaixa o que foi exibido ontem (regra MLFQ). Idempotente.
create function close_day(p_day date) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(42);
  insert into lineup_runs values (p_day) on conflict do nothing;
  if not found then return false; end if;
  update posts set queue_level = least(queue_level + 1, 3),
         last_shown_at = (p_day::timestamp at time zone 'America/Recife')
    where id in (select post_id from daily_lineup where day = p_day - 1);
  update themes set last_shown_on = p_day - 1
    where id in (select p.theme_id from posts p join daily_lineup l on l.post_id = p.id where l.day = p_day - 1);
  return true;
end $$;

-- Passo 2: grava o lineup calculado, mantendo os fixados que chegaram no meio-tempo.
create function open_day(p_day date, p_items uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare base int; i int;
begin
  perform pg_advisory_xact_lock(42);
  delete from daily_lineup where day = p_day and not pinned;
  select coalesce(max(position) + 1, 0) into base from daily_lineup where day = p_day;
  for i in 1..coalesce(array_length(p_items, 1), 0) loop
    insert into daily_lineup values (p_day, base + i - 1, p_items[i], false);
  end loop;
end $$;
revoke execute on function close_day, open_day from public, anon, authenticated; -- só service_role

-- RLS
alter table profiles enable row level security;
alter table admins enable row level security;      -- sem policies: ninguém lê pelo client
alter table bio enable row level security;
alter table themes enable row level security;
alter table posts enable row level security;
alter table likes enable row level security;
alter table post_views enable row level security;  -- sem policies: só via RPC
alter table daily_lineup enable row level security;
alter table lineup_runs enable row level security; -- sem policies

create policy "own profile read"   on profiles for select using (id = auth.uid());
create policy "own profile update" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "bio read"  on bio for select using (true);
create policy "bio admin" on bio for update using (is_admin()) with check (is_admin());
create policy "themes read"  on themes for select using (true);
create policy "themes admin" on themes for all using (is_admin()) with check (is_admin());
create policy "posts read"  on posts for select using (status = 'published' or is_admin());
create policy "posts admin" on posts for all using (is_admin()) with check (is_admin());
create policy "likes read own" on likes for select using (user_id = auth.uid());
create policy "likes insert"   on likes for insert with check (user_id = auth.uid());
create policy "likes delete"   on likes for delete using (user_id = auth.uid());
create policy "lineup read" on daily_lineup for select using (true);

-- PERMISSÕES DA API (necessárias porque "Automatically expose new tables" fica DESMARCADO).
-- A RLS acima continua sendo quem decide QUEM pode fazer O QUÊ; os grants só abrem a porta.
grant usage on schema public to anon, authenticated, service_role;
grant select on themes, bio, daily_lineup, posts to anon, authenticated;
grant insert, update, delete on posts, themes to authenticated;   -- RLS limita a admins
grant update on bio to authenticated;                              -- RLS limita a admins
grant select, update on profiles to authenticated;
grant select, insert, delete on likes to authenticated;
grant all on all tables in schema public to service_role;          -- cron (backend)
grant execute on function is_admin() to anon, authenticated;
grant execute on function register_view(uuid, text) to anon, authenticated;
grant execute on function publish_post(uuid) to authenticated;
grant execute on function close_day(date), open_day(date, uuid[]) to service_role;

-- Depois de criar as duas contas (login pelo site), defina os admins:
-- insert into admins select id from auth.users where email in ('voce@email.com','ela@email.com');
