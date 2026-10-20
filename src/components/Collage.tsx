import { useState, type CSSProperties } from 'react';
import PostCard from './PostCard';
import { hash, seededRng, type PostCardData } from '../lib/utils';

export type PhotoItem = { id: string; title: string; url: string; width: number; height: number };
export type Piece = { kind: 'post'; post: PostCardData } | { kind: 'photo'; photo: PhotoItem };

// Rotação, largura e deslocamento de cada peça: aleatórios, mas estáveis por id.
function styleFor(id: string): CSSProperties {
  const r = seededRng(id);
  const rot = (r() * 6 - 3).toFixed(2);
  const w = Math.round(80 + r() * 20);
  const ml = Math.round(r() * (100 - w));
  const mt = Math.round(r() * 26);
  return { ['--rot' as string]: `${rot}deg`, ['--w' as string]: `${w}%`, ['--ml' as string]: `${ml}%`, ['--mt' as string]: `${mt}px` };
}

export default function Collage({ pieces }: { pieces: Piece[] }) {
  const [open, setOpen] = useState<PhotoItem | null>(null);
  return (
    <>
      <div className="collage">
        {pieces.map((p) =>
          p.kind === 'post' ? (
            <PostCard key={`p-${p.post.id}`} post={p.post} className={`piece ${hash(p.post.id) % 3 === 0 ? 'big' : ''}`} style={styleFor(p.post.id)} />
          ) : (
            <button key={`f-${p.photo.id}`} className="piece polaroid" style={styleFor(p.photo.id)} onClick={() => setOpen(p.photo)} aria-label={`Ampliar fotografia: ${p.photo.title}`}>
              <img src={p.photo.url} width={p.photo.width} height={p.photo.height} loading="lazy" alt={p.photo.title} />
              <span>{p.photo.title}</span>
            </button>
          ),
        )}
      </div>
      {open && (
        <div className="backdrop center" onClick={() => setOpen(null)}>
          <figure className="lightbox" role="dialog" aria-modal="true" aria-label={open.title} onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setOpen(null)} aria-label="Fechar">×</button>
            <img src={open.url} alt={open.title} />
            <figcaption>{open.title}</figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
