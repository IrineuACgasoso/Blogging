// Regras de acesso (RLS) vistas como cada tipo de pessoa: visitante (anon), leitora logada e admin.
// É a versão automática do item 1 do TODO ("testar as regras de segurança") no nível do banco.
import { dbTest, as, ID, TODAY, one, val, assert } from '../lib/pg.mjs';

const postId = (db, slug) => val(db, 'select id from posts where slug = $1', [slug]);
const themeId = (db) => val(db, "select id from themes where slug = 'moda'");

// ---------- leitura
dbTest('visitante lê posts publicados', async (db) => {
  const rows = await as(db, 'anon')('select slug from posts');
  assert.equal(rows.length, 10);
});
dbTest('visitante NÃO vê rascunhos', async (db) => {
  assert.equal((await as(db, 'anon')("select 1 from posts where status = 'draft'")).length, 0);
});
dbTest('leitora logada NÃO vê rascunhos', async (db) => {
  assert.equal((await as(db, 'authenticated', ID.reader)("select 1 from posts where slug = 'rascunho'")).length, 0);
});
dbTest('admin vê rascunhos', async (db) => {
  assert.equal((await as(db, 'authenticated', ID.admin)("select 1 from posts where slug = 'rascunho'")).length, 1);
});
dbTest('visitante lê temas, biografia, vitrine e fotos', async (db) => {
  const a = as(db, 'anon');
  await a('select 1 from themes');
  await a('select 1 from bio');
  await a('select 1 from daily_lineup');
  await a('select 1 from photos');
});

// ---------- escrita: posts, temas, bio, fotos
dbTest('visitante NÃO cria post', async (db) => {
  await as(db, 'anon').denied('insert into posts(slug,title,body,theme_id) values ($1,$2,$3,$4)', [
    'x',
    'x',
    'x',
    await themeId(db),
  ]);
});
dbTest('leitora logada NÃO cria post', async (db) => {
  await as(db, 'authenticated', ID.reader).denied('insert into posts(slug,title,body,theme_id) values ($1,$2,$3,$4)', [
    'x',
    'x',
    'x',
    await themeId(db),
  ]);
});
dbTest('leitora NÃO edita post existente (0 linhas afetadas, título intacto)', async (db) => {
  const rows = await as(
    db,
    'authenticated',
    ID.reader,
  )("update posts set title = 'HACK' where slug = 'p01' returning id");
  assert.equal(rows.length, 0);
  assert.equal(await val(db, "select title from posts where slug = 'p01'"), 'Post 1');
});
dbTest('leitora NÃO apaga post', async (db) => {
  assert.equal(
    (await as(db, 'authenticated', ID.reader)("delete from posts where slug = 'p01' returning id")).length,
    0,
  );
  assert.equal(await val(db, "select count(*)::int from posts where slug = 'p01'"), 1);
});
dbTest('visitante NÃO apaga post', async (db) => {
  await as(db, 'anon').denied("delete from posts where slug = 'p01'");
});
dbTest('leitora NÃO cria nem edita tema', async (db) => {
  const r = as(db, 'authenticated', ID.reader);
  await r.denied("insert into themes(slug,name) values ('hack','Hack')");
  assert.equal((await r("update themes set name = 'HACK' where slug = 'moda' returning id")).length, 0);
});
dbTest('leitora NÃO altera a biografia', async (db) => {
  assert.equal((await as(db, 'authenticated', ID.reader)("update bio set content = 'HACK' returning id")).length, 0);
  assert.equal(await val(db, 'select content from bio'), '');
});
dbTest('visitante NÃO altera a biografia', async (db) => {
  await as(db, 'anon').denied("update bio set content = 'HACK'");
});
dbTest('leitora NÃO cadastra foto', async (db) => {
  await as(db, 'authenticated', ID.reader).denied(
    "insert into photos(title,path,width,height) values ('x','posts/x.webp',10,10)",
  );
});
dbTest('admin cria post, tema, foto e edita a biografia', async (db) => {
  const a = as(db, 'authenticated', ID.admin);
  await a("insert into themes(slug,name) values ('novo','Novo')");
  await a('insert into posts(slug,title,body,theme_id) values ($1,$2,$3,$4)', [
    'novo-post',
    'T',
    'B',
    await themeId(db),
  ]);
  await a("insert into photos(title,path,width,height) values ('f','photos/f.webp',10,10)");
  assert.equal((await a("update bio set content = 'oi' returning id")).length, 1);
});
dbTest('leitora NÃO escreve na vitrine (daily_lineup) nem em lineup_runs', async (db) => {
  const r = as(db, 'authenticated', ID.reader);
  await r.denied(`insert into daily_lineup values (${TODAY}, 0, '${await postId(db, 'p05')}', true)`);
  await r.denied(`insert into lineup_runs values (${TODAY})`);
});

