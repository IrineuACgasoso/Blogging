import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { fmtDate, type PostCardData } from '../lib/utils';

export default function PostCard({ post, index = 0, className = '', style }: { post: PostCardData; index?: number; className?: string; style?: CSSProperties }) {
  return (
    <Link to={`/post/${post.slug}`} className={`card ${className}`} style={{ ['--tilt' as string]: `${((index % 3) - 1) * 0.5}deg`, ...style }}>
      <span className="meta">{post.themes?.name ?? 'Sem tema'} · {fmtDate(post.published_at)}</span>
      <h2>{post.title}</h2>
    </Link>
  );
}
