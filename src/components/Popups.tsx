import { useState, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabase';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="backdrop center" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Fechar">×</button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function AccountPopup({ onClose, onLogin }: { onClose: () => void; onLogin: () => void }) {
  const { user, name, signOut } = useAuth();
  return (
    <Modal title="Minha conta" onClose={onClose}>
      {user ? (
        <>
          <p><strong>Nome:</strong> {name}</p>
          <p><strong>E-mail:</strong> {user.email}</p>
          <button className="btn" onClick={async () => { await signOut(); onClose(); }}>Sair</button>
        </>
      ) : (
        <>
          <p>Entre para curtir publicações e acompanhar o blog.</p>
          <button className="btn" onClick={onLogin}>Entrar</button>
        </>
      )}
    </Modal>
  );
}

export function LoginPopup({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { data: { name: name.trim().slice(0, 60) }, emailRedirectTo: window.location.origin },
    });
    if (error) { setState('error'); setMsg(error.message); } else setState('sent');
  }

  return (
    <Modal title="Entrar" onClose={onClose}>
      {state === 'sent' ? (
        <p>Enviamos um link de acesso para <strong>{email}</strong>. Abra o e-mail e clique no link para concluir.</p>
      ) : (
        <form onSubmit={submit}>
          <label>Nome<input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <label>E-mail<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          {state === 'error' && <p className="error">Não foi possível enviar o link: {msg}</p>}
          <button className="btn" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando…' : 'Confirmar'}</button>
          <p className="muted small">Se você já tem cadastro, o nome é ignorado e o link entra na sua conta.</p>
        </form>
      )}
    </Modal>
  );
}
