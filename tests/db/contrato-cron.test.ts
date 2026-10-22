// Contrato entre o SQL e o TypeScript: a lógica REAL do cron (lib/lineup.ts) falando com o banco REAL (PGlite).
// Só falta o Supabase em si; a função handler faz exatamente estas duas chamadas (rpc).
import { describe, it, expect } from 'vitest';
// @ts-expect-error módulo .mjs de apoio, sem tipos
import { getDb, as, TODAY } from '../lib/pg.mjs';
import { runDailyLineup } from '../../lib/lineup';

const T = 60_000;
async function setup() {
  const db = await getDb();
  const day = (await db.query(`select ${TODAY}::text d`)).rows[0].d as string;
  const svc = as(db, 'service_role');
  const deps = {
    readInputs: async (d: string) => (await svc('select lineup_inputs($1::date) j', [d]))[0].j,
    commit: async (d: string, items: string[], slots: number) =>
      (await svc('select commit_day($1::date, $2::uuid[], $3) r', [d, items, slots]))[0].r === true,
  };
  const lineup = async () =>
    (
      await db.query(
        `select p.slug, l.position from daily_lineup l join posts p on p.id = l.post_id where l.day = ${TODAY} order by 2`,
      )
    ).rows;
  const level = async (slug: string) =>
    (await db.query('select queue_level q from posts where slug = $1', [slug])).rows[0].q as number;
  return { db, day, deps, lineup, level };
}
async function inTx<T>(fn: () => Promise<T>) {
  const db = await getDb();
  await db.exec('begin');
  try {
    return await fn();
  } finally {
    await db.exec('rollback');
  }
}

describe('cron de ponta a ponta (lib/lineup.ts + SQL)', () => {
  it(
    'lê do banco, escolhe 6 posts, grava e rebaixa os de ontem',
    () =>
      inTx(async () => {
        const { day, deps, lineup, level } = await setup();
        const out = await runDailyLineup(day, new Date(), 6, deps);
        expect(out.status).toBe(200);
        const rows = await lineup();
        expect(rows).toHaveLength(6);
        expect(new Set(rows.map((r: any) => r.slug)).size).toBe(6);
        expect(rows.map((r: any) => r.slug)).not.toContain('rascunho');
        expect(await level('p01')).toBe(1);
      }),
    T,
  );

  it(
    'rodar de novo no mesmo dia pula e não rebaixa duas vezes',
    () =>
      inTx(async () => {
        const { day, deps, level } = await setup();
        await runDailyLineup(day, new Date(), 6, deps);
        const again = await runDailyLineup(day, new Date(), 6, deps);
        expect(again).toEqual({ status: 200, body: { skipped: 'already ran today' } });
        expect(await level('p01')).toBe(1);
      }),
    T,
  );

  it(
    'falha no meio devolve 500, não deixa nada para trás e a mesma chamada funciona depois',
    () =>
      inTx(async () => {
        const { db, day, deps, lineup, level } = await setup();
        await db.exec(`create function boom() returns trigger language plpgsql as $$ begin raise exception 'falha simulada'; end $$;
                   create trigger boom_t before insert on daily_lineup for each row when (new.pinned = false) execute function boom();`);
        await db.exec('savepoint s');
        const failing = {
          ...deps,
          commit: async (...a: [string, string[], number]) => {
            try {
              return await deps.commit(...a);
            } finally {
              await db.exec('rollback to savepoint s');
            }
          },
        };
        const out = await runDailyLineup(day, new Date(), 6, failing);
        expect(out.status).toBe(500);
        expect(await lineup()).toHaveLength(0);
        expect(await level('p01')).toBe(0);
        await db.exec('drop trigger boom_t on daily_lineup');
        expect((await runDailyLineup(day, new Date(), 6, deps)).status).toBe(200);
        expect(await lineup()).toHaveLength(6);
        expect(await level('p01')).toBe(1);
      }),
    T,
  );
});
