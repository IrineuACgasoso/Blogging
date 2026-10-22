// Garante que as ferramentas de qualidade (tipos, lint, formatação, CI) continuam configuradas.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from '../lib/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const pkg = JSON.parse(read('package.json'));

test('o type-check cobre api/, lib/ e src/ (nada fica fora do tsc)', () => {
  assert.ok(JSON.parse(read('tsconfig.json')).include.includes('src'));
  assert.deepEqual(JSON.parse(read('tsconfig.server.json')).include.sort(), ['api', 'lib']);
  assert.match(pkg.scripts.typecheck, /tsconfig\.server\.json/);
  assert.match(pkg.scripts.build, /tsconfig\.server\.json/, 'o build precisa checar api/ também');
});

test('tsconfigs usam strict', () => {
  for (const f of ['tsconfig.json', 'tsconfig.server.json'])
    assert.equal(JSON.parse(read(f)).compilerOptions.strict, true, f);
});

test('ESLint mantém as regras de segurança (eval, new Function, javascript: URL)', () => {
  const cfg = read('eslint.config.js');
  for (const r of ['no-eval', 'no-implied-eval', 'no-new-func', 'no-script-url'])
    assert.ok(cfg.includes(r), `falta ${r}`);
});

test('scripts lint, format:check, typecheck, test e check existem', () => {
  for (const s of ['lint', 'format:check', 'typecheck', 'test', 'check'])
    assert.ok(pkg.scripts[s], `falta o script "${s}"`);
  assert.match(pkg.scripts.check, /lint/);
  assert.match(pkg.scripts.check, /typecheck/);
  assert.match(pkg.scripts.check, /test/);
});

test('CI (GitHub Actions) roda lint, formatação, tipos, build e testes, sem segredos', () => {
  const p = '.github/workflows/ci.yml';
  assert.ok(existsSync(join(ROOT, p)), 'falta .github/workflows/ci.yml');
  const ci = read(p);
  for (const cmd of ['npm run lint', 'npm run format:check', 'npm run typecheck', 'npm run build', 'npm test'])
    assert.ok(ci.includes(cmd), `o CI não roda "${cmd}"`);
  assert.ok(!/secrets\./.test(ci), 'o CI não deve usar secrets do repositório');
  assert.match(ci, /permissions:\s*\n\s+contents: read/, 'o CI deve ter permissão mínima (contents: read)');
});

test('funções da Vercel não usam `any` nos handlers (tipos de lib/http.ts)', () => {
  for (const f of ['api/cron/lineup.ts', 'api/account/delete.ts'])
    assert.ok(!/:\s*any\b/.test(read(f)), `${f} voltou a usar any`);
});
