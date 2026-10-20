import { Link } from 'react-router-dom';
import { fmtDate, type PostCardData } from '../lib/utils';

export default function PostCard({ post, index = 0 }: { post: PostCardData; index?: number }) {
  return (
    <Link to={`/post/${post.slug}`} className="card" style={{ ['--tilt' as string]: `${((index % 3) - 1) * 0.5}deg` }}>
      <span className="meta">{post.themes?.name ?? 'Sem tema'} · {fmtDate(post.published_at)}</span>
      <h2>{post.title}</h2>
    </Link>
  );
}
