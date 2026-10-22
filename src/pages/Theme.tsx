import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { PostCardData } from '../lib/utils';
import PostCard from '../components/PostCard';

const ORDER = {
  recentes: { col: 'published_at', label: 'Mais recentes' },
  vistos: { col: 'views_count', label: 'Mais vistos' },
  curtidos: { col: 'likes_count', label: 'Mais curtidos' },
} as const;

export default function Theme() {
  const { slug } = useParams();
  const [theme, setTheme] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [posts, setPosts] = useState<PostCardData[]>([]);
  const [order, setOrder] = useState<keyof typeof ORDER>('recentes');

  useEffect(() => {
    supabase
      .from('themes')
      .select('id,name')
      .eq('slug', slug!)
      .maybeSingle()
      .then(({ data }) => setTheme(data));
  }, [slug]);

  useEffect(() => {
    if (!theme) return;
    supabase
      .from('posts')
      .select('id,slug,title,published_at,themes(name,slug)')
      .eq('theme_id', theme.id)
      .eq('status', 'published')
      .order(ORDER[order].col, { ascending: false })
      .then(({ data }) => setPosts((data ?? []) as unknown as PostCardData[]));
  }, [theme, order]);

  if (theme === undefined) return <p className="empty">Carregando…</p>;
  if (theme === null) return <p className="empty">Tema não encontrado.</p>;
  return (
    <>
      <h1 className="page-title">{theme.name}</h1>
      <label className="filter">
        Ordenar por
        <select value={order} onChange={(e) => setOrder(e.target.value as keyof typeof ORDER)}>
          {Object.entries(ORDER).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      {posts.length === 0 && <p className="empty">Nenhuma publicação neste tema ainda.</p>}
      <div className="list">
        {posts.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
    </>
  );
}
