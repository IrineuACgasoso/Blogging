import { describe, it, expect } from 'vitest';
import { deleteAccount, type AccountDeps } from '../../lib/deleteAccount';

const UID = 'user-1';
function fake(o: Partial<AccountDeps> = {}) {
  const calls: string[] = [];
  const deps: AccountDeps = {
    userIdFromToken: async () => UID,
    isAdmin: async () => false,
    purgeViews: async (id) => {
      calls.push(`purge:${id}`);
    },
    deleteUser: async (id) => {
      calls.push(`delete:${id}`);
    },
    ...o,
  };
  return { deps, calls };
}
const H = 'Bearer abc.def.ghi';

describe('deleteAccount', () => {
  it('exclui: limpa visualizações, apaga o usuário e limpa de novo, nessa ordem', async () => {
    const { deps, calls } = fake();
    const r = await deleteAccount(H, deps);
    expect(r.status).toBe(200);
    expect(calls.join(',')).toBe(`purge:${UID},delete:${UID},purge:${UID}`);
  });
  it('401 sem token, com token malformado ou sem prefixo Bearer; nada é apagado', async () => {
    for (const h of [undefined, '', 'abc.def', 'Bearer ', 'Bearer a b', ['Bearer x']] as const) {
      const { deps, calls } = fake();
      expect((await deleteAccount(h as any, deps)).status).toBe(401);
      expect(calls.length).toBe(0);
    }
  });
  it('401 quando o token não corresponde a nenhum usuário', async () => {
    const { deps, calls } = fake({ userIdFromToken: async () => null });
    expect((await deleteAccount(H, deps)).status).toBe(401);
    expect(calls.length).toBe(0);
  });
  it('403 para admin e nada é apagado', async () => {
    const { deps, calls } = fake({ isAdmin: async () => true });
    expect((await deleteAccount(H, deps)).status).toBe(403);
    expect(calls.length).toBe(0);
  });
  it('falha fechado: erro ao consultar admin => 500 e nada é apagado', async () => {
    const { deps, calls } = fake({
      isAdmin: async () => {
        throw new Error('db down');
      },
    });
    expect((await deleteAccount(H, deps)).status).toBe(500);
    expect(calls.length).toBe(0);
  });
  it('se a limpeza inicial falhar, o usuário NÃO é apagado (dá para tentar de novo)', async () => {
    const { deps, calls } = fake({
      purgeViews: async () => {
        throw new Error('boom');
      },
    });
    expect((await deleteAccount(H, deps)).status).toBe(500);
    expect(calls.length).toBe(0);
  });
  it('se apagar o usuário falhar, responde 500', async () => {
    const { deps } = fake({
      deleteUser: async () => {
        throw new Error('boom');
      },
    });
    expect((await deleteAccount(H, deps)).status).toBe(500);
  });
  it('falha só na limpeza final: a exclusão já feita continua sendo sucesso', async () => {
    let n = 0;
    const { deps } = fake({
      purgeViews: async () => {
        if (++n === 2) throw new Error('late');
      },
    });
    expect((await deleteAccount(H, deps)).status).toBe(200);
  });
  it('o id apagado vem sempre do token validado', async () => {
    const { deps, calls } = fake({ userIdFromToken: async (t) => (t === 'abc.def.ghi' ? 'dono-do-token' : null) });
    await deleteAccount(H, deps);
    expect(calls.join(',')).toBe('purge:dono-do-token,delete:dono-do-token,purge:dono-do-token');
  });
});
