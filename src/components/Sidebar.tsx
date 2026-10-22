import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [themes, setThemes] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [showThemes, setShowThemes] = useState(false);
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (!open) return;
    supabase
      .from('themes')
      .select('id,name,slug')
      .order('name')
      .then(({ data }) => setThemes(data ?? []));
  }, [open]);

  return (
    <>
      {open && <div className="backdrop" onClick={onClose} />}
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-hidden={!open} aria-label="Menu">
        <button className="close" onClick={onClose} aria-label="Fechar menu">
          ×
        </button>
        <Link to="/">Início</Link>
        <Link to="/sobre">Sobre mim</Link>
        <Link to="/privacidade">Privacidade</Link>
        <button className="linklike" aria-expanded={showThemes} onClick={() => setShowThemes((v) => !v)}>
          Temas {showThemes ? '−' : '+'}
        </button>
        {showThemes && (
          <ul>
            {themes.length === 0 && <li className="muted">Nenhum tema ainda.</li>}
            {themes.map((t) => (
              <li key={t.id}>
                <Link to={`/tema/${t.slug}`}>{t.name}</Link>
              </li>
            ))}
          </ul>
        )}
        {isAdmin && (
          <Link to="/admin" className="admin-link">
            Painel da autora
          </Link>
        )}
      </nav>
    </>
  );
}
