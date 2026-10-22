// Banco de testes: Postgres real (PGlite, roda em WebAssembly, sem instalar nada) com os SQLs do projeto.
// Um único banco é criado e compartilhado; cada teste roda dentro de uma transação que é desfeita no fim.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { test, assert } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const sqlDir = join(ROOT, 'supabase');

export const ID = {
  admin: '00000000-0000-0000-0000-0000000000a1',
  reader: '00000000-0000-0000-0000-0000000000b1',
  reader2: '00000000-0000-0000-0000-0000000000b2',
  nobody: '00000000-0000-0000-0000-0000000000ff',
};
export const TODAY = "(now() at time zone 'America/Recife')::date";

/** Arquivos SQL do projeto na ordem de execução: schema.sql, depois 002_..., 003_..., etc. */
export const migrationFiles = () => [
  'schema.sql',
  ...readdirSync(sqlDir)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort(),
];

let dbPromise;
export function getDb() {
  return (dbPromise ??= (async () => {
    const db = new PGlite();
    await db.exec(readFileSync(join(HERE, '..', 'db', 'shim.sql'), 'utf8'));
    for (const f of migrationFiles()) await db.exec(readFileSync(join(sqlDir, f), 'utf8'));
    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data) values
        ('${ID.admin}',   'admin@t.com',   '{"name":"Autora"}'),
        ('${ID.reader}',  'leitor@t.com',  '{"name":"Leitora Um"}'),
        ('${ID.reader2}', 'leitor2@t.com', '{"full_name":"Leitora Dois"}');
      insert into admins values ('${ID.admin}');
      insert into themes (slug, name) values ('moda','Moda'), ('arte','Arte'), ('poesia','Poesia');
      insert into posts (slug, title, body, theme_id, status, published_at)
        select 'p'||lpad(g::text,2,'0'), 'Post '||g, 'corpo', (select id from themes order by slug offset (g % 3) limit 1),
               'published', now() - (g || ' days')::interval from generate_series(1,10) g;
      insert into posts (slug, title, body, theme_id, status)
        values ('rascunho', 'Rascunho secreto', 'x', (select id from themes limit 1), 'draft');
      -- ontem a vitrine teve p01, p02, p03
      insert into daily_lineup select ${TODAY} - 1, row_number() over (order by slug) - 1, id, false
        from posts where slug in ('p01','p02','p03');
    `);
    return db;
  })());
}

/** Executa SQL com a identidade de um papel do Supabase (anon / authenticated / service_role). */
export function as(db, role, uid = '') {
  const run = async (sql, params) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
    await db.exec(`set role ${role}`);
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      try {
        await db.exec('reset role');
      } catch {
        /* transação abortada: o savepoint restaura o papel */
      }
    }
  };
  /** Exige que o SQL seja NEGADO (erro de permissão/RLS/forbidden). Falha se funcionar ou se der outro erro. */
  run.denied = async (sql, params, re = /permission denied|row-level security|forbidden/i) => {
    await db.exec('savepoint negado');
    let err;
    try {
      await run(sql, params);
    } catch (e) {
      err = e;
    }
    if (err) await db.exec('rollback to savepoint negado');
    await db.exec('release savepoint negado');
    assert.ok(err, `DEVERIA ter sido negado, mas funcionou: ${sql}`);
    assert.match(err.message, re, `negado, mas por motivo inesperado: ${err.message}`);
  };
  return run;
}

/** Registra um teste de banco: roda dentro de uma transação desfeita no final (um teste não afeta o outro). */
export function dbTest(name, fn) {
  test(name, async () => {
    const db = await getDb();
    await db.exec('begin');
    try {
      await fn(db);
    } finally {
      try {
        await db.exec('reset role');
      } catch {
        /* já abortada */
      }
      await db.exec('rollback');
    }
  });
}

export const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
export const val = async (db, sql, params) => Object.values((await one(db, sql, params)) ?? {})[0];
export { assert };
