import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BLOG_NAME, todayRecife, type PostCardData } from '../lib/utils';
import PostCard from '../components/PostCard';

const SLOTS = 6;
const SEL = 'id,slug,title,published_at,themes(name,slug)';

export default function Home() {
  const [items, setItems] = useState<PostCardData[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data: l } = await supabase
        .from('daily_lineup').select(`position, posts(${SEL})`)
        .eq('day', todayRecife()).order('position');
      const list: PostCardData[] = ((l ?? []) as any[]).map((r) => r.posts).filter(Boolean);

      // Fallback: antes do primeiro cron do dia (ou se ele falhar), completa com os mais recentes.
      if (list.length < SLOTS) {
        const { data: recent } = await supabase
          .from('posts').select(SEL).eq('status', 'published')
          .order('published_at', { ascending: false }).limit(SLOTS);
        for (const p of (recent ?? []) as any[]) {
          if (list.length >= SLOTS) break;
          if (!list.some((x) => x.id === p.id)) list.push(p);
        }
      }
      setItems(list);
    })();
  }, []);

  return (
    <>
      <h1 className="masthead">{BLOG_NAME}</h1>
      {items === null && <p className="empty">Carregando…</p>}
      {items?.length === 0 && <p className="empty">Ainda não há publicações. Volte em breve.</p>}
      <div className="grid">{items?.map((p, i) => <PostCard key={p.id} post={p} index={i} />)}</div>
    </>
  );
}
