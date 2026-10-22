// Testes estáticos: leem os arquivos do projeto e conferem regras de segurança e consistência.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from '../lib/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir, re = /./) =>
  !existsSync(join(ROOT, dir))
    ? []
    : readdirSync(join(ROOT, dir)).flatMap((n) => {
        const rel = `${dir}/${n}`;
        return statSync(join(ROOT, rel)).isDirectory() ? walk(rel, re) : re.test(n) ? [rel] : [];
      });
const srcFiles = walk('src', /\.(ts|tsx)$/);
const serverFiles = [...walk('api', /\.(ts|mjs|js)$/), ...walk('lib', /\.(ts|mjs|js)$/)].filter(
  (f) => !/\.test\./.test(f),
);
const envExample = read('.env.example');
const envNames = new Set([...envExample.matchAll(/^\s*([A-Z0-9_]+)=/gm)].map((m) => m[1]));
const sqlFiles = walk('supabase', /\.sql$/).sort();

test('imports relativos em api/ e lib/ terminam em .js (senão quebram na Vercel)', () => {
  const bad = [];
  for (const f of serverFiles)
    for (const m of read(f).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]*)['"]/g))
      if (!/\.(js|mjs|cjs|json)$/.test(m[1])) bad.push(`${f}: ${m[1]}`);
  assert.deepEqual(bad, []);
});

test('toda função em api/ exporta um handler padrão', () => {
  const bad = walk('api', /\.ts$/).filter((f) => !/export default (async )?function/.test(read(f)));
  assert.deepEqual(bad, []);
});

test('vercel.json: o cron aponta para um arquivo que existe e a agenda é válida', () => {
  const v = JSON.parse(read('vercel.json'));
  assert.ok(v.crons?.length, 'nenhum cron configurado');
  for (const c of v.crons) {
    assert.ok(existsSync(join(ROOT, `${c.path.replace(/^\//, '')}.ts`)), `${c.path} não tem arquivo em api/`);
    assert.equal(c.schedule.trim().split(/\s+/).length, 5, `agenda inválida: ${c.schedule}`);
  }
});

test('vercel.json: a regra de SPA não engole as rotas /api', () => {
  const v = JSON.parse(read('vercel.json'));
  const re = new RegExp(`^${v.rewrites[0].source}$`);
  assert.equal(re.test('/api/cron/lineup'), false);
  assert.equal(re.test('/post/qualquer-coisa'), true);
  assert.equal(re.test('/privacidade'), true);
});

test('o cron roda à meia-noite de Recife (03:00 UTC)', () => {
  assert.match(JSON.parse(read('vercel.json')).crons[0].schedule, /^0 3 \* \* \*$/);
});

test('a chave service_role nunca aparece no código do front-end (src/)', () => {
  const bad = srcFiles.filter((f) => /service_role|SERVICE_ROLE/i.test(read(f)));
  assert.deepEqual(bad, []);
});

test('.env.example não expõe segredo com prefixo VITE_ (vai para o navegador)', () => {
  const bad = [...envNames].filter((n) => n.startsWith('VITE_') && /SECRET|SERVICE|PRIVATE|CRON|PASSWORD/.test(n));
  assert.deepEqual(bad, []);
});

test('toda variável de ambiente usada em api/ e lib/ está documentada no .env.example', () => {
  const used = new Set(
    serverFiles.flatMap((f) => [...read(f).matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1])),
  );
  assert.deepEqual(
    [...used].filter((n) => !envNames.has(n)),
    [],
  );
});

test('toda variável VITE_* usada em src/ está documentada no .env.example', () => {
  const used = new Set(
    srcFiles.flatMap((f) => [...read(f).matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)].map((m) => m[1])),
  );
  assert.deepEqual(
    [...used].filter((n) => !envNames.has(n)),
    [],
  );
});

test('o front-end não usa APIs que injetam HTML (dangerouslySetInnerHTML, innerHTML, eval)', () => {
  const bad = srcFiles.filter((f) => /dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(/.test(read(f)));
  assert.deepEqual(bad, []);
});

test('Markdown continua sem HTML bruto (nada de rehype-raw / allowDangerousHtml)', () => {
  const pkg = JSON.parse(read('package.json'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.equal(deps.includes('rehype-raw'), false);
  assert.deepEqual(
    srcFiles.filter((f) => /allowDangerousHtml|rehype-raw|rehypeRaw/.test(read(f))),
    [],
  );
});

test('.gitignore protege .env.local, node_modules e o .env.test dos testes', () => {
  const g = read('.gitignore') + (existsSync(join(ROOT, 'tests/.gitignore')) ? read('tests/.gitignore') : '');
  for (const need of ['.env.local', 'node_modules', '.env.test'])
    assert.ok(g.includes(need), `falta ${need} no .gitignore`);
});

test('nenhum segredo real (JWT service_role, chave sk-) foi escrito no código', () => {
  const files = [...srcFiles, ...serverFiles, ...walk('supabase', /\.sql$/), 'README.md', '.env.example', 'index.html'];
  const bad = [];
  for (const f of files)
    for (const m of read(f).matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\./g)) {
      try {
        if (JSON.parse(Buffer.from(m[1], 'base64url').toString()).role === 'service_role') bad.push(f);
      } catch {
        /* não é JWT: ignora */
      }
    }
  for (const f of files) if (/sk-[A-Za-z0-9]{20,}/.test(read(f))) bad.push(f);
  assert.deepEqual(bad, []);
});

test('migrações SQL numeradas em sequência, sem buracos', () => {
  const nums = sqlFiles
    .map((f) => /\/(\d{3})_/.exec(f)?.[1])
    .filter(Boolean)
    .map(Number);
  assert.deepEqual(
    nums,
    nums.map((_, i) => i + 2),
    `numeração: ${nums}`,
  ); // schema.sql é a 001
});

test('README cita todas as migrações SQL (documentação não fica para trás)', () => {
  const readme = read('README.md');
  assert.deepEqual(
    sqlFiles.map((f) => f.split('/').pop()).filter((n) => !readme.includes(n)),
    [],
  );
});

test('toda função "security definer" fixa o search_path (evita sequestro de função)', () => {
  const bad = [];
  for (const f of sqlFiles) {
    const parts = read(f)
      .split(/(?=create\s+(?:or\s+replace\s+)?function)/i)
      .slice(1);
    for (const p of parts) {
      const head = p.slice(0, p.search(/\$\$/) > 0 ? p.search(/\$\$/) : 400);
      if (/security definer/i.test(p.slice(0, 600)) && !/set search_path/i.test(p.slice(0, 600)))
        bad.push(`${f}: ${/function\s+(\w+)/i.exec(head)?.[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('o package.json tem scripts de build e test, e o build checa os imports ESM', () => {
  const { scripts } = JSON.parse(read('package.json'));
  assert.ok(scripts.build.includes('check-esm-imports'));
  assert.ok(scripts.build.includes('tsc'));
  assert.ok(scripts.test);
});
