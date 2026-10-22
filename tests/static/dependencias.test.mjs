// Auditoria de dependências (npm audit). Precisa de internet; sem ela, os testes aparecem como SKIP.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test, assert, Skip } from '../lib/harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const aceitas = JSON.parse(readFileSync(join(HERE, 'auditoria-aceita.json'), 'utf8'));

/** Roda `npm audit --json` e devolve a lista de avisos { id, pacote, gravidade, titulo }. */
function audit(cwd, extra = []) {
  const r = spawnSync('npm', ['audit', ...extra, '--json'], { cwd, shell: true, encoding: 'utf8', timeout: 60_000 });
  let json;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    throw new Skip('não consegui rodar o npm audit (sem internet?)');
  }
  if (json.error || !json.vulnerabilities)
    throw new Skip(`npm audit indisponível: ${json.error?.summary || 'sem resposta do registro'}`);
  const out = new Map();
  for (const [pacote, v] of Object.entries(json.vulnerabilities))
    for (const via of v.via) {
      if (typeof via === 'string') continue;
      const id = /GHSA-[\w-]+/.exec(via.url || '')?.[0] ?? via.url ?? via.title;
      out.set(id, { id, pacote, gravidade: via.severity, titulo: via.title });
    }
  return [...out.values()];
}
const fmt = (l) => l.map((a) => `${a.id} [${a.gravidade}] ${a.pacote}: ${a.titulo}`).join('\n');

test('dependências de PRODUÇÃO: nenhuma vulnerabilidade nova, e nenhuma alta/crítica', () => {
  const achados = audit(ROOT, ['--omit=dev']);
  const graves = achados.filter((a) => a.gravidade === 'high' || a.gravidade === 'critical');
  assert.equal(graves.length, 0, `ALTA/CRÍTICA em produção:\n${fmt(graves)}`);
  const novas = achados.filter((a) => !(a.id in aceitas.producao));
  assert.equal(
    novas.length,
    0,
    `vulnerabilidade nova em produção (atualize o pacote ou, se for aceitável, registre o motivo em tests/static/auditoria-aceita.json):\n${fmt(novas)}`,
  );
});

test('ferramentas de DESENVOLVIMENTO: nenhuma vulnerabilidade nova além das já registradas', () => {
  const novas = audit(ROOT).filter((a) => !(a.id in aceitas.desenvolvimento));
  assert.equal(novas.length, 0, `vulnerabilidade nova em ferramentas de dev:\n${fmt(novas)}`);
});

test('dependências da pasta tests/ (PGlite): nenhuma alta ou crítica', () => {
  const graves = audit(HERE.replace(/static$/, '')).filter((a) => a.gravidade === 'high' || a.gravidade === 'critical');
  assert.equal(graves.length, 0, fmt(graves));
});

test('package-lock.json existe e as dependências estão fixadas por ele (build reproduzível)', () => {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  for (const n of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }))
    assert.ok(lock.packages?.[`node_modules/${n}`], `${n} está no package.json mas não no package-lock.json`);
});
