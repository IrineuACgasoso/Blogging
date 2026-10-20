import { describe, it, expect } from 'vitest';
import { isAuthorized, bearerToken } from './auth';

const SECRET = 'a-very-long-random-secret-123';

describe('isAuthorized (cron)', () => {
  it('aceita o segredo correto', () => {
    expect(isAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });
  it('falha fechado quando o segredo não está configurado', () => {
    expect(isAuthorized('Bearer undefined', undefined)).toBe(false);
    expect(isAuthorized('Bearer ', '')).toBe(false);
    expect(isAuthorized('Bearer', undefined)).toBe(false);
  });
  it('recusa segredo curto demais, mesmo que o header coincida', () => {
    expect(isAuthorized('Bearer abc', 'abc')).toBe(false);
  });
  it('recusa header ausente, repetido (array) ou sem o prefixo Bearer', () => {
    expect(isAuthorized(undefined, SECRET)).toBe(false);
    expect(isAuthorized([`Bearer ${SECRET}`], SECRET)).toBe(false);
    expect(isAuthorized(SECRET, SECRET)).toBe(false);
  });
  it('recusa segredo errado, prefixo, sufixo e tamanhos diferentes', () => {
    expect(isAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorized(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false);
    expect(isAuthorized(`Bearer ${SECRET.replace('a', 'b')}`, SECRET)).toBe(false);
    expect(isAuthorized(`bearer ${SECRET}`, SECRET)).toBe(false);
  });
});

describe('bearerToken', () => {
  it('extrai um JWT válido', () => {
    expect(bearerToken('Bearer aaa.bbb.ccc')).toBe('aaa.bbb.ccc');
  });
  it('retorna null para ausente, vazio, sem prefixo, com espaços ou array', () => {
    for (const h of [undefined, '', 'Bearer', 'Bearer ', 'aaa.bbb', 'Bearer a b', 'bearer aaa', ['Bearer aaa']]) {
      expect(bearerToken(h as any)).toBe(null);
    }
  });
  it('recusa header gigante', () => {
    expect(bearerToken('Bearer ' + 'a'.repeat(5000))).toBe(null);
  });
});
