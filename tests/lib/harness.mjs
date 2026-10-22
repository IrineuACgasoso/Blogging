// Mini-framework dos testes .mjs (static, db, live). Os testes de unit/ usam o vitest (veja run.mjs).
// Uso:  import { test } from '../lib/harness.mjs';   test('o que deve acontecer', async () => { ...lança erro se falhar... });
// Para pular com motivo (ex.: falta configurar): test('nome', fn, { skip: 'defina SITE_URL' })
import assert from 'node:assert/strict';

export const registry = [];
export { assert };

export function test(name, fn, opts = {}) {
  registry.push({ file: globalThis.__testFile ?? '?', name, fn, skip: opts.skip || null });
}

/** Dentro de um teste: `throw new Skip('motivo')` marca o teste como PULADO (ex.: falta um dado no ambiente). */
export class Skip extends Error {}
