export const BLOG_NAME = import.meta.env.VITE_BLOG_NAME || 'Meu Blog';

export const todayRecife = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' }).format(new Date());

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Recife' });

export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';

// Identificador anônimo para contar views de quem não tem conta (1 view/dia/visitante).
export function getViewerKey(): string {
  try {
    let k = localStorage.getItem('viewer_key');
    if (!k) { k = crypto.randomUUID(); localStorage.setItem('viewer_key', k); }
    return k;
  } catch { return 'anon'; }
}

export type PostCardData = {
  id: string; slug: string; title: string; published_at: string;
  themes: { name: string; slug: string } | null;
};
