import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { publicUrl } from '../lib/images';
import { BLOG_NAME, seededRng, shuffle, todayRecife, type PostCardData } from '../lib/utils';
import Collage, { type Piece } from '../components/Collage';

const SLOTS = 6;
const MAX_PHOTOS = 4;
const SEL = 'id,slug,title,published_at,themes(name,slug)';

export default function Home() {
  const [pieces, setPieces] = useState<Piece[] | null>(null);

  useEffect(() => {
    (async () => {
      const day = todayRecife();
      const { data: l } = await supabase.from('daily_lineup').select(`position, posts(${SEL})`).eq('day', day).order('position');
      const list: PostCardData[] = ((l ?? []) as any[]).map((r) => r.posts).filter(Boolean);

      // Fallback: antes do primeiro cron do dia (ou se ele falhar), completa com os mais recentes.
      if (list.length < SLOTS) {
        const { data: recent } = await supabase.from('posts').select(SEL).eq('status', 'published')
          .order('published_at', { ascending: false }).limit(SLOTS);
        for (const p of (recent ?? []) as any[]) {
          if (list.length >= SLOTS) break;
          if (!list.some((x) => x.id === p.id)) list.push(p);
        }
      }

      // Fotos: a mais nova sempre entra; as demais são sorteadas (estável durante o dia).
      const { data: ph } = await supabase.from('photos').select('id,title,path,width,height')
        .order('created_at', { ascending: false }).limit(40);
      const all = ((ph ?? []) as any[]).map((p) => ({ id: p.id, title: p.title, width: p.width, height: p.height, url: publicUrl(p.path) }));
      const rng = seededRng(day);
      const [newest, ...others] = all;
      const photos = newest ? [newest, ...shuffle(others, rng).slice(0, MAX_PHOTOS - 1)] : [];

      // O post recém-publicado/prioritário fica no topo; o resto é misturado.
      const [first, ...rest] = list;
      const mixed = shuffle<Piece>(
        [...rest.map((post) => ({ kind: 'post' as const, post })), ...photos.map((photo) => ({ kind: 'photo' as const, photo }))],
        rng,
      );
      setPieces([...(first ? [{ kind: 'post' as const, post: first }] : []), ...mixed]);
    })();
  }, []);

  return (
    <>
      <h1 className="masthead">{BLOG_NAME}</h1>
      {pieces === null && <p className="empty">Carregando…</p>}
      {pieces?.length === 0 && <p className="empty">Ainda não há publicações. Volte em breve.</p>}
      {pieces && pieces.length > 0 && <Collage pieces={pieces} />}
    </>
  );
}
