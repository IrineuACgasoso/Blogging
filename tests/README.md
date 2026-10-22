# Testes do blog

Uma pasta só, com todos os testes. Cada teste vira **uma linha**: `PASS` (verde), `FAIL` (vermelho) ou `SKIP` (amarelo, pulado), com o arquivo e o nome. No fim vem o total.

```
PASS  tests/db/cron.test.mjs  commit_day: segunda chamada no mesmo dia devolve false e NÃO rebaixa de novo
FAIL  tests/db/seguranca.test.mjs  leitora NÃO cria post
...
Total testados: 160   Passaram: 160   Falharam: 0
RESULTADO: TUDO CERTO
```

## 1. Instalar (uma vez só)

Precisa do Node 18 ou mais novo (o mesmo do projeto). Esta pasta `tests/` fica **dentro** do projeto, ao lado de `package.json`.

```bash
cd tests
npm install        # instala só o PGlite (um Postgres que roda sem instalar nada)
cd ..
```

Se você já instalou as dependências do projeto (`npm install` na raiz), o resto já está pronto.

## 2. Rodar

Sempre a partir da **raiz do projeto**:

```bash
npm test                      # tudo (equivale a: node tests/run.mjs)
node tests/run.mjs unit       # só uma pasta: static | unit | db | live
node tests/run.mjs db unit    # várias pastas
node tests/run.mjs -f cron    # só arquivos cujo nome contém "cron"
```

- Se algum teste falhar, o programa termina com "RESULTADO: FALHOU" e mostra, abaixo da lista, o motivo de cada falha.
- Sem cores (por exemplo, para colar num e-mail): `NO_COLOR=1 npm test` (Windows PowerShell: `$env:NO_COLOR=1; npm test`).
- Não aparece cor no Windows antigo (CMD)? Use o PowerShell ou o Windows Terminal.

## 3. O que cada pasta testa

| Pasta | Precisa de quê | O que garante |
|---|---|---|
| `static/` | nada (a auditoria de dependências precisa de internet; sem ela fica SKIP) | Regras lidas direto do código: nenhum `service_role` no front-end, sem HTML injetável, imports com `.js` (senão quebra na Vercel), variáveis de ambiente documentadas, cron aponta para arquivo existente, SQLs numerados e citados no README, funções `security definer` com `search_path` fixo. **Dependências:** `npm audit` sem nada novo/alto em produção (riscos aceitos ficam em `static/auditoria-aceita.json`, com o motivo). **Qualidade:** tipos cobrindo `api/`, regras de segurança do ESLint e CI configurados. |
| `unit/` | nada | Lógica pura: escalonador, virada do dia (`lib/lineup.ts`), autorização, exclusão de conta, utilitários (`slugify`, sorteio do dia, datas de Recife) e **proteção contra XSS no Markdown**. |
| `db/` | só o `npm install` acima | Roda **todos os SQLs do projeto** num Postgres de verdade (PGlite) e testa regras de acesso (RLS) como visitante, leitora e admin; publicação; curtidas; views; exclusão de conta; storage; e a virada do dia (atomicidade, repetição, corrida, mais de 1000 views). Também liga a lógica TypeScript do cron ao banco. |
| `live/` | **você configura** (seção 4) | Ataca o **site e o Supabase de verdade**: cron e exclusão de conta protegidos, pacote JS sem chave secreta, login por e-mail desligado, e tentativas de visitante e leitora fazerem o que não podem. |

`SKIP` não é erro: significa "falta configurar" (aparece o motivo ao lado). Mas só vale como seguro o que **passou**. Rode a pasta `live` pelo menos antes de cada mudança importante.

## 4. Configurar os testes `live`

1. Copie `tests/env.example` para `tests/.env.test` e preencha:
   - `SITE_URL`: endereço do blog na Vercel (sem `/` no final).
   - `SUPABASE_URL` e `SUPABASE_ANON_KEY`: Supabase › Project Settings › API (a chave **anon**, nunca a `service_role`).
2. Para os testes de **leitora logada**, preencha `READER_JWT` com o token de uma conta comum (não admin):
   1. Abra o blog no navegador e entre com uma conta Google **de leitora**.
   2. Aperte F12 › aba **Console** e cole:
      ```js
      JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')))).access_token
      ```
   3. Copie o texto longo que aparecer (sem as aspas) para `READER_JWT=`.
   O token vale ~1 hora. Se expirar, o teste mostra `SKIP` com o aviso: é só copiar outro.
3. (Opcional) Para testar o cron de verdade: coloque o mesmo `CRON_SECRET` da Vercel e `LIVE_RUN_CRON=1`. **Atenção:** isso executa a virada do dia (igual ao que o cron faz à meia-noite). Se der erro, o banco não muda; pode rodar de novo.

Cuidados: o `.env.test` já está no `.gitignore`, nunca o envie ao GitHub. Os testes `live` só tentam coisas que devem ser **negadas**. Se a segurança estiver quebrada e algo for criado, o teste reprova e o nome contém `__TESTE_APAGAR__` para você achar e apagar.

## 5. Quando rodar

| Momento | Comando |
|---|---|
| Antes de cada deploy | `npm test` (as três primeiras pastas rodam sozinhas; `live` fica SKIP se não configurado) |
| Depois de mexer em qualquer `.sql` | `node tests/run.mjs db` (e depois rode o SQL no Supabase) |
| Depois de cada deploy / mudança no Supabase | `node tests/run.mjs live` |
| Depois de ligar/desligar provedores em Authentication | `node tests/run.mjs live -f site` |

## 6. Limites (o que estes testes NÃO provam)

- O banco dos testes é o Postgres real, mas **não é o Supabase**: o `auth`, o `storage` e as permissões padrão são imitados (`tests/db/shim.sql`). Por isso existe a pasta `live`, que confere o Supabase de verdade.
- Os testes `live` foram validados contra um servidor de mentira (seguro e propositalmente quebrado), mas ainda não contra o seu Supabase real: se algum código de status for diferente do esperado, o teste mostra a resposta recebida e ajustamos.
- Não há teste de tela (navegador): aparência, fluxo do login com Google, envio e compressão de fotos. Ficam para uma etapa futura.
- O agendamento real da Vercel (horário do cron) só se confirma olhando os *Logs* depois da meia-noite.

## 7. Como adicionar um teste (para a gente continuar crescendo)

- **Lógica em `lib/` ou `src/lib/`**: crie `tests/unit/nome.test.ts` (vitest: `describe`/`it`/`expect`).
- **Regra de banco**: em `tests/db/*.test.mjs`, use `dbTest('o que deve acontecer', async (db) => { ... })`. Cada teste roda numa transação desfeita no final. Use `as(db, 'anon' | 'authenticated', ID.reader)` para agir como cada pessoa e `.denied(...)` para exigir que algo seja barrado.
- **Site/Supabase no ar**: em `tests/live/*.live.test.mjs`, use `test(nome, fn, { skip: need('VARIAVEL') })`.
- **Regra do projeto (arquivos/configuração)**: em `tests/static/projeto.test.mjs`.
- Todo bug corrigido deve ganhar um teste que falharia sem a correção. Foi assim com o `slugify` e o `publish_post`.
- Cada novo arquivo `.sql` em `supabase/` é aplicado automaticamente pelos testes `db`, na ordem do número.
