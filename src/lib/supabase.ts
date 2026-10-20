import { createClient } from '@supabase/supabase-js';

// Sessão persistente: fica salva no navegador e renova o token sozinha.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } },
);
