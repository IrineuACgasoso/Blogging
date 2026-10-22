// Apoio dos testes "live": variáveis de ambiente, HTTP e checagens de "foi negado".
import { Skip, assert } from './harness.mjs';

export const env = (k) => (process.env[k] || '').trim().replace(/\/+$/, '');
export const SITE = env('SITE_URL');
export const SB = env('SUPABASE_URL');
export const ANON = env('SUPABASE_ANON_KEY');
export const READER = (process.env.READER_JWT || '').trim();
export const CRON_SECRET = (process.env.CRON_SECRET || '').trim();
export const NIL = '00000000-0000-0000-0000-000000000000';
export const MARK = '__TESTE_APAGAR__';

/** Motivo de pular quando faltam variáveis; undefined se estiver tudo configurado. */
export const need = (...names) => {
  const miss = names.filter((n) => !(process.env[n] || '').trim());
  return miss.length ? `defina ${miss.join(', ')} em tests/.env.test` : undefined;
};

export async function http(url, { method = 'GET', headers = {}, body, redirect = 'manual' } = {}) {
  const res = await fetch(url, { method, headers, body, redirect, signal: AbortSignal.timeout(25_000) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    /* não é JSON */
  }
  return { status: res.status, text, json, headers: res.headers };
}

/** Chamada à API REST do Supabase como visitante (token = null) ou com um JWT de usuário. */
export function rest(path, { token = null, method = 'GET', body, prefer } = {}) {
  return http(`${SB}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token || ANON}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
export const rpc = (fn, args, token) => rest(`rpc/${fn}`, { token, method: 'POST', body: args ?? {} });

const brief = (r) => `HTTP ${r.status} ${r.text.slice(0, 160)}`;
export const isDenied = (r) => r.status === 401 || r.status === 403;

/** Exige 401/403 (a ação foi barrada). Qualquer sucesso é falha grave. */
export function expectDenied(r, what) {
  assert.ok(
    !(r.status >= 200 && r.status < 300),
    `SEGURANÇA QUEBRADA: ${what} funcionou (${brief(r)}). Se algo foi criado, apague o que tiver "${MARK}" no nome.`,
  );
  assert.ok(isDenied(r), `${what}: esperava 401/403, veio ${brief(r)}`);
}
/** Para leituras: barrado (401/403) OU lista vazia (RLS filtrando tudo). Nunca dados. */
export function expectNoData(r, what) {
  if (isDenied(r)) return;
  assert.ok(
    r.status === 200 && Array.isArray(r.json) && r.json.length === 0,
    `${what}: DADOS EXPOSTOS ou resposta inesperada (${brief(r)})`,
  );
}
/** Para funções (rpc): barrada, inexistente, ou recusada pelo "forbidden" interno. */
export function expectRpcDenied(r, what) {
  assert.ok(!(r.status >= 200 && r.status < 300), `SEGURANÇA QUEBRADA: ${what} executou (${brief(r)})`);
  assert.ok(
    isDenied(r) || r.status === 404 || (r.status === 400 && /forbidden/i.test(r.text)),
    `${what}: resposta inesperada (${brief(r)})`,
  );
}
/** Para PATCH "no-op" (regrava o mesmo valor): se a resposta trouxer linhas, a pessoa TEM permissão de editar. */
export function expectNoRowsChanged(r, what) {
  if (isDenied(r)) return;
  assert.ok(
    r.status < 300 && Array.isArray(r.json) && r.json.length === 0,
    `SEGURANÇA QUEBRADA: ${what} alterou linhas (${brief(r)})`,
  );
}

export async function aPublishedPost() {
  const r = await rest('posts?select=id,slug,title&status=eq.published&limit=1');
  if (!Array.isArray(r.json) || !r.json.length) throw new Skip('precisa de pelo menos 1 post publicado no site');
  return r.json[0];
}
export async function aTheme() {
  const r = await rest('themes?select=id,name&limit=1');
  if (!Array.isArray(r.json) || !r.json.length) throw new Skip('precisa de pelo menos 1 tema criado');
  return r.json[0];
}

let readerState;
/** Confere que READER_JWT é válido e é de uma leitora (não admin). Memoizado. */
export async function readerToken() {
  readerState ??= (async () => {
    const u = await http(`${SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${READER}` } });
    if (u.status !== 200)
      return {
        skip: `READER_JWT inválido ou expirado (HTTP ${u.status}). Ele dura ~1 hora: copie um novo (tests/README.md)`,
      };
    const a = await rpc('is_admin', {}, READER);
    if (a.json === true) return { skip: 'READER_JWT é de uma conta ADMIN. Use uma conta de leitora comum' };
    return { ok: READER, uid: u.json?.id };
  })();
  const s = await readerState;
  if (s.skip) throw new Skip(s.skip);
  return s;
}
