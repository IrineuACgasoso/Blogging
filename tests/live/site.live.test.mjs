// Testes no ar: o site publicado (Vercel) e as configurações do login (Supabase Auth).
import { test, assert } from '../lib/harness.mjs';
import { SITE, SB, ANON, CRON_SECRET, http, need } from '../lib/live.mjs';

const site = need('SITE_URL');
const sb = need('SUPABASE_URL', 'SUPABASE_ANON_KEY');

test(
  'o site abre (200) e entrega a página do blog',
  async () => {
    const r = await http(SITE);
    assert.equal(r.status, 200);
    assert.match(r.text, /id="root"/);
  },
  { skip: site },
);

test(
  'rotas internas (/privacidade, /post/qualquer) funcionam ao recarregar (regra de SPA)',
  async () => {
    for (const p of ['/privacidade', '/post/nao-existe-xyz', '/sobre']) {
      const r = await http(SITE + p);
      assert.equal(r.status, 200, `${p} -> ${r.status}`);
      assert.match(r.text, /id="root"/, p);
    }
  },
  { skip: site },
);

test(
  'cron: sem Authorization => 401',
  async () => {
    assert.equal((await http(`${SITE}/api/cron/lineup`)).status, 401);
  },
  { skip: site },
);

test(
  'cron: segredo errado, "Bearer undefined" e "Bearer " => 401 (nunca abre por engano)',
  async () => {
    for (const h of ['Bearer segredo-errado-0123456789', 'Bearer undefined', 'Bearer ', 'Basic abc']) {
      const r = await http(`${SITE}/api/cron/lineup`, { headers: { Authorization: h } });
      assert.equal(r.status, 401, `"${h}" -> ${r.status}`);
    }
  },
  { skip: site },
);

test(
  'excluir conta: GET não é aceito (405), sem token => 401, token inválido => 401',
  async () => {
    const url = `${SITE}/api/account/delete`;
    assert.equal((await http(url)).status, 405);
    assert.equal((await http(url, { method: 'POST' })).status, 401);
    assert.equal((await http(url, { method: 'POST', headers: { Authorization: 'Bearer abc.def.ghi' } })).status, 401);
  },
  { skip: site },
);

test(
  'o pacote JS público NÃO contém a chave service_role nem o CRON_SECRET',
  async () => {
    const idx = await http(SITE);
    const src = [...idx.text.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(src.length, 'não achei o <script> do pacote no HTML');
    for (const s of src) {
      const js = await http(new URL(s, SITE).href);
      assert.equal(js.status, 200, s);
      assert.ok(!js.text.includes('SUPABASE_SERVICE_ROLE_KEY'), `${s} cita SUPABASE_SERVICE_ROLE_KEY`);
      for (const m of js.text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\./g)) {
        try {
          assert.notEqual(
            JSON.parse(Buffer.from(m[1], 'base64url').toString()).role,
            'service_role',
            'JWT service_role dentro do pacote!',
          );
        } catch (e) {
          if (e.name === 'AssertionError') throw e;
        }
      }
      if (CRON_SECRET.length >= 16) assert.ok(!js.text.includes(CRON_SECRET), 'CRON_SECRET dentro do pacote!');
    }
  },
  { skip: site },
);

test(
  'arquivos de configuração (.env, .env.local, .git/config) não são servidos',
  async () => {
    for (const p of ['/.env', '/.env.local', '/.git/config', '/package.json']) {
      const r = await http(SITE + p);
      assert.ok(
        !/SUPABASE|SERVICE_ROLE|CRON_SECRET|\[core\]|"dependencies"/.test(r.text),
        `${p} expôs conteúdo sensível`,
      );
    }
  },
  { skip: site },
);

test(
  'Supabase Auth: provedor Email DESLIGADO (login só com Google) e Google ligado',
  async () => {
    const r = await http(`${SB}/auth/v1/settings`, { headers: { apikey: ANON } });
    assert.equal(r.status, 200, `HTTP ${r.status}`);
    assert.equal(
      r.json?.external?.email,
      false,
      'provedor Email está LIGADO: desligue em Authentication > Providers > Email',
    );
    assert.equal(r.json?.external?.google, true, 'provedor Google está desligado');
  },
  { skip: sb },
);

test(
  'cron com o segredo certo roda (200) — executa a virada do dia de verdade (LIVE_RUN_CRON=1)',
  async () => {
    const r = await http(`${SITE}/api/cron/lineup`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    assert.equal(r.status, 200, `HTTP ${r.status} ${r.text.slice(0, 200)}`);
    assert.ok(r.json?.day || r.json?.skipped, `resposta inesperada: ${r.text.slice(0, 200)}`);
    if (r.json?.items) assert.ok(r.json.items.length <= 6);
  },
  {
    skip:
      site ||
      (process.env.LIVE_RUN_CRON === '1'
        ? need('CRON_SECRET')
        : 'ligue LIVE_RUN_CRON=1 (e defina CRON_SECRET) para executar a virada do dia de verdade'),
  },
);
