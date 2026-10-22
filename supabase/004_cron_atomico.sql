-- Rode no Supabase > SQL Editor (depois do schema.sql, 002 e 003). Seguro para rodar mais de uma vez.
--
-- Por que: a virada do dia era feita em DUAS chamadas (close_day e open_day) com o cálculo no meio.
-- Se o cron falhasse entre elas, o dia ficava marcado como "já rodou" e sem vitrine, e a nova tentativa
-- era recusada. Além disso, as views dos últimos 7 dias eram baixadas linha a linha, e o limite padrão
-- da API (1000 linhas) cortava a contagem em silêncio.
--
-- Agora:
--   lineup_inputs(dia)  -> UMA leitura consistente, já com as contagens agregadas aqui no banco.
--   commit_day(...)     -> UMA transação: marca o dia, rebaixa, atualiza temas e grava a vitrine.
--                          Se algo falhar, NADA muda e o cron pode simplesmente ser chamado de novo.
-- As funções antigas close_day/open_day deixam de ser usadas (podem ser apagadas depois do deploy).

-- Fonte única da regra "o que foi exibido ontem é rebaixado": usada pela leitura (projeção)
-- e pela gravação, para as duas nunca divergirem.
create or replace function closing_posts(p_day date)
returns table (post_id uuid, queue_level smallint, last_shown_at timestamptz)
language sql stable set search_path = public as $$
  select p.id,
         least(p.queue_level + 1, 3)::smallint,
         (p_day::timestamp at time zone 'America/Recife')
  from posts p
  where p.id in (select l.post_id from daily_lineup l where l.day = p_day - 1)
$$;

create or replace function closing_themes(p_day date)
returns setof uuid
language sql stable set search_path = public as $$
  select distinct p.theme_id
  from posts p join daily_lineup l on l.post_id = p.id
  where l.day = p_day - 1
$$;

-- Passo 1 (só leitura): tudo que o escalonador precisa, já como ficaria depois do rebaixamento.
create or replace function lineup_inputs(p_day date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from lineup_runs where day = p_day) then
    return jsonb_build_object('already_ran', true);
  end if;

  return jsonb_build_object(
    'already_ran', false,
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'theme_id', p.theme_id,
        'published_at', p.published_at,
        'last_shown_at', coalesce(c.last_shown_at, p.last_shown_at),
        'queue_level', coalesce(c.queue_level, p.queue_level),
        'likes_count', p.likes_count,
        'views7d', coalesce(v.n, 0)
      ))
      from posts p
      left join closing_posts(p_day) c on c.post_id = p.id
      left join (
        select post_id, count(*)::int as n from post_views where day >= p_day - 7 group by post_id
      ) v on v.post_id = p.id
      where p.status = 'published'
    ), '[]'::jsonb),
    'themes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'last_shown_on', case when t.id in (select * from closing_themes(p_day)) then p_day - 1 else t.last_shown_on end
      ))
      from themes t
    ), '[]'::jsonb),
    'pinned', coalesce((
      select jsonb_agg(l.post_id) from daily_lineup l where l.day = p_day and l.pinned
    ), '[]'::jsonb)
  );
end $$;

-- Passo 2 (uma transação só): marca o dia, aplica o rebaixamento e grava a vitrine.
-- Retorna false (sem mexer em nada) se o dia já foi fechado por outra execução.
create or replace function commit_day(p_day date, p_items uuid[], p_slots int default 6) returns boolean
language plpgsql security definer set search_path = public as $$
declare base int;
begin
  perform pg_advisory_xact_lock(42);

  insert into lineup_runs values (p_day) on conflict do nothing;
  if not found then return false; end if;

  update posts p set queue_level = c.queue_level, last_shown_at = c.last_shown_at
    from closing_posts(p_day) c where p.id = c.post_id;
  update themes set last_shown_on = p_day - 1 where id in (select * from closing_themes(p_day));

  delete from daily_lineup where day = p_day and not pinned;
  select coalesce(max(position) + 1, 0) into base from daily_lineup where day = p_day;

  -- Mantém a ordem recebida; ignora repetidos, posts já fixados hoje (publicados no meio-tempo)
  -- e posts que deixaram de estar publicados; nunca passa do total de vagas.
  insert into daily_lineup (day, position, post_id, pinned)
  select p_day, (base + row_number() over (order by s.ord) - 1)::smallint, s.post_id, false
  from (
    select post_id, min(ord) as ord
    from unnest(coalesce(p_items, '{}'::uuid[])) with ordinality as t(post_id, ord)
    group by post_id
  ) s
  where exists (select 1 from posts p where p.id = s.post_id and p.status = 'published')
    and not exists (select 1 from daily_lineup l where l.day = p_day and l.post_id = s.post_id)
  order by s.ord
  limit greatest(0, p_slots - base);

  return true;
end $$;

revoke execute on function closing_posts(date), closing_themes(date), lineup_inputs(date), commit_day(date, uuid[], int)
  from public, anon, authenticated;   -- só service_role (cron)
grant execute on function closing_posts(date), closing_themes(date), lineup_inputs(date), commit_day(date, uuid[], int)
  to service_role;
