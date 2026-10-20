import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { slugify } from '../lib/utils';

type Theme = { id: string; name: string; slug: string };
type PostRow = { id: string; title: string; body: string; theme_id: string; status: string };
type Tab = 'posts' | 'themes' | 'bio';

export default function Admin() {
  const { isAdmin, loading, user } = useAuth();
  const [tab, setTab] = useState<Tab>('posts');
  if (loading) return <p className="empty">Carregando…</p>;
  if (!user || !isAdmin) return <Navigate to="/" replace />;
  return (
    <>
      <h1 className="page-title">Painel da autora</h1>
      <div className="tabs" role="tablist">
        {(['posts', 'themes', 'bio'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {{ posts: 'Publicações', themes: 'Temas', bio: 'Biografia' }[t]}
          </button>
        ))}
      </div>
      {tab === 'posts' && <Posts />}
      {tab === 'themes' && <Themes />}
      {tab === 'bio' && <Bio />}
    </>
  );
}

function Posts() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [rows, setRows] = useState<PostRow[]>([]);
  const [edit, setEdit] = useState<Partial<PostRow> | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([
      supabase.from('themes').select('id,name,slug').order('name'),
      supabase.from('posts').select('id,title,body,theme_id,status').order('published_at', { ascending: false, nullsFirst: true }),
    ]);
    setThemes(t.data ?? []); setRows((p.data ?? []) as PostRow[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(publish: boolean) {
    if (!edit?.title?.trim() || !edit.body?.trim() || !edit.theme_id) return setMsg('Preencha título, tema e texto.');
    const payload = { title: edit.title.trim(), body: edit.body, theme_id: edit.theme_id };
    let id = edit.id;
    if (id) {
      const { error } = await supabase.from('posts').update(payload).eq('id', id);
      if (error) return setMsg(error.message);
    } else {
      const slug = `${slugify(payload.title)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase.from('posts').insert({ ...payload, slug, status: 'draft' }).select('id').single();
      if (error) return setMsg(error.message);
      id = data.id;
    }
    if (publish && edit.status !== 'published') {
      const { error } = await supabase.rpc('publish_post', { p_post: id });
      if (error) return setMsg(error.message);
    }
    setMsg(publish ? 'Publicado.' : 'Salvo.'); setEdit(null); load();
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta publicação? Isso não pode ser desfeito.')) return;
    const { error } = await supabase.from('posts').delete().eq('id', id);
    setMsg(error ? error.message : 'Publicação excluída.'); load();
  }

  if (edit) {
    return (
      <div className="form">
        <label>Título<input value={edit.title ?? ''} maxLength={160} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
        <label>Tema
          <select value={edit.theme_id ?? ''} onChange={(e) => setEdit({ ...edit, theme_id: e.target.value })}>
            <option value="" disabled>Escolha um tema</option>
            {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>Texto (Markdown: **negrito**, *itálico*, # título, &gt; citação)
          <textarea rows={16} value={edit.body ?? ''} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
        </label>
        {msg && <p className="error">{msg}</p>}
        <div className="row">
          <button className="btn" onClick={() => save(true)}>{edit.status === 'published' ? 'Salvar alterações' : 'Publicar'}</button>
          {edit.status !== 'published' && <button className="btn ghost" onClick={() => save(false)}>Salvar rascunho</button>}
          <button className="btn ghost" onClick={() => { setEdit(null); setMsg(''); }}>Cancelar</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <button className="btn" disabled={themes.length === 0} onClick={() => { setEdit({ title: '', body: '', theme_id: '' }); setMsg(''); }}>Nova publicação</button>
      {themes.length === 0 && <p className="muted">Crie ao menos um tema antes de escrever.</p>}
      {msg && <p className="muted">{msg}</p>}
      <ul className="rows">
        {rows.map((r) => (
          <li key={r.id}>
            <span>{r.title} <em className="muted">({r.status === 'published' ? 'publicado' : 'rascunho'})</em></span>
            <span className="row">
              <button className="btn ghost" onClick={() => { setEdit(r); setMsg(''); }}>Editar</button>
              <button className="btn ghost danger" onClick={() => remove(r.id)}>Excluir</button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Themes() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const { data } = await supabase.from('themes').select('id,name,slug').order('name'); setThemes(data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim(); if (!n) return;
    const { error } = await supabase.from('themes').insert({ name: n, slug: slugify(n) });
    setMsg(error ? error.message : 'Tema adicionado.'); if (!error) setName(''); load();
  }
  async function rename(t: Theme) {
    const n = prompt('Novo nome do tema', t.name)?.trim(); if (!n || n === t.name) return;
    const { error } = await supabase.from('themes').update({ name: n }).eq('id', t.id);
    setMsg(error ? error.message : 'Tema renomeado.'); load();
  }
  async function remove(t: Theme) {
    if (!confirm(`Excluir o tema "${t.name}"?`)) return;
    const { error } = await supabase.from('themes').delete().eq('id', t.id);
    setMsg(error ? 'Não dá para excluir um tema que ainda tem publicações. Mova ou exclua as publicações primeiro.' : 'Tema excluído.'); load();
  }
  return (
    <>
      <form onSubmit={add} className="row">
        <input placeholder="Nome do novo tema" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <button className="btn">Adicionar tema</button>
      </form>
      {msg && <p className="muted">{msg}</p>}
      <ul className="rows">
        {themes.map((t) => (
          <li key={t.id}><span>{t.name}</span>
            <span className="row">
              <button className="btn ghost" onClick={() => rename(t)}>Renomear</button>
              <button className="btn ghost danger" onClick={() => remove(t)}>Excluir</button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Bio() {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { supabase.from('bio').select('content').eq('id', 1).maybeSingle().then(({ data }) => setText(data?.content ?? '')); }, []);
  async function save() {
    const { error } = await supabase.from('bio').update({ content: text, updated_at: new Date().toISOString() }).eq('id', 1);
    setMsg(error ? error.message : 'Biografia salva.');
  }
  return (
    <div className="form">
      <label>Biografia (Markdown)<textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} /></label>
      <div className="row"><button className="btn" onClick={save}>Salvar biografia</button></div>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
