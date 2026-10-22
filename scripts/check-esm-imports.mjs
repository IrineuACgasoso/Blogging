// As funções da Vercel (api/) e o código que elas importam (lib/) rodam em Node ESM ("type": "module"),
// onde imports relativos SEM extensão quebram em produção (ERR_MODULE_NOT_FOUND). O TypeScript e o Vite
// aceitam sem extensão, então só o runtime reclama: por isso esta checagem roda antes do build.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['api', 'lib'];
const SPEC = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]*)['"]/g;
const bad = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|mts|js|mjs)$/.test(name) && !/\.test\./.test(name)) check(path);
  }
}
function check(path) {
  const src = readFileSync(path, 'utf8');
  for (const m of src.matchAll(SPEC)) {
    if (!/\.(js|mjs|cjs|json)$/.test(m[1])) bad.push(`${path}: import '${m[1]}' precisa terminar em .js`);
  }
}
ROOTS.forEach(walk);
if (bad.length) {
  console.error(bad.join('\n'));
  process.exit(1);
}
console.log('imports ESM ok');
