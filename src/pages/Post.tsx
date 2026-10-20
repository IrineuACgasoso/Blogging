import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useUi } from '../ui';
import { fmtDate, getViewerKey } from '../lib/utils';

type P = { id: string; title: string; body: string; published_at: string; likes_count: number; themes: { name: string; slug: string } | null };

export default function Post() {
  const { slug } = useParams();
  const { user } = useAuth();
  const { setPopup } = useUi();
  const [post, setPost] = useState<P | null | undefined>(undefined);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('posts').select('id,title,body,published_at,likes_count,themes(name,slug)')
      .eq('slug', slug!).eq('status', 'published').maybeSingle()
      .then(({ data }) => {
        const p = data as any as P | null;
        setPost(p);
        if (p) { setLikes(p.likes_count); }
      });
  }, [slug]);

  useEffect(() => {
    if (!post) return;
    supabase.rpc('register_view', { p_post: post.id, p_key: user?.id ?? getViewerKey() });
  }, [post?.id, user?.id]);

  useEffect(() => {
    if (!post || !user) { setLiked(false); return; }
    supabase.from('likes').select('post_id').eq('post_id', post.id).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setLiked(!!data));
  }, [post?.id, user?.id]);

  async function toggleLike() {
    if (!user) return setPopup('login');
    if (!post || busy) return;
    setBusy(true);
    const wasLiked = liked;
    setLiked(!wasLiked); setLikes((n) => n + (wasLiked ? -1 : 1)); // otimista
    const { error } = wasLiked
      ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id)
      : await supabase.from('likes').insert({ post_id: post.id, user_id: user.id });
    if (error) { setLiked(wasLiked); setLikes((n) => n + (wasLiked ? 1 : -1)); }
    setBusy(false);
  }

  if (post === undefined) return <p className="empty">Carregando…</p>;
  if (post === null) return <p className="empty">Publicação não encontrada.</p>;
  return (
    <article className="post">
      <Link to="/" className="back">← Voltar ao início</Link>
      <h1>{post.title}</h1>
      <p className="meta">{post.themes?.name} · {fmtDate(post.published_at)}</p>
      <button className={`like ${liked ? 'on' : ''}`} onClick={toggleLike} aria-pressed={liked} aria-label={liked ? 'Descurtir' : 'Curtir'}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="M12 21s-7-4.6-9.3-9.1C1.1 8.7 3 5 6.5 5c2 0 3.4 1.1 5.5 3.2C14.1 6.1 15.5 5 17.5 5 21 5 22.9 8.7 21.3 11.9 19 16.4 12 21 12 21z" />
        </svg>
        <span>{likes}</span>
      </button>
      <div className="prose"><ReactMarkdown>{post.body}</ReactMarkdown></div>
    </article>
  );
}