// ---------- admin e privilégios
dbTest('leitora NÃO consegue se promover a admin', async (db) => {
  await as(db, 'authenticated', ID.reader).denied(`insert into admins values ('${ID.reader}')`);
});
dbTest('ninguém lê a tabela admins pelo client', async (db) => {
  await as(db, 'anon').denied('select * from admins');
  await as(db, 'authenticated', ID.admin).denied('select * from admins');
});
dbTest('is_admin(): true só para admin', async (db) => {
  assert.equal(await val(db, `select is_admin()`), false); // sem identidade
  assert.equal((await as(db, 'authenticated', ID.reader)('select is_admin() v'))[0].v, false);
  assert.equal((await as(db, 'authenticated', ID.admin)('select is_admin() v'))[0].v, true);
});

// ---------- publish_post
dbTest('visitante NÃO chama publish_post', async (db) => {
  await as(db, 'anon').denied('select publish_post($1)', [await postId(db, 'rascunho')]);
});
dbTest('leitora NÃO chama publish_post (forbidden) e o rascunho continua rascunho', async (db) => {
  await as(db, 'authenticated', ID.reader).denied(
    'select publish_post($1)',
    [await postId(db, 'rascunho')],
    /forbidden/,
  );
  assert.equal(await val(db, "select status from posts where slug = 'rascunho'"), 'draft');
});
dbTest('admin publica: o post vai para o topo da vitrine de hoje e os outros descem', async (db) => {
  const a = as(db, 'authenticated', ID.admin);
  await a('select publish_post($1)', [await postId(db, 'p05')]);
  await a('select publish_post($1)', [await postId(db, 'rascunho')]);
  const rows = (
    await db.query(
      `select p.slug, l.position, l.pinned from daily_lineup l join posts p on p.id = l.post_id where l.day = ${TODAY} order by 2`,
    )
  ).rows;
  assert.deepEqual(
    rows.map((r) => r.slug),
    ['rascunho', 'p05'],
  );
  assert.ok(rows.every((r) => r.pinned));
  assert.equal(await val(db, "select status from posts where slug = 'rascunho'"), 'published');
});
dbTest('republicar um post que já está na vitrine não derruba outro nem deixa buraco', async (db) => {
  const a = as(db, 'authenticated', ID.admin);
  for (const s of ['p04', 'p05', 'p06', 'p07', 'p08', 'p09']) await a('select publish_post($1)', [await postId(db, s)]);
  await a('select publish_post($1)', [await postId(db, 'p07')]); // estava no meio
  const rows = (
    await db.query(
      `select p.slug, l.position from daily_lineup l join posts p on p.id = l.post_id where l.day = ${TODAY} order by 2`,
    )
  ).rows;
  assert.deepEqual(
    rows.map((r) => r.position),
    [0, 1, 2, 3, 4, 5],
    'posições com buraco',
  );
  assert.deepEqual(
    rows.map((r) => r.slug),
    ['p07', 'p09', 'p08', 'p06', 'p05', 'p04'],
  );
});
dbTest('publicar nunca passa de 6 posts na vitrine e não duplica ao republicar', async (db) => {
  const a = as(db, 'authenticated', ID.admin);
  for (const s of ['p04', 'p05', 'p06', 'p07', 'p08', 'p09', 'p10', 'p10'])
    await a('select publish_post($1)', [await postId(db, s)]);
  const rows = (await db.query(`select post_id from daily_lineup where day = ${TODAY}`)).rows;
  assert.equal(rows.length, 6);
  assert.equal(new Set(rows.map((r) => r.post_id)).size, 6);
});

// ---------- curtidas
dbTest('visitante NÃO curte', async (db) => {
  await as(db, 'anon').denied('insert into likes values ($1,$2)', [ID.reader, await postId(db, 'p01')]);
});
dbTest('leitora curte como ela mesma; o contador sobe e desce', async (db) => {
  const r = as(db, 'authenticated', ID.reader),
    p = await postId(db, 'p01');
  await r('insert into likes values ($1,$2)', [ID.reader, p]);
  assert.equal(await val(db, 'select likes_count from posts where id = $1', [p]), 1);
  await r('delete from likes where post_id = $1 and user_id = $2', [p, ID.reader]);
  assert.equal(await val(db, 'select likes_count from posts where id = $1', [p]), 0);
});
dbTest('leitora NÃO curte em nome de outra pessoa', async (db) => {
  await as(db, 'authenticated', ID.reader).denied('insert into likes values ($1,$2)', [
    ID.reader2,
    await postId(db, 'p01'),
  ]);
});
dbTest('leitora só enxerga e só desfaz as PRÓPRIAS curtidas', async (db) => {
  const p = await postId(db, 'p01');
  await db.query('insert into likes values ($1,$2)', [ID.reader2, p]);
  const r = as(db, 'authenticated', ID.reader);
  assert.equal((await r('select 1 from likes')).length, 0);
  assert.equal((await r('delete from likes where user_id = $1 returning 1', [ID.reader2])).length, 0);
  assert.equal(await val(db, 'select likes_count from posts where id = $1', [p]), 1);
});

