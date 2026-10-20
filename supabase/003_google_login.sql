-- Rode no Supabase > SQL Editor (depois do schema.sql e do 002). Seguro para rodar mais de uma vez.
--
-- Por que: com login Google, o nome vem em raw_user_meta_data ('name'/'full_name'). A versão anterior do
-- trigger violava o CHECK de profiles.name (2..60 caracteres) quando o nome tinha 1 caractere, o que fazia o
-- INSERT em auth.users falhar e a pessoa ficava sem conseguir entrar ("Database error saving new user").
-- Agora o trigger nunca falha por causa do nome: normaliza e cai em 'Leitor'.

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n text := left(trim(coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    ''
  )), 60);
begin
  if char_length(n) < 2 then n := 'Leitor'; end if;
  insert into profiles (id, name) values (new.id, n) on conflict (id) do nothing;
  return new;
end $$;
