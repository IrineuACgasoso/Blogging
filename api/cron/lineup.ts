import { createClient } from '@supabase/supabase-js';
import { runDailyLineup } from '../../lib/lineup.js';
import { isAuthorized } from '../../lib/auth.js';
import type { ApiRequest, ApiResponse } from '../../lib/http.js';

const SLOTS = 6;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAuthorized(req.headers.authorization, process.env.CRON_SECRET)) return res.status(401).end();

  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const now = new Date();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' }).format(now); // YYYY-MM-DD

  // A decisão (qual post aparece) é função pura em lib/lineup.ts; aqui só liga ao Supabase.
  // Toda a escrita acontece dentro de commit_day (uma transação): falhou => nada mudou, pode chamar de novo.
  const out = await runDailyLineup(day, now, SLOTS, {
    readInputs: async (d) => {
      const { data, error } = await sb.rpc('lineup_inputs', { p_day: d });
      if (error) throw error;
      return data;
    },
    commit: async (d, items, slots) => {
      const { data, error } = await sb.rpc('commit_day', { p_day: d, p_items: items, p_slots: slots });
      if (error) throw error;
      return data === true;
    },
    log: (message, err) => console.error(message, err),
  });
  return res.status(out.status).json(out.body);
}
