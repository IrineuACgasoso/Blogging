// Segurança no Supabase de verdade: o que visitante e leitora comum NÃO podem fazer.
// (Versão "no ar" do item 1 do TODO. Só tenta ações que devem ser barradas; se alguma funcionar, o teste reprova.)
import { test, assert } from '../lib/harness.mjs';
import {
  SB,
  ANON,
  NIL,
  MARK,
  http,
  rest,
  rpc,
  need,
  expectDenied,
  expectNoData,
  expectRpcDenied,
  expectNoRowsChanged,
  aPublishedPost,
  aTheme,
  readerToken,
} from '../lib/live.mjs';

const anonOnly = need('SUPABASE_URL', 'SUPABASE_ANON_KEY');
const withReader = need('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'READER_JWT');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function tryUpload(token) {
  const name = `posts/${MARK}${Date.now()}.png`;
  const r = await http(`${SB}/storage/v1/object/photos/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}`, 'Content-Type': 'image/png' },
    body: PNG,
  });
  assert.ok(
    !(r.status >= 200 && r.status < 300),
    `SEGURANÇA QUEBRADA: upload funcionou (apague ${name} em Storage > photos)`,
  );
  const pub = await http(`${SB}/storage/v1/object/public/photos/${name}`);
  assert.notEqual(pub.status, 200, `o arquivo ${name} ficou público! Apague em Storage > photos`);
}

// =============== VISITANTE (sem login) ===============
const V = (name, fn) => test(`visitante: ${name}`, fn, { skip: anonOnly });

V('lê temas e posts publicados', async () => {
  assert.equal((await rest('themes?select=id&limit=1')).status, 200);
  assert.equal((await rest('posts?select=id&status=eq.published&limit=1')).status, 200);
});
V('lê a vitrine do dia', async () => {
  assert.equal((await rest('daily_lineup?select=day&limit=1')).status, 200);
});
V('NÃO vê rascunhos', async () => {
  const r = await rest('posts?select=id,title&status=eq.draft');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, [], 'rascunhos visíveis para qualquer pessoa!');
});
V('NÃO cria post', async () => {
  const t = await aTheme();
  expectDenied(
    await rest('posts', { method: 'POST', body: { slug: `${MARK}-v`, title: MARK, body: 'x', theme_id: t.id } }),
    'criar post',
  );
});
V('NÃO cria tema', async () => {
  expectDenied(await rest('themes', { method: 'POST', body: { slug: `${MARK}-v`, name: MARK } }), 'criar tema');
});
V('NÃO apaga post nem tema', async () => {
  expectDenied(await rest(`posts?id=eq.${NIL}`, { method: 'DELETE' }), 'apagar post');
  expectDenied(await rest(`themes?id=eq.${NIL}`, { method: 'DELETE' }), 'apagar tema');
});
V('NÃO altera a biografia', async () => {
  const cur = await rest('bio?select=id,content&limit=1');
  const row = cur.json?.[0];
  assert.ok(row, 'não achei a linha da biografia');
  expectNoRowsChanged(
    await rest(`bio?id=eq.${row.id}`, {
      method: 'PATCH',
      body: { content: row.content },
      prefer: 'return=representation',
    }),
    'editar biografia',
  );
});
V('NÃO curte', async () => {
  const p = await aPublishedPost();
  expectDenied(await rest('likes', { method: 'POST', body: { user_id: NIL, post_id: p.id } }), 'curtir sem login');
});
V('NÃO lê tabelas privadas (admins, likes, perfis, post_views, lineup_runs)', async () => {
  for (const t of ['admins', 'likes', 'profiles', 'post_views', 'lineup_runs'])
    expectNoData(await rest(`${t}?select=*&limit=5`), `ler ${t}`);
});
V('NÃO executa funções administrativas nem do cron', async () => {
  expectRpcDenied(await rpc('publish_post', { p_post: NIL }), 'publish_post');
  expectRpcDenied(await rpc('lineup_inputs', { p_day: '2026-01-01' }), 'lineup_inputs');
  expectRpcDenied(await rpc('commit_day', { p_day: '2026-01-01', p_items: [], p_slots: 6 }), 'commit_day');
  expectRpcDenied(await rpc('close_day', { p_day: '2026-01-01' }), 'close_day');
});
V('NÃO envia arquivos ao Storage', async () => {
  await tryUpload(null);
});
V('contar visualização de post inexistente é aceito e não grava nada (2xx)', async () => {
  const r = await rpc('register_view', { p_post: NIL, p_key: 'teste-automatico' });
  assert.ok(r.status >= 200 && r.status < 300, `HTTP ${r.status} ${r.text.slice(0, 120)}`);
});

