import { useEffect, useState } from 'react';
import Markdown from '../components/Markdown';
import { supabase } from '../lib/supabase';

export default function About() {
  const [bio, setBio] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from('bio')
      .select('content')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => setBio(data?.content ?? ''));
  }, []);
  return (
    <>
      <h1 className="page-title">Sobre mim</h1>
      {bio === null ? (
        <p className="empty">Carregando…</p>
      ) : bio.trim() ? (
        <div className="prose">
          <Markdown>{bio}</Markdown>
        </div>
      ) : (
        <p className="empty">A biografia ainda não foi escrita.</p>
      )}
    </>
  );
}
