import { describe, it, expect } from 'vitest';
import { baseScore, pickLineup, type Cand } from './scheduler';

const now = new Date('2026-10-20T12:00:00Z');
const mk = (id: string, themeId: string, ageDays: number, o: Partial<Cand> = {}): Cand => ({
  id, themeId, publishedAt: new Date(now.getTime() - ageDays * 864e5),
  lastShownAt: null, level: 0, views7d: 0, likes: 0, ...o,
});

describe('scheduler', () => {
  it('post recente pontua mais que post médio', () => {
    expect(baseScore(mk('a', 't', 0), now)).toBeGreaterThan(baseScore(mk('b', 't', 20), now));
  });
  it('post esquecido por muito tempo volta a subir (anti-limbo)', () => {
    expect(baseScore(mk('a', 't', 200), now)).toBeGreaterThan(baseScore(mk('b', 't', 30), now));
  });
  it('exibir rebaixa: nível maior pontua menos', () => {
    expect(baseScore(mk('a', 't', 3, { level: 0 }), now)).toBeGreaterThan(baseScore(mk('a', 't', 3, { level: 2 }), now));
  });
  it('não repete ids e respeita slots', () => {
    const pool = Array.from({ length: 10 }, (_, i) => mk(`p${i}`, `t${i % 3}`, i));
    const out = pickLineup(pool, new Map(), now, 6);
    expect(out).toHaveLength(6);
    expect(new Set(out).size).toBe(6);
  });
  it('quase nunca repete tema quando há alternativa', () => {
    const pool = [mk('m1', 'moda', 1), mk('m2', 'moda', 1), mk('a1', 'arte', 1), mk('p1', 'poesia', 1)];
    let repeated = 0;
    for (let i = 0; i < 300; i++) {
      const [a, b] = pickLineup(pool, new Map(), now, 2);
      if (a.startsWith('m') && b.startsWith('m')) repeated++;
    }
    expect(repeated).toBeLessThan(25); // sem penalidade seria ~50
  });
});
