// Virada do dia no banco: lineup_inputs (leitura) + commit_day (gravação atômica).
import { dbTest, as, ID, TODAY, val, assert } from '../lib/pg.mjs';

const svc = (db) => as(db, 'service_role');
const day = (db) => val(db, `select ${TODAY}::text`);
const pid = (db, slug) => val(db, 'select id from posts where slug = $1', [slug]);
const ids = async (db, ...slugs) => Promise.all(slugs.map((s) => pid(db, s)));
const lineup = async (db) =>
  (
    await db.query(
      `select p.slug, l.position, l.pinned from daily_lineup l join posts p on p.id = l.post_id where l.day = ${TODAY} order by l.position`,
    )
  ).rows;
const inputs = async (db) => (await svc(db)('select lineup_inputs($1::date) j', [await day(db)]))[0].j;
const commit = async (db, items, slots = 6) =>
  (await svc(db)('select commit_day($1::date, $2::uuid[], $3) r', [await day(db), items, slots]))[0].r;
const level = (db, slug) => val(db, 'select queue_level from posts where slug = $1', [slug]);

dbTest('lineup_inputs: antes de rodar o dia, já_ran = false e só posts PUBLICADOS entram', async (db) => {
  const j = await inputs(db);
  assert.equal(j.already_ran, false);
  assert.equal(j.posts.length, 10); // rascunho fica de fora
});
dbTest('lineup_inputs é só leitura: não altera nenhum post nem marca o dia', async (db) => {
  await inputs(db);
  assert.equal(await level(db, 'p01'), 0);
  assert.equal(await val(db, 'select count(*)::int from lineup_runs'), 0);
});
dbTest('lineup_inputs: já mostra os posts de ontem rebaixados (nível 1) sem gravar', async (db) => {
  const j = await inputs(db);
  const lv = Object.fromEntries(j.posts.map((p) => [p.id, p.queue_level]));
  assert.equal(lv[await pid(db, 'p01')], 1);
  assert.equal(lv[await pid(db, 'p03')], 1);
  assert.equal(lv[await pid(db, 'p05')], 0);
});
dbTest('lineup_inputs: conta mais de 1000 views sem cortar (antes o limite da API truncava)', async (db) => {
  const p = await pid(db, 'p05');
  await db.query(`insert into post_views select $1, 'v'||g, ${TODAY} - (g % 7) from generate_series(1, 2500) g`, [p]);
  const j = await inputs(db);
  assert.equal(j.posts.find((x) => x.id === p).views7d, 2500);
});
dbTest('lineup_inputs: views com mais de 7 dias não contam', async (db) => {
  const p = await pid(db, 'p05');
  await db.query(`insert into post_views values ($1, 'velho', ${TODAY} - 8), ($1, 'novo', ${TODAY} - 2)`, [p]);
  assert.equal((await inputs(db)).posts.find((x) => x.id === p).views7d, 1);
});
dbTest('lineup_inputs: posts já fixados hoje aparecem em "pinned"', async (db) => {
  await as(db, 'authenticated', ID.admin)('select publish_post($1)', [await pid(db, 'p09')]);
  assert.deepEqual((await inputs(db)).pinned, [await pid(db, 'p09')]);
});

