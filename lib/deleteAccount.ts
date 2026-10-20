import { bearerToken } from './auth';

// Regra de negócio da exclusão de conta, sem I/O direto: as dependências são injetadas
// (o handler liga ao Supabase; os testes usam fakes).
export type AccountDeps = {
  userIdFromToken(token: string): Promise<string | null>;
  isAdmin(userId: string): Promise<boolean>;
  /** Apaga os registros de visualização ligados ao id da conta. Lança erro em caso de falha. */
  purgeViews(userId: string): Promise<void>;
  /** Apaga o usuário (perfil, curtidas e linha em admins saem por ON DELETE CASCADE). */
  deleteUser(userId: string): Promise<void>;
  log?(message: string, err: unknown): void;
};

export type Outcome = { status: 200 | 401 | 403 | 500; body: { ok: true } | { error: string } };

const fail = (status: 401 | 403 | 500, error: string): Outcome => ({ status, body: { error } });

export async function deleteAccount(authHeader: string | string[] | undefined, deps: AccountDeps): Promise<Outcome> {
  const token = bearerToken(authHeader);
  if (!token) return fail(401, 'Sessão inválida. Entre novamente.');
  try {
    const uid = await deps.userIdFromToken(token);
    if (!uid) return fail(401, 'Sessão inválida. Entre novamente.');
    // Falha fechado: se não der para saber se é admin, a exceção cai no catch e nada é apagado.
    if (await deps.isAdmin(uid)) return fail(403, 'Contas de administradora não podem ser excluídas por aqui.');

    await deps.purgeViews(uid);
    await deps.deleteUser(uid);
    // O token antigo ainda vale por até 1 h: uma visualização registrada nesse intervalo reintroduziria
    // o id. A segunda limpeza é "melhor esforço" e nunca transforma uma exclusão feita em erro.
    await deps.purgeViews(uid).catch((err) => deps.log?.('post-delete purge failed', err));
    return { status: 200, body: { ok: true } };
  } catch (err) {
    deps.log?.('delete-account failed', err);
    return fail(500, 'Não foi possível excluir a conta agora. Tente novamente em instantes.');
  }
}
