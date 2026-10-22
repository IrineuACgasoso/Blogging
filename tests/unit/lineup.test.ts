import { describe, it, expect, vi } from 'vitest';
import { parseInputs, planLineup, runDailyLineup, type LineupDeps, type LineupInputs } from '../../lib/lineup';

const now = new Date('2026-10-20T12:00:00Z');
type Fresh = Extract<LineupInputs, { already_ran: false }>;

const post = (id: string, theme = 't1', o: Partial<Fresh['posts'][number]> = {}): Fresh['posts'][number] => ({
  id,
  theme_id: theme,
  published_at: '2026-10-18T12:00:00Z',
  last_shown_at: null,
  queue_level: 0,
  likes_count: 0,
  views7d: 0,
  ...o,
});
const inputs = (o: Partial<Fresh> = {}): Fresh => ({
  already_ran: false,
  posts: [post('a', 't1'), post('b', 't2'), post('c', 't3'), post('d', 't4')],
  themes: [
    { id: 't1', last_shown_on: null },
    { id: 't2', last_shown_on: null },
    { id: 't3', last_shown_on: null },
    { id: 't4', last_shown_on: null },
  ],
  pinned: [],
  ...o,
});

describe('parseInputs', () => {
  it('aceita "já rodou" sem exigir o resto', () => {
    expect(parseInputs({ already_ran: true })).toEqual({ already_ran: true });
  });
  it('aceita um payload completo', () => {
    expect(parseInputs(inputs()).already_ran).toBe(false);
  });
  it.each([
    ['null', null],
    ['sem already_ran', { posts: [], themes: [], pinned: [] }],
    ['sem listas', { already_ran: false }],
    ['nível inválido', { ...inputs(), posts: [post('a', 't1', { queue_level: 7 as any })] }],
    ['views como texto', { ...inputs(), posts: [{ ...post('a'), views7d: '3' }] }],
    ['tema sem id', { ...inputs(), themes: [{ last_shown_on: null }] }],
  ])('rejeita payload malformado: %s', (_n, raw) => {
    expect(() => parseInputs(raw)).toThrow();
  });
});

describe('planLineup', () => {
  it('nunca escolhe posts já fixados e desconta as vagas deles', () => {
    // 3 vagas - 2 fixados = 1 vaga; varre todo o intervalo do sorteio para cobrir cada post
    for (let i = 0; i < 100; i++) {
      const out = planLineup(inputs({ pinned: ['a', 'b'] }), now, 3, () => (i + 0.5) / 100);
      expect(out).toHaveLength(1);
      expect(['a', 'b']).not.toContain(out[0]);
    }
  });
  it('respeita o número de vagas e não repete ids', () => {
    const out = planLineup(inputs(), now, 3);
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
  });
  it('sem vagas sobrando, devolve vazio', () => {
    expect(planLineup(inputs({ pinned: ['a', 'b', 'c'] }), now, 3)).toEqual([]);
    expect(planLineup(inputs({ pinned: ['a', 'b', 'c', 'd'] }), now, 3)).toEqual([]);
  });
  it('sem posts publicados, devolve vazio', () => {
    expect(planLineup(inputs({ posts: [] }), now, 6)).toEqual([]);
  });
  it('usa o nível já rebaixado: nível 3 quase nunca vence nível 0 (rng fixo no meio)', () => {
    const pool = inputs({ posts: [post('alto', 't1', { queue_level: 0 }), post('baixo', 't2', { queue_level: 3 })] });
    let alto = 0;
    for (let i = 0; i < 200; i++) if (planLineup(pool, now, 1, () => (i + 0.5) / 200)[0] === 'alto') alto++;
    expect(alto).toBeGreaterThan(110); // peso nível 0 (1) vs nível 3 (0.25)
  });
  it('tema parado há mais tempo ganha vantagem sobre o recém-exibido', () => {
    const base = { posts: [post('novo', 't1'), post('velho', 't2')] };
    const ins = inputs({
      ...base,
      themes: [
        { id: 't1', last_shown_on: '2026-10-19' },
        { id: 't2', last_shown_on: '2026-09-01' },
      ],
    });
    let velho = 0;
    for (let i = 0; i < 200; i++) if (planLineup(ins, now, 1, () => (i + 0.5) / 200)[0] === 'velho') velho++;
    expect(velho).toBeGreaterThan(100);
  });
});

function deps(
  over: Partial<LineupDeps> = {},
): LineupDeps & { commit: ReturnType<typeof vi.fn>; readInputs: ReturnType<typeof vi.fn> } {
  return {
    readInputs: vi.fn(async () => inputs()),
    commit: vi.fn(async () => true),
    log: vi.fn(),
    ...over,
  } as any;
}

describe('runDailyLineup', () => {
  it('caminho feliz: lê, planeja e grava uma única vez', async () => {
    const d = deps();
    const out = await runDailyLineup('2026-10-20', now, 3, d);
    expect(out.status).toBe(200);
    expect(d.readInputs).toHaveBeenCalledTimes(1);
    expect(d.commit).toHaveBeenCalledTimes(1);
    const [day, items, slots] = d.commit.mock.calls[0];
    expect([day, slots]).toEqual(['2026-10-20', 3]);
    expect(items).toHaveLength(3);
    expect(out.body).toEqual({ day: '2026-10-20', items });
  });
  it('dia já fechado: pula sem calcular nem gravar', async () => {
    const d = deps({ readInputs: vi.fn(async () => ({ already_ran: true })) });
    const out = await runDailyLineup('2026-10-20', now, 6, d);
    expect(out).toEqual({ status: 200, body: { skipped: 'already ran today' } });
    expect(d.commit).not.toHaveBeenCalled();
  });
  it('perdeu a corrida (commit devolve false): pula, sem erro', async () => {
    const d = deps({ commit: vi.fn(async () => false) });
    const out = await runDailyLineup('2026-10-20', now, 6, d);
    expect(out).toEqual({ status: 200, body: { skipped: 'already ran today' } });
  });
  it('falha na leitura: 500, nada gravado, mensagem sem vazar detalhes', async () => {
    const d = deps({
      readInputs: vi.fn(async () => {
        throw new Error('connection reset: secret-detail');
      }),
    });
    const out = await runDailyLineup('2026-10-20', now, 6, d);
    expect(out.status).toBe(500);
    expect(JSON.stringify(out.body)).not.toContain('secret-detail');
    expect(d.commit).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalled();
  });
  it('payload inesperado do banco: 500 e nada gravado', async () => {
    const d = deps({ readInputs: vi.fn(async () => ({ ops: true })) });
    const out = await runDailyLineup('2026-10-20', now, 6, d);
    expect(out.status).toBe(500);
    expect(d.commit).not.toHaveBeenCalled();
  });
  it('falha na gravação: 500 e a MESMA chamada pode ser repetida (sem estado preso)', async () => {
    let calls = 0;
    const d = deps({
      commit: vi.fn(async () => {
        if (++calls === 1) throw new Error('boom');
        return true;
      }),
    });
    expect((await runDailyLineup('2026-10-20', now, 6, d)).status).toBe(500);
    expect((await runDailyLineup('2026-10-20', now, 6, d)).status).toBe(200);
    expect(d.commit).toHaveBeenCalledTimes(2);
  });
});
