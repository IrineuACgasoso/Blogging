// Escalonador MLFQ puro (sem I/O) para ser testável.
export type Cand = {
  id: string; themeId: string;
  publishedAt: Date; lastShownAt: Date | null;
  level: 0 | 1 | 2 | 3;
  views7d: number; likes: number;
};

const LEVEL_W = [1, 0.65, 0.4, 0.25]; // níveis mais baixos pesam menos
const DAY = 864e5;
const days = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / DAY);

export function baseScore(p: Cand, now: Date): number {
  const age = days(p.publishedAt, now);
  const sinceShown = days(p.lastShownAt ?? p.publishedAt, now);
  const recency = Math.exp(-age / 7);                // novo = alto, decai em ~2 semanas
  const starvation = 1 - Math.exp(-sinceShown / 30); // limbo cresce; zera ao ser exibido
  const heat = Math.min(1, Math.log1p(p.views7d + 3 * p.likes) / Math.log(100));
  return LEVEL_W[p.level] * (0.05 + 1.0 * recency + 0.8 * starvation + 0.6 * heat);
}

/** Amostragem ponderada sem reposição; tema repetido no mesmo dia é fortemente penalizado. */
export function pickLineup(
  pool: Cand[], themeIdleDays: Map<string, number>, now: Date, slots: number,
  rng: () => number = Math.random,
): string[] {
  const left = [...pool];
  const picked: string[] = [];
  const perTheme = new Map<string, number>();
  while (picked.length < slots && left.length) {
    const w = left.map((p) => {
      const idleBoost = 1 + Math.min(themeIdleDays.get(p.themeId) ?? 10, 10) * 0.1;
      const repeat = Math.pow(0.15, perTheme.get(p.themeId) ?? 0);
      return baseScore(p, now) * idleBoost * repeat;
    });
    const total = w.reduce((a, b) => a + b, 0);
    let r = rng() * total, idx = 0;
    while (idx < w.length - 1 && (r -= w[idx]) > 0) idx++;
    const [p] = left.splice(idx, 1);
    picked.push(p.id);
    perTheme.set(p.themeId, (perTheme.get(p.themeId) ?? 0) + 1);
  }
  return picked;
}
