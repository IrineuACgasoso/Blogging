// Autorização do cron: pura e sem dependências, para ser testável e rodar em qualquer runtime.

const MIN_SECRET_LENGTH = 16;

/** Comparação em tempo (quase) constante: não vaza, pelo tempo de resposta, quantos caracteres batem. */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * Valida `Authorization: Bearer <segredo>`. Falha fechado: sem segredo configurado
 * (ou curto demais) NENHUM header é aceito, nem o literal "Bearer undefined".
 */
export function isAuthorized(header: string | string[] | undefined, secret: string | undefined): boolean {
  if (typeof header !== 'string' || !secret || secret.length < MIN_SECRET_LENGTH) return false;
  return safeEqual(header, `Bearer ${secret}`);
}