dbTest('commit_day: grava a vitrine na ordem, marca o dia e rebaixa o que saiu ontem', async (db) => {
  assert.equal(await commit(db, await ids(db, 'p04', 'p05', 'p06')), true);
  assert.deepEqual(
    (await lineup(db)).map((r) => r.slug),
    ['p04', 'p05', 'p06'],
  );
  assert.equal(await val(db, 'select count(*)::int from lineup_runs'), 1);
  assert.equal(await level(db, 'p01'), 1);
  assert.equal(await level(db, 'p05'), 0);
});
dbTest('commit_day: o tema dos posts de ontem passa a constar como exibido ontem', async (db) => {
  await commit(db, await ids(db, 'p04'));
  const rows = (
    await db.query(`select t.slug, t.last_shown_on::text d from themes t where t.last_shown_on is not null`)
  ).rows;
  assert.ok(rows.length >= 1);
  const ontem = await val(db, `select (${TODAY} - 1)::text`);
  assert.ok(rows.every((r) => r.d === ontem));
});
dbTest('commit_day: segunda chamada no mesmo dia devolve false e NÃO rebaixa de novo', async (db) => {
  await commit(db, await ids(db, 'p04'));
  assert.equal(await commit(db, await ids(db, 'p05')), false);
  assert.equal(await level(db, 'p01'), 1); // continua 1, não virou 2
  assert.deepEqual(
    (await lineup(db)).map((r) => r.slug),
    ['p04'],
  ); // vitrine intacta
  assert.equal((await inputs(db)).already_ran, true);
});
dbTest('commit_day: o nível nunca passa de 3', async (db) => {
  await db.query("update posts set queue_level = 3 where slug = 'p01'");
  await commit(db, []);
  assert.equal(await level(db, 'p01'), 3);
});
dbTest(
  'commit_day: falha NO MEIO desfaz tudo (dia não fica marcado, nada rebaixado) e a retentativa funciona',
  async (db) => {
    await db.exec(`create function boom() returns trigger language plpgsql as $$ begin raise exception 'falha simulada'; end $$;
                 create trigger boom_t before insert on daily_lineup for each row when (new.pinned = false) execute function boom();`);
    await db.exec('savepoint tentativa');
    let err;
    try {
      await commit(db, await ids(db, 'p04', 'p05'));
    } catch (e) {
      err = e;
    }
    await db.exec('rollback to savepoint tentativa');
    assert.match(err?.message ?? '', /falha simulada/);
    assert.equal(await val(db, 'select count(*)::int from lineup_runs'), 0, 'dia ficou marcado como "já rodou"');
    assert.equal(await level(db, 'p01'), 0, 'post de ontem foi rebaixado mesmo com a falha');
    assert.equal((await inputs(db)).already_ran, false);
    await db.exec('drop trigger boom_t on daily_lineup');
    assert.equal(await commit(db, await ids(db, 'p04', 'p05')), true);
    assert.equal(await level(db, 'p01'), 1);
  },
);
dbTest('commit_day: post publicado no meio-tempo continua no topo e não é duplicado', async (db) => {
  await as(db, 'authenticated', ID.admin)('select publish_post($1)', [await pid(db, 'p09')]);
  await commit(db, await ids(db, 'p09', 'p04', 'p05'));
  const rows = await lineup(db);
  assert.deepEqual(
    rows.map((r) => r.slug),
    ['p09', 'p04', 'p05'],
  );
  assert.equal(rows[0].pinned, true);
});
dbTest('commit_day: ignora repetidos, rascunho e id inexistente', async (db) => {
  const [p4, draft] = await ids(db, 'p04', 'rascunho');
  await commit(db, [p4, p4, draft, ID.nobody, await pid(db, 'p05')]);
  assert.deepEqual(
    (await lineup(db)).map((r) => r.slug),
    ['p04', 'p05'],
  );
});
dbTest('commit_day: nunca passa do número de vagas (6), mesmo recebendo mais itens', async (db) => {
  await commit(db, await ids(db, 'p04', 'p05', 'p06', 'p07', 'p08', 'p09', 'p10'));
  assert.equal((await lineup(db)).length, 6);
});
dbTest('commit_day: com um fixado e vagas = 6, cabem só 5 do cron', async (db) => {
  await as(db, 'authenticated', ID.admin)('select publish_post($1)', [await pid(db, 'p10')]);
  await commit(db, await ids(db, 'p04', 'p05', 'p06', 'p07', 'p08', 'p09'));
  const rows = await lineup(db);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].slug, 'p10');
});
dbTest('commit_day: lista vazia e valor nulo não quebram (dia fechado com vitrine vazia)', async (db) => {
  assert.equal(await commit(db, null), true);
  assert.equal((await lineup(db)).length, 0);
});
dbTest('commit_day: posições sempre contíguas a partir de 0', async (db) => {
  await commit(db, await ids(db, 'p04', 'p05', 'p06'));
  assert.deepEqual(
    (await lineup(db)).map((r) => r.position),
    [0, 1, 2],
  );
});
dbTest('o que lineup_inputs projetou é exatamente o que commit_day grava (regra não diverge)', async (db) => {
  const j = await inputs(db);
  await commit(db, await ids(db, 'p04'));
  const rows = (await db.query('select id, queue_level, last_shown_at from posts where status = $1', ['published']))
    .rows;
  for (const r of rows) {
    const proj = j.posts.find((p) => p.id === r.id);
    assert.equal(r.queue_level, proj.queue_level, `nível divergiu em ${r.id}`);
    assert.equal(
      r.last_shown_at ? new Date(r.last_shown_at).getTime() : null,
      proj.last_shown_at ? new Date(proj.last_shown_at).getTime() : null,
      `last_shown_at divergiu`,
    );
  }
});
dbTest('visitante e leitora NÃO executam lineup_inputs nem commit_day', async (db) => {
  const d = await day(db);
  for (const who of [as(db, 'anon'), as(db, 'authenticated', ID.reader)]) {
    await who.denied('select lineup_inputs($1::date)', [d]);
    await who.denied('select commit_day($1::date, $2::uuid[], 6)', [d, []]);
  }
});
