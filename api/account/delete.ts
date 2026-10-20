import { createClient } from '@supabase/supabase-js';
import { deleteAccount } from '../../lib/deleteAccount.js';

// POST /api/account/delete  (Authorization: Bearer <JWT da própria pessoa>)
// Só apaga a conta dona do token: o id vem do token validado pelo Supabase, nunca do corpo da requisição.
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  try {
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const out = await deleteAccount(req.headers.authorization, {
      userIdFromToken: async (token) => {
        const { data, error } = await sb.auth.getUser(token);
        return error ? null : data.user?.id ?? null;
      },
      // service_role não tem auth.uid(): is_admin() daria sempre false aqui, então consulta a tabela direto.
      isAdmin: async (id) => {
        const { data, error } = await sb.from('admins').select('user_id').eq('user_id', id).maybeSingle();
        if (error) throw error;
        return data !== null;
      },
      purgeViews: async (id) => {
        const { error } = await sb.from('post_views').delete().eq('viewer_key', id);
        if (error) throw error;
      },
      deleteUser: async (id) => {
        const { error } = await sb.auth.admin.deleteUser(id);
        if (error) throw error;
      },
      log: (message, err) => console.error(message, err),
    });
    return res.status(out.status).json(out.body);
  } catch (err) {
    console.error('delete-account handler crashed', err);
    return res.status(500).json({ error: 'Não foi possível excluir a conta agora.' });
  }
}