// ---------- views
dbTest('ninguém lê post_views direto (só via register_view)', async (db) => {
  await as(db, 'anon').denied('select * from post_views');
  await as(db, 'authenticated', ID.reader).denied('select * from post_views');
});
dbTest('register_view: visitante conta 1 view por dia, repetir não soma', async (db) => {
  const p = await postId(db, 'p01'),
    a = as(db, 'anon');
  await a('select register_view($1, $2)', [p, 'visitante-1']);
  await a('select register_view($1, $2)', [p, 'visitante-1']);
  assert.equal(await val(db, 'select views_count from posts where id = $1', [p]), 1);
  await a('select register_view($1, $2)', [p, 'visitante-2']);
  assert.equal(await val(db, 'select views_count from posts where id = $1', [p]), 2);
});
dbTest('register_view ignora post em rascunho e post inexistente', async (db) => {
  const a = as(db, 'anon');
  await a('select register_view($1, $2)', [await postId(db, 'rascunho'), 'v']);
  await a('select register_view($1, $2)', [ID.nobody, 'v']);
  assert.equal(await val(db, 'select count(*)::int from post_views'), 0);
});
dbTest('register_view trunca chave gigante em 64 caracteres (não deixa encher o banco)', async (db) => {
  await as(db, 'anon')('select register_view($1, $2)', [await postId(db, 'p01'), 'x'.repeat(500)]);
  assert.equal(await val(db, 'select max(char_length(viewer_key))::int from post_views'), 64);
});

// ---------- perfis, contas e storage
dbTest('leitora só lê o PRÓPRIO perfil e não edita o de outra', async (db) => {
  const r = as(db, 'authenticated', ID.reader);
  const rows = await r('select id from profiles');
  assert.deepEqual(
    rows.map((x) => x.id),
    [ID.reader],
  );
  assert.equal((await r("update profiles set name = 'HACK' where id = $1 returning id", [ID.reader2])).length, 0);
});
dbTest('visitante não lê perfis', async (db) => {
  await as(db, 'anon').denied('select * from profiles');
});
dbTest(
  'novo usuário: nome vem do Google (name / full_name); nome curto ou vazio vira "Leitor"; gigante é cortado em 60',
  async (db) => {
    assert.equal(await val(db, 'select name from profiles where id = $1', [ID.reader]), 'Leitora Um');
    assert.equal(await val(db, 'select name from profiles where id = $1', [ID.reader2]), 'Leitora Dois');
    await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000c1','a@a','{"name":"X"}'),
    ('00000000-0000-0000-0000-0000000000c2','b@b','{}'),
    ('00000000-0000-0000-0000-0000000000c3','c@c', jsonb_build_object('name', repeat('n', 200)))`);
    const names = (
      await db.query(
        `select id, name from profiles where id::text like '00000000-0000-0000-0000-0000000000c%' order by id`,
      )
    ).rows.map((r) => r.name);
    assert.equal(names[0], 'Leitor');
    assert.equal(names[1], 'Leitor');
    assert.equal(names[2].length, 60);
  },
);
dbTest('excluir conta apaga perfil e curtidas e desconta o contador de curtidas do post', async (db) => {
  const p = await postId(db, 'p01');
  await db.query('insert into likes values ($1,$2)', [ID.reader, p]);
  assert.equal(await val(db, 'select likes_count from posts where id = $1', [p]), 1);
  await db.query('delete from auth.users where id = $1', [ID.reader]);
  assert.equal(await val(db, 'select count(*)::int from profiles where id = $1', [ID.reader]), 0);
  assert.equal(await val(db, 'select count(*)::int from likes where user_id = $1', [ID.reader]), 0);
  assert.equal(await val(db, 'select likes_count from posts where id = $1', [p]), 0);
});
dbTest('tema que ainda tem posts não pode ser apagado (nem pelo admin)', async (db) => {
  await as(db, 'authenticated', ID.admin).denied(
    "delete from themes where slug = 'moda'",
    undefined,
    /foreign key|violates/i,
  );
});
dbTest('storage: leitora NÃO envia arquivo ao bucket de fotos; admin envia', async (db) => {
  await as(db, 'authenticated', ID.reader).denied(
    "insert into storage.objects(bucket_id, name) values ('photos', 'posts/hack.webp')",
  );
  await as(db, 'anon').denied("insert into storage.objects(bucket_id, name) values ('photos', 'posts/hack.webp')");
  await as(
    db,
    'authenticated',
    ID.admin,
  )("insert into storage.objects(bucket_id, name) values ('photos', 'posts/ok.webp')");
});
dbTest('bucket de fotos só aceita JPG/PNG/WebP e até 10 MB', async (db) => {
  const b = await one(db, "select file_size_limit, allowed_mime_types from storage.buckets where id = 'photos'");
  assert.equal(Number(b.file_size_limit), 10485760);
  assert.deepEqual([...b.allowed_mime_types].sort(), ['image/jpeg', 'image/png', 'image/webp']);
});
