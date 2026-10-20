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
          <p>Entre ou crie uma conta para curtir as publicações.</p>
          <button className="btn" onClick={onLogin}>Entrar</button>
        </>
      )}
    </Modal>
  );
}

const friendly = (m: string) =>
  /invalid login/i.test(m) ? 'E-mail ou senha incorretos.'
  : /already registered|already exists/i.test(m) ? 'Este e-mail já tem conta. Use "Entrar".'
  : /password/i.test(m) ? 'Senha inválida: use pelo menos 8 caracteres.'
  : /rate limit/i.test(m) ? 'Muitas tentativas. Aguarde alguns minutos.'
  : m;

export function LoginPopup({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending'); setMsg('');
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setState('error'); setMsg(friendly(error.message)); return; }
      onClose(); // o AuthProvider atualiza a conta sozinho
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password, options: { data: { name: name.trim().slice(0, 60) } },
    });
    if (error) { setState('error'); setMsg(friendly(error.message)); return; }
    if (data.session) { window.location.reload(); return; } // conta criada e já logada
    setState('sent'); // só acontece se "Confirm email" estiver ligado no Supabase
  }

  return (
    <Modal title={mode === 'login' ? 'Entrar' : 'Criar conta'} onClose={onClose}>
      {state === 'sent' ? (
        <p>Enviamos um e-mail de confirmação para <strong>{email}</strong>. Clique no link para ativar a conta e depois entre.</p>
      ) : (
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <label>Nome<input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          )}
          <label>E-mail<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <label>Senha
            <input required type={show ? 'text' : 'password'} minLength={8} maxLength={72} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          <label className="check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar senha</label>
          {mode === 'signup' && <p className="muted small">Mínimo de 8 caracteres.</p>}
          {state === 'error' && <p className="error" role="alert">{msg}</p>}
          <button className="btn" disabled={state === 'sending'}>
            {state === 'sending' ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
          <p className="muted small">
            {mode === 'login' ? 'Ainda não tem conta? ' : 'Já tem conta? '}
            <button type="button" className="linklike small" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setState('idle'); setMsg(''); }}>
              {mode === 'login' ? 'Criar conta' : 'Entrar'}
            </button>
          </p>
        </form>
      )}
    </Modal>
  );
}
