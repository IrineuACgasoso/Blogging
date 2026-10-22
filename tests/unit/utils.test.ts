import { describe, it, expect } from 'vitest';
import { slugify, seededRng, shuffle, hash, fmtDate, errMessage } from '../../src/lib/utils';

describe('slugify', () => {
  it('remove acentos e troca espaços/símbolos por hífen', () => {
    expect(slugify('Ação & Reação: Poesia!')).toBe('acao-reacao-poesia');
  });
  it('nunca devolve vazio (cai em "item")', () => {
    expect(slugify('!!!')).toBe('item');
    expect(slugify('')).toBe('item');
  });
  it('corta em 60 caracteres sem deixar hífen na ponta', () => {
    const s = slugify('a'.repeat(59) + ' b ' + 'c'.repeat(20));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s).not.toMatch(/^-|-$/);
  });
  it('só gera caracteres seguros para URL', () => {
    expect(slugify('Olá/Mundo?x=1#y ../../etc')).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('aleatoriedade determinística (colagem do dia)', () => {
  it('mesma semente => mesma sequência; sementes diferentes => sequências diferentes', () => {
    const a = seededRng('2026-10-21'),
      b = seededRng('2026-10-21'),
      c = seededRng('2026-10-22');
    const sa = [a(), a(), a()],
      sb = [b(), b(), b()],
      sc = [c(), c(), c()];
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });
  it('valores sempre em [0, 1)', () => {
    const r = seededRng('x');
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('shuffle é uma permutação (não perde nem duplica) e não altera o original', () => {
    const orig = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(orig, seededRng('s'));
    expect([...out].sort()).toEqual(orig);
    expect(orig).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('shuffle com a mesma semente dá a mesma ordem durante o dia', () => {
    const arr = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(arr, seededRng('dia'))).toEqual(shuffle(arr, seededRng('dia')));
  });
  it('hash é estável', () => {
    expect(hash('abc')).toBe(hash('abc'));
    expect(hash('abc')).not.toBe(hash('abd'));
  });
});

describe('fmtDate (fuso de Recife)', () => {
  it('00:30 UTC ainda é o dia anterior em Recife (UTC-3)', () => {
    expect(fmtDate('2026-10-21T00:30:00Z')).toContain('20');
  });
  it('formata em português', () => {
    expect(fmtDate('2026-03-05T15:00:00Z')).toMatch(/5 de março de 2026/);
  });
});

describe('errMessage', () => {
  it('lê a mensagem de um Error e de um objeto simples (como os erros do Supabase)', () => {
    expect(errMessage(new Error('falhou'), 'x')).toBe('falhou');
    expect(errMessage({ message: 'sem permissão', code: '42501' }, 'x')).toBe('sem permissão');
  });
  it('usa o texto padrão para qualquer outra coisa', () => {
    for (const v of [null, undefined, 'texto', 42, {}, { message: '' }, { message: 123 }])
      expect(errMessage(v, 'padrão')).toBe('padrão');
  });
});
