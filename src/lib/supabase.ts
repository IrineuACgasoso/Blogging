import { createClient } from '@supabase/supabase-js';

// Sessão persistente: fica salva no navegador e renova o token sozinha.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  // detectSessionInUrl + PKCE: necessários para concluir o retorno do login com Google (?code=...).
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } },
);
