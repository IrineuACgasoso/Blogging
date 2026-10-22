-- Rode no Supabase > SQL Editor (depois do 004). Seguro para rodar mais de uma vez.
--
-- Bug corrigido: republicar um post que JÁ está na vitrine de hoje (duplo clique, ou publicar de novo
-- depois de editar) removia o post, empurrava TODOS os outros uma posição e o corte do final derrubava
-- outro post, deixando um buraco nas posições (vitrine com 5 itens em vez de 6).
-- Agora só descem os posts que estavam ACIMA da posição antiga; os de baixo não se mexem.

create or replace function publish_post(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'America/Recife')::date; slots int := 6; old_pos int;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(42);
  update posts set status = 'published', published_at = coalesce(published_at, now()),
         queue_level = 0, last_shown_at = now() where id = p_post;

  select position into old_pos from daily_lineup where day = d and post_id = p_post;
  delete from daily_lineup where day = d and post_id = p_post;
  update daily_lineup set position = position + 1
    where day = d and (old_pos is null or position < old_pos);   -- PK deferrable
  insert into daily_lineup values (d, 0, p_post, true);
  delete from daily_lineup where day = d and position >= slots;  -- os de baixo só "descem"
end $$;

-- Defesa em camadas: visitante sem login nem chega a executar (antes só era barrado pelo "forbidden" interno).
revoke execute on function publish_post(uuid) from public, anon;
grant execute on function publish_post(uuid) to authenticated;
