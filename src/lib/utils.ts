export const BLOG_NAME = import.meta.env.VITE_BLOG_NAME || 'Meu Blog';

export const todayRecife = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' }).format(new Date());

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Recife',
  });

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '') || 'item';

// Identificador anônimo para contar views de quem não tem conta (1 view/dia/visitante).
export function getViewerKey(): string {
  try {
    let k = localStorage.getItem('viewer_key');
    if (!k) {
      k = crypto.randomUUID();
      localStorage.setItem('viewer_key', k);
    }
    return k;
  } catch {
    return 'anon';
  }
}

export type PostCardData = {
  id: string;
  slug: string;
  title: string;
  published_at: string;
  themes: { name: string; slug: string } | null;
};

// Aleatoriedade determinística (mesma "colagem" durante o dia, muda no dia seguinte).
export const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
export function seededRng(seed: string) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Texto de um erro vindo de try/catch ou do Supabase (que devolve objeto simples com `message`, não `Error`). */
export function errMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  return fallback;
}
