import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
  const [step, setStep] = useState<'idle' | 'confirm' | 'deleting' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function deleteAccount() {
    if (step === 'deleting') return;
    setStep('deleting'); setMsg('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sessão expirada. Entre novamente.');
      const res = await fetch('/api/account/delete', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Não foi possível excluir a conta.');
      await supabase.auth.signOut({ scope: 'local' }); // a conta não existe mais: só limpa a sessão local
      window.location.assign('/');
    } catch (e) {
      setStep('error'); setMsg(e instanceof Error ? e.message : 'Não foi possível excluir a conta.');
    }
  }

  return (
    <Modal title="Minha conta" onClose={onClose}>
      {user ? (
        <>
          <p><strong>Nome:</strong> {name}</p>
          <p><strong>E-mail:</strong> {user.email}</p>
          {step === 'idle' || step === 'error' ? (
            <>
              {step === 'error' && <p className="error" role="alert">{msg}</p>}
              <div className="row">
                <button className="btn" onClick={async () => { await signOut(); onClose(); }}>Sair</button>
                <button className="btn ghost danger" onClick={() => setStep('confirm')}>Excluir minha conta</button>
              </div>
            </>
          ) : (
            <>
              <p><strong>Excluir sua conta?</strong> Isso apaga seu nome, e-mail, curtidas e registros de visualização. Não dá para desfazer.</p>
              <div className="row">
                <button className="btn ghost danger" disabled={step === 'deleting'} onClick={deleteAccount}>
                  {step === 'deleting' ? 'Excluindo…' : 'Sim, excluir'}
                </button>
                <button className="btn ghost" disabled={step === 'deleting'} onClick={() => setStep('idle')}>Cancelar</button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <p>Entre com sua conta Google para curtir as publicações.</p>
          <button className="btn" onClick={onLogin}>Entrar</button>
        </>
      )}
    </Modal>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// Login só com Google: não há senha para criar, esquecer ou vazar.
export function LoginPopup({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'redirecting' | 'error'>('idle');

  async function signInWithGoogle() {
    if (state === 'redirecting') return;
    setState('redirecting');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Volta para a página onde a pessoa estava (precisa estar nas Redirect URLs do Supabase).
      options: { redirectTo: `${window.location.origin}${window.location.pathname}`, queryParams: { prompt: 'select_account' } },
    });
    if (error) setState('error'); // em caso de sucesso o navegador já está indo para o Google
  }

  return (
    <Modal title="Entrar" onClose={onClose}>
      <p>Entre com sua conta Google para curtir as publicações. Usamos apenas seu nome e e-mail; não temos acesso à sua senha.</p>
      <p className="muted small">Ao entrar, você concorda com a <Link to="/privacidade">Política de Privacidade</Link>.</p>
      {state === 'error' && <p className="error" role="alert">Não foi possível iniciar o login. Tente novamente.</p>}
      <button className="btn google" onClick={signInWithGoogle} disabled={state === 'redirecting'}>
        <GoogleLogo />
        <span>{state === 'redirecting' ? 'Abrindo o Google…' : 'Entrar com o Google'}</span>
      </button>
    </Modal>
  );
}
