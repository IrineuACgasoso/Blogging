import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { slugify } from '../lib/utils';
import { prepareImage, publicUrl, uploadImage } from '../lib/images';

type Theme = { id: string; name: string; slug: string };
type PostRow = { id: string; title: string; body: string; theme_id: string; status: string };
type Tab = 'posts' | 'photos' | 'themes' | 'bio';
type PhotoRow = { id: string; title: string; path: string };

export default function Admin() {
  const { isAdmin, loading, user } = useAuth();
  const [tab, setTab] = useState<Tab>('posts');
  if (loading) return <p className="empty">Carregando…</p>;
  if (!user || !isAdmin) return <Navigate to="/" replace />;
  return (
    <>
      <h1 className="page-title">Painel da autora</h1>
      <div className="tabs" role="tablist">
        {(['posts', 'photos', 'themes', 'bio'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {{ posts: 'Publicações', photos: 'Fotografia', themes: 'Temas', bio: 'Biografia' }[t]}
          </button>
        ))}
      </div>
      {tab === 'posts' && <Posts />}
      {tab === 'photos' && <Photos />}
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
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // trava síncrona: o state só atualiza no próximo render

  async function insertPhoto(file?: File) {
    if (!file || !edit) return;
    const caption = (prompt('Legenda da foto (opcional)') ?? '').replace(/[\[\]\n]/g, ' ').trim();
    setUploading(true); setMsg('');
    try {
      const img = await prepareImage(file);
      const up = await uploadImage(img.blob, 'posts');
      const md = `\n\n![${caption}](${up.url})\n\n`;
      const body = edit.body ?? '';
      const pos = taRef.current ? taRef.current.selectionStart : body.length;
      setEdit({ ...edit, body: body.slice(0, pos) + md + body.slice(pos) });
    } catch (err: any) { setMsg(err.message ?? 'Erro ao enviar a foto.'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([
      supabase.from('themes').select('id,name,slug').order('name'),
      supabase.from('posts').select('id,title,body,theme_id,status').order('published_at', { ascending: false, nullsFirst: true }),
    ]);
    setThemes(t.data ?? []); setRows((p.data ?? []) as PostRow[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(publish: boolean) {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try { await persist(publish); } finally { savingRef.current = false; setSaving(false); }
  }

  async function persist(publish: boolean) {
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
      setEdit((cur) => cur && { ...cur, id }); // se a publicação falhar, tentar de novo atualiza em vez de duplicar
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
          <textarea ref={taRef} rows={16} value={edit.body ?? ''} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
        </label>
        <div className="row" style={{ marginBottom: '1rem' }}>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => insertPhoto(e.target.files?.[0])} />
          <button type="button" className="btn ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Enviando foto…' : 'Inserir foto no texto'}
          </button>
          <span className="muted small">A foto entra onde o cursor estiver.</span>
        </div>
        {msg && <p className="error">{msg}</p>}
        <div className="row">
          <button className="btn" disabled={saving} onClick={() => save(true)}>{edit.status === 'published' ? 'Salvar alterações' : 'Publicar'}</button>
          {edit.status !== 'published' && <button className="btn ghost" disabled={saving} onClick={() => save(false)}>Salvar rascunho</button>}
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

function Photos() {
  const [rows, setRows] = useState<PhotoRow[]>([]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('photos').select('id,title,path').order('created_at', { ascending: false });
    setRows((data ?? []) as PhotoRow[]);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pick(f?: File) { setMsg(''); setFile(f ?? null); setPreview(f ? URL.createObjectURL(f) : null); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return setMsg('Informe o título e escolha o arquivo.');
    setBusy(true); setMsg('');
    try {
      const img = await prepareImage(file);
      const up = await uploadImage(img.blob, 'photos');
      const { error } = await supabase.from('photos').insert({ title: title.trim(), path: up.path, width: img.width, height: img.height });
      if (error) { await supabase.storage.from('photos').remove([up.path]); throw error; }
      setTitle(''); pick(undefined); setMsg('Fotografia adicionada.'); load();
    } catch (err: any) { setMsg(err.message ?? 'Erro ao enviar.'); }
    finally { setBusy(false); }
  }

  async function remove(p: PhotoRow) {
    if (!confirm(`Excluir a fotografia "${p.title}"?`)) return;
    await supabase.storage.from('photos').remove([p.path]);
    const { error } = await supabase.from('photos').delete().eq('id', p.id);
    setMsg(error ? error.message : 'Fotografia excluída.'); load();
  }

  return (
    <>
      <form onSubmit={save} className="form">
        <label>Título da fotografia<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Arquivo (JPG, PNG ou WebP)
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {preview && (
          <figure className="polaroid preview">
            <img src={preview} alt="Pré-visualização" />
            <figcaption>{title || 'Sem título'}</figcaption>
          </figure>
        )}
        {msg && <p className={msg.includes('adicionada') || msg.includes('excluída') ? 'muted' : 'error'}>{msg}</p>}
        <div className="row"><button className="btn" disabled={busy}>{busy ? 'Enviando…' : 'Salvar fotografia'}</button></div>
      </form>
      <h2 className="sub">Suas fotografias</h2>
      {rows.length === 0 && <p className="muted">Nenhuma fotografia ainda.</p>}
      <div className="gallery">
        {rows.map((r) => (
          <figure key={r.id} className="polaroid">
            <img src={publicUrl(r.path)} alt={r.title} loading="lazy" />
            <figcaption>{r.title}</figcaption>
            <button className="btn ghost danger" onClick={() => remove(r)}>Excluir</button>
          </figure>
        ))}
      </div>
    </>
  );
}
