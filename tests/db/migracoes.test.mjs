// Estrutura do banco: migrações aplicam do zero, podem repetir, e a base nasce fechada (RLS em tudo).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../lib/harness.mjs';
import { getDb, dbTest, migrationFiles, val, assert } from '../lib/pg.mjs';

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase');

test('as migrações (schema + 002, 003, 004...) aplicam em banco limpo, na ordem', async () => {
  const db = await getDb();
  assert.ok(migrationFiles().length >= 4);
  assert.equal(await val(db, "select to_regclass('public.posts') is not null"), true);
  assert.equal(await val(db, "select to_regprocedure('public.commit_day(date,uuid[],integer)') is not null"), true);
});

for (const f of ['003_google_login.sql', '004_cron_atomico.sql']) {
  dbTest(`${f} pode ser rodada de novo sem erro (idempotente)`, async (db) => {
    await db.exec(readFileSync(join(sqlDir, f), 'utf8'));
  });
}

dbTest('toda tabela do schema public tem RLS ligada', async (db) => {
  const rows = (
    await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)
  ).rows;
  assert.deepEqual(
    rows.map((r) => r.relname),
    [],
  );
});

dbTest('visitante (anon) não tem permissão de escrita em NENHUMA tabela pública', async (db) => {
  const rows = (
    await db.query(`select table_name, privilege_type from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')`)
  ).rows;
  assert.deepEqual(rows, []);
});

dbTest('tabelas sensíveis não têm nenhuma policy: admins, post_views, lineup_runs', async (db) => {
  const rows = (
    await db.query(
      `select tablename from pg_policies where schemaname='public' and tablename in ('admins','post_views','lineup_runs')`,
    )
  ).rows;
  assert.deepEqual(rows, []);
});

dbTest('visitante e leitor logado não têm EXECUTE nas funções do cron', async (db) => {
  const fns = [
    'closing_posts(date)',
    'closing_themes(date)',
    'lineup_inputs(date)',
    'commit_day(date,uuid[],integer)',
    'close_day(date)',
    'open_day(date,uuid[])',
  ];
  const bad = [];
  for (const fn of fns)
    for (const role of ['anon', 'authenticated'])
      if (await val(db, `select has_function_privilege('${role}', '${fn}', 'execute')`)) bad.push(`${role} -> ${fn}`);
  assert.deepEqual(bad, []);
});

dbTest(
  'visitante sem login não tem EXECUTE em publish_post; leitora logada tem (o is_admin() interno barra)',
  async (db) => {
    assert.equal(await val(db, "select has_function_privilege('anon', 'publish_post(uuid)', 'execute')"), false);
    assert.equal(
      await val(db, "select has_function_privilege('authenticated', 'publish_post(uuid)', 'execute')"),
      true,
    );
  },
);

dbTest('só o service_role (cron) executa as funções do cron', async (db) => {
  for (const fn of ['lineup_inputs(date)', 'commit_day(date,uuid[],integer)'])
    assert.equal(await val(db, `select has_function_privilege('service_role', '${fn}', 'execute')`), true, fn);
});

dbTest('apenas admin pode escrever no bucket de fotos (policies do storage)', async (db) => {
  const rows = (
    await db.query(
      `select policyname, cmd, qual, with_check from pg_policies where schemaname='storage' and tablename='objects'`,
    )
  ).rows;
  assert.ok(rows.length >= 4);
  for (const r of rows)
    assert.match(`${r.qual ?? ''} ${r.with_check ?? ''}`, /is_admin/, `policy sem is_admin: ${r.policyname}`);
});
