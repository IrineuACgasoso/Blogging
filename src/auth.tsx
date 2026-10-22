import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

type Ctx = { user: User | null; name: string; isAdmin: boolean; loading: boolean; signOut: () => Promise<void> };
const AuthCtx = createContext<Ctx>({ user: null, name: '', isAdmin: false, loading: true, signOut: async () => {} });
export const useAuth = () => useContext(AuthCtx);

type Profile = { uid: string; name: string; isAdmin: boolean };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const uid = user?.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Depende do id (não do objeto): a renovação do token não refaz as consultas.
  useEffect(() => {
    if (!uid) return;
    let live = true;
    (async () => {
      const [{ data: p }, { data: adm }] = await Promise.all([
        supabase.from('profiles').select('name').eq('id', uid).maybeSingle(),
        supabase.rpc('is_admin'),
      ]);
      // Falha fechado: erro na consulta => não-admin. Só esconde UI; quem protege de verdade é a RLS.
      if (live) setProfile({ uid, name: p?.name ?? 'Leitor', isAdmin: adm === true });
    })();
    return () => {
      live = false;
    };
  }, [uid]);

  // "loading" só termina quando a sessão E o papel (admin) do usuário atual foram resolvidos;
  // senão rotas protegidas redirecionariam o admin antes de sabermos quem ele é.
  const current = profile && profile.uid === uid ? profile : null;
  const loading = !sessionReady || (uid !== undefined && current === null);

  const signOut = async () => {
    await supabase.auth.signOut();
  };
  return (
    <AuthCtx.Provider value={{ user, name: current?.name ?? '', isAdmin: current?.isAdmin ?? false, loading, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
