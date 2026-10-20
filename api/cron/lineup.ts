import { createClient } from '@supabase/supabase-js';
import { pickLineup, type Cand } from '../../lib/scheduler';

const SLOTS = 6;

export default async function handler(req: any, res: any) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();

  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const now = new Date();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' }).format(now); // YYYY-MM-DD

  const { data: first, error: e1 } = await sb.rpc('close_day', { p_day: day });
  if (e1) return res.status(500).json({ error: e1.message });
  if (!first) return res.status(200).json({ skipped: 'already ran today' }); // idempotente

  const since = new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const [{ data: posts }, { data: themes }, { data: views }, { data: pinned }] = await Promise.all([
    sb.from('posts').select('id,theme_id,published_at,last_shown_at,queue_level,likes_count').eq('status', 'published'),
    sb.from('themes').select('id,last_shown_on'),
    sb.from('post_views').select('post_id').gte('day', since),
    sb.from('daily_lineup').select('post_id').eq('day', day).eq('pinned', true),
  ]);

  const v7 = new Map<string, number>();
  (views ?? []).forEach((v: any) => v7.set(v.post_id, (v7.get(v.post_id) ?? 0) + 1));
  const pinnedIds = new Set((pinned ?? []).map((p: any) => p.post_id));

  const pool: Cand[] = (posts ?? [])
    .filter((p: any) => !pinnedIds.has(p.id))
    .map((p: any) => ({
      id: p.id, themeId: p.theme_id, level: p.queue_level,
      publishedAt: new Date(p.published_at),
      lastShownAt: p.last_shown_at ? new Date(p.last_shown_at) : null,
      views7d: v7.get(p.id) ?? 0, likes: p.likes_count,
    }));

  const idle = new Map<string, number>();
  (themes ?? []).forEach((t: any) =>
    idle.set(t.id, t.last_shown_on ? (now.getTime() - new Date(t.last_shown_on).getTime()) / 864e5 : 10));

  const items = pickLineup(pool, idle, now, Math.max(0, SLOTS - pinnedIds.size));
  const { error: e2 } = await sb.rpc('open_day', { p_day: day, p_items: items });
  if (e2) return res.status(500).json({ error: e2.message });
  res.status(200).json({ day, items });
}
