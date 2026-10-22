import { pickLineup, type Cand } from './scheduler.js';

// Regra de negócio da virada do dia, sem I/O: o handler lê do banco (lineup_inputs), chama isto e grava
// o resultado (commit_day). Assim a parte que decide fica testável e a parte que grava é uma transação só.

export type LineupInputs =
  | { already_ran: true }
  | {
      already_ran: false;
      posts: {
        id: string;
        theme_id: string;
        published_at: string;
        last_shown_at: string | null;
        queue_level: 0 | 1 | 2 | 3;
        likes_count: number;
        views7d: number;
      }[];
      themes: { id: string; last_shown_on: string | null }[];
      pinned: string[];
    };

const DAY = 864e5;
const NEVER_SHOWN_IDLE_DAYS = 10; // tema que nunca apareceu conta como "parado há 10 dias"

const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !isArr(v);

/** Confere o formato devolvido pelo banco. Falha fechado: payload estranho => erro, nada é gravado. */
export function parseInputs(raw: unknown): LineupInputs {
  if (!isRecord(raw) || typeof raw.already_ran !== 'boolean') throw new Error('lineup_inputs: resposta inesperada');
  if (raw.already_ran) return { already_ran: true };
  if (!isArr(raw.posts) || !isArr(raw.themes) || !isArr(raw.pinned)) throw new Error('lineup_inputs: listas ausentes');
  for (const p of raw.posts) {
    if (
      !isRecord(p) ||
      typeof p.id !== 'string' ||
      typeof p.theme_id !== 'string' ||
      typeof p.published_at !== 'string' ||
      ![0, 1, 2, 3].includes(p.queue_level as number) ||
      typeof p.likes_count !== 'number' ||
      typeof p.views7d !== 'number'
    ) {
      throw new Error('lineup_inputs: post malformado');
    }
  }
  for (const t of raw.themes) {
    if (!isRecord(t) || typeof t.id !== 'string') throw new Error('lineup_inputs: tema malformado');
  }
  return raw as LineupInputs;
}

/** Escolhe a vitrine do dia: ids na ordem de exibição (sem os já fixados, que o banco preserva). */
export function planLineup(
  inputs: Extract<LineupInputs, { already_ran: false }>,
  now: Date,
  slots: number,
  rng: () => number = Math.random,
): string[] {
  const pinned = new Set(inputs.pinned);
  const pool: Cand[] = inputs.posts
    .filter((p) => !pinned.has(p.id))
    .map((p) => ({
      id: p.id,
      themeId: p.theme_id,
      level: p.queue_level,
      publishedAt: new Date(p.published_at),
      lastShownAt: p.last_shown_at ? new Date(p.last_shown_at) : null,
      views7d: p.views7d,
      likes: p.likes_count,
    }));

  const idle = new Map<string, number>(
    inputs.themes.map((t) => [
      t.id,
      t.last_shown_on ? (now.getTime() - new Date(t.last_shown_on).getTime()) / DAY : NEVER_SHOWN_IDLE_DAYS,
    ]),
  );

  return pickLineup(pool, idle, now, Math.max(0, slots - pinned.size), rng);
}

export type LineupDeps = {
  /** Chama lineup_inputs(dia). Lança erro em caso de falha. */
  readInputs(day: string): Promise<unknown>;
  /** Chama commit_day(dia, itens, vagas). Retorna false se outra execução já fechou o dia. Lança erro em falha. */
  commit(day: string, items: string[], slots: number): Promise<boolean>;
  log?(message: string, err: unknown): void;
};

export type LineupOutcome =
  | { status: 200; body: { day: string; items: string[] } | { skipped: string } }
  | { status: 500; body: { error: string } };

/**
 * Virada do dia em duas etapas: (1) leitura única, (2) gravação única e atômica.
 * Qualquer falha antes ou durante a gravação não deixa NADA para trás, então chamar de novo é sempre seguro.
 */
export async function runDailyLineup(
  day: string,
  now: Date,
  slots: number,
  deps: LineupDeps,
  rng?: () => number,
): Promise<LineupOutcome> {
  try {
    const inputs = parseInputs(await deps.readInputs(day));
    if (inputs.already_ran) return { status: 200, body: { skipped: 'already ran today' } };

    const items = planLineup(inputs, now, slots, rng);
    if (!(await deps.commit(day, items, slots))) return { status: 200, body: { skipped: 'already ran today' } }; // outra execução ganhou a corrida
    return { status: 200, body: { day, items } };
  } catch (err) {
    deps.log?.('daily lineup failed', err);
    return { status: 500, body: { error: 'lineup failed; nothing was changed, safe to retry' } };
  }
}