// =============== LEITORA LOGADA (conta comum) ===============
const L = (name, fn) => test(`leitora: ${name}`, async () => fn(await readerToken()), { skip: withReader });

L('o token é válido e a conta NÃO é admin', async (t) => {
  assert.ok(t.ok);
});
L('NÃO vê rascunhos', async (t) => {
  const r = await rest('posts?select=id&status=eq.draft', { token: t.ok });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, []);
});
L('NÃO cria post', async (t) => {
  const th = await aTheme();
  expectDenied(
    await rest('posts', {
      token: t.ok,
      method: 'POST',
      body: { slug: `${MARK}-l`, title: MARK, body: 'x', theme_id: th.id },
    }),
    'criar post',
  );
});
L('NÃO cria tema nem cadastra foto', async (t) => {
  expectDenied(
    await rest('themes', { token: t.ok, method: 'POST', body: { slug: `${MARK}-l`, name: MARK } }),
    'criar tema',
  );
  expectDenied(
    await rest('photos', {
      token: t.ok,
      method: 'POST',
      body: { title: MARK, path: `posts/${MARK}.webp`, width: 1, height: 1 },
    }),
    'cadastrar foto',
  );
});
L('NÃO edita post existente', async (t) => {
  const p = await aPublishedPost();
  expectNoRowsChanged(
    await rest(`posts?id=eq.${p.id}`, {
      token: t.ok,
      method: 'PATCH',
      body: { title: p.title },
      prefer: 'return=representation',
    }),
    'editar post',
  );
});
L('NÃO altera a biografia', async (t) => {
  const row = (await rest('bio?select=id,content&limit=1')).json?.[0];
  expectNoRowsChanged(
    await rest(`bio?id=eq.${row.id}`, {
      token: t.ok,
      method: 'PATCH',
      body: { content: row.content },
      prefer: 'return=representation',
    }),
    'editar biografia',
  );
});
L('NÃO se promove a admin e NÃO lê a tabela admins', async (t) => {
  expectDenied(await rest('admins', { token: t.ok, method: 'POST', body: { user_id: t.uid } }), 'virar admin');
  expectNoData(await rest('admins?select=*', { token: t.ok }), 'ler admins');
});
L('NÃO curte em nome de outra pessoa', async (t) => {
  const p = await aPublishedPost();
  expectDenied(
    await rest('likes', { token: t.ok, method: 'POST', body: { user_id: NIL, post_id: p.id } }),
    'curtir como outra pessoa',
  );
});
L('só enxerga o PRÓPRIO perfil', async (t) => {
  const r = await rest('profiles?select=id', { token: t.ok });
  assert.equal(r.status, 200);
  assert.ok(r.json.length <= 1 && r.json.every((x) => x.id === t.uid), `viu ${r.json.length} perfis`);
});
L('NÃO executa publish_post nem as funções do cron', async (t) => {
  expectRpcDenied(await rpc('publish_post', { p_post: NIL }, t.ok), 'publish_post');
  expectRpcDenied(await rpc('lineup_inputs', { p_day: '2026-01-01' }, t.ok), 'lineup_inputs');
  expectRpcDenied(await rpc('commit_day', { p_day: '2026-01-01', p_items: [], p_slots: 6 }, t.ok), 'commit_day');
});
L('NÃO envia arquivos ao Storage', async (t) => {
  await tryUpload(t.ok);
});
