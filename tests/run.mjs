#!/usr/bin/env node
// Executor de testes do blog.  Uso (na RAIZ do projeto):
//   node tests/run.mjs              -> tudo
//   node tests/run.mjs unit db      -> só essas pastas (static | unit | db | live)
//   node tests/run.mjs -f cron      -> só arquivos cujo caminho contém "cron"
// Saída: uma linha por teste (PASS/FAIL/SKIP + arquivo + nome) e o total no fim. Código de saída 1 se algo falhar.
import { readdirSync, readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { registry, Skip } from './lib/harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const GROUPS = ['static', 'unit', 'db', 'live'];
const TIMEOUT_MS = 60_000;

const useColor = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const TAG = { PASS: paint('1;32', 'PASS'), FAIL: paint('1;31', 'FAIL'), SKIP: paint('1;33', 'SKIP') };

// ---- argumentos
const args = process.argv.slice(2);
let fileFilter = null;
const groups = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-f') fileFilter = args[++i];
  else if (GROUPS.includes(args[i])) groups.push(args[i]);
  else {
    console.error(`Argumento desconhecido: ${args[i]}\nUse: ${GROUPS.join(' | ')} ou -f <trecho-do-arquivo>`);
    process.exit(2);
  }
}
const selected = groups.length ? groups : GROUPS;

if (!existsSync(join(ROOT, 'package.json')) || !existsSync(join(ROOT, 'lib'))) {
  console.error(
    'Não achei o projeto. Extraia a pasta "tests" dentro da pasta do blog (ao lado de package.json) e rode: node tests/run.mjs',
  );
  process.exit(2);
}

// ---- .env.test (só para os testes "live"); variáveis já definidas no terminal têm prioridade
const envFile = join(HERE, '.env.test');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');
const results = []; // { status, file, name, detail }
const line = (status, file, name, extra = '') => {
  console.log(`${TAG[status]}  ${file}  ${name}${extra ? paint('2', `  (${extra})`) : ''}`);
};
const record = (status, file, name, detail = '') => {
  results.push({ status, file, name, detail });
  line(status, file, name, status === 'SKIP' ? detail : '');
};

function listFiles(dir, re) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? listFiles(join(dir, d.name), re) : re.test(d.name) ? [join(dir, d.name)] : []))
    .sort();
}
const keep = (path) => !fileFilter || rel(path).includes(fileFilter);

// ---- arquivos .test.ts/.tsx (vitest), em qualquer pasta de grupo
function runVitest(group) {
  const files = listFiles(join(HERE, group), /\.test\.tsx?$/).filter(keep);
  if (!files.length) return;
  const out = join(mkdtempSync(join(tmpdir(), 'blogtests-')), 'vitest.json');
  const r = spawnSync(
    'npx',
    ['--no-install', 'vitest', 'run', ...files.map(rel), '--reporter=json', `--outputFile=${out}`],
    { cwd: ROOT, shell: true, encoding: 'utf8' },
  );
  if (!existsSync(out)) {
    record(
      'FAIL',
      `tests/${group}`,
      'vitest não executou',
      (r.stderr || r.stdout || 'sem saída').trim().split('\n').slice(-8).join('\n'),
    );
    return;
  }
  const json = JSON.parse(readFileSync(out, 'utf8'));
  for (const f of json.testResults.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = rel(f.name);
    if (!f.assertionResults.length) record('FAIL', file, 'arquivo não executou nenhum teste', f.message || '');
    for (const t of f.assertionResults) {
      const name = [...t.ancestorTitles, t.title].join(' › ');
      if (t.status === 'passed') record('PASS', file, name);
      else if (t.status === 'pending' || t.status === 'skipped' || t.status === 'todo')
        record('SKIP', file, name, 'pulado no código');
      else
        record(
          'FAIL',
          file,
          name,
          (t.failureMessages || [])
            .join('\n')
            .split('\n')
            .filter((l) => !/^\s+at /.test(l))
            .join('\n'),
        );
    }
  }
}

// ---- static / db / live (mini-framework)
async function runModules(group) {
  const files = listFiles(join(HERE, group), /\.test\.mjs$/).filter(keep);
  for (const f of files) {
    const before = registry.length;
    globalThis.__testFile = rel(f);
    try {
      await import(pathToFileURL(f).href);
    } catch (e) {
      record(
        'FAIL',
        rel(f),
        'arquivo não carregou',
        e?.message?.includes('pglite') ? 'Falta instalar: cd tests && npm install' : String(e?.stack || e),
      );
      continue;
    }
    for (const t of registry.splice(before)) {
      if (t.skip) {
        record('SKIP', t.file, t.name, t.skip);
        continue;
      }
      let timer;
      try {
        await Promise.race([
          t.fn(),
          new Promise((_, rej) => {
            timer = setTimeout(() => rej(new Error(`demorou mais de ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
          }),
        ]);
        record('PASS', t.file, t.name);
      } catch (e) {
        if (e instanceof Skip) record('SKIP', t.file, t.name, e.message);
        else record('FAIL', t.file, t.name, e?.message || String(e));
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

console.log(paint('2', `Rodando: ${selected.join(', ')}${fileFilter ? ` (arquivos com "${fileFilter}")` : ''}\n`));
for (const g of selected) {
  runVitest(g);
  await runModules(g);
}

// ---- resumo
const count = (s) => results.filter((r) => r.status === s).length;
const [pass, fail, skip] = [count('PASS'), count('FAIL'), count('SKIP')];
const failed = results.filter((r) => r.status === 'FAIL');
if (failed.length) {
  console.log(`\n${paint('1;31', 'Detalhes das falhas')}`);
  for (const r of failed)
    console.log(
      `\n• ${r.file} › ${r.name}\n${r.detail
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n')}`,
    );
}
console.log(`\n${'─'.repeat(60)}`);
console.log(
  `Total testados: ${results.length - skip}   ${paint('1;32', `Passaram: ${pass}`)}   ${fail ? paint('1;31', `Falharam: ${fail}`) : 'Falharam: 0'}` +
    (skip ? `   ${paint('1;33', `Pulados: ${skip}`)} (veja tests/README.md)` : ''),
);
console.log(
  fail
    ? paint('1;31', 'RESULTADO: FALHOU')
    : results.length - skip === 0
      ? paint('1;33', 'RESULTADO: NADA FOI TESTADO')
      : paint('1;32', 'RESULTADO: TUDO CERTO'),
);
process.exit(fail ? 1 : 0);
