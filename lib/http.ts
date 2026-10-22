// Tipos mínimos do que as funções da Vercel recebem (evita `any` sem depender de pacote extra).
export type ApiRequest = { method?: string; headers: Record<string, string | string[] | undefined> };
export type ApiResponse = {
  setHeader(name: string, value: string): unknown;
  status(code: number): ApiResponse;
  json(body: unknown): unknown;
  end(): unknown;
};
