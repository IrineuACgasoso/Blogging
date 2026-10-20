import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

type Ctx = { user: User | null; name: string; isAdmin: boolean; loading: boolean; signOut: () => Promise<void> };
const AuthCtx = createContext<Ctx>({ user: null, name: '', isAdmin: false, loading: true, signOut: async () => {} });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setName(''); setIsAdmin(false); return; }
    let live = true;
    (async () => {
      const [{ data: p }, { data: adm }] = await Promise.all([
        supabase.from('profiles').select('name').eq('id', user.id).maybeSingle(),
        supabase.rpc('is_admin'),
      ]);
      if (!live) return;
      setName(p?.name ?? 'Leitor');
      setIsAdmin(adm === true); // só esconde UI; quem protege de verdade é a RLS
    })();
    return () => { live = false; };
  }, [user]);

  const signOut = async () => { await supabase.auth.signOut(); };
  return <AuthCtx.Provider value={{ user, name, isAdmin, loading, signOut }}>{children}</AuthCtx.Provider>;
}
