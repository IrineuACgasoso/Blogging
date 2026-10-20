# Blog da Namorada

Blog pessoal com cara de "rede social privada": tema retrô (papel envelhecido + cartões brancos + títulos em vermelho), login somente com Google (sessão persistente), tela inicial em colagem de publicações e fotografias, curtidas, painel da autora e um **escalonador MLFQ** que escolhe quais posts aparecem na tela inicial a cada dia.

**Stack:** React + Vite + TypeScript · Supabase (Postgres, Auth, RLS) · Vercel (hospedagem + cron diário).

## O que cada parte faz

| Pasta/arquivo | Função |
|---|---|
| `supabase/schema.sql` | Tabelas, regras de segurança (RLS) e funções do banco (publicar, views, virada do dia). Roda uma vez. |
| `lib/scheduler.ts` | O cérebro do MLFQ: calcula a pontuação de cada post e sorteia a vitrine do dia. Código puro, com testes (`lib/scheduler.test.ts`). |
| `api/cron/lineup.ts` | Função que a Vercel roda todo dia à meia-noite (horário de Recife) para montar a vitrine do dia. |
| `src/pages/*` | Telas: Início, Tema, Publicação, Sobre mim, Painel (admin). |
| `src/components/*` | Menu lateral, popups de conta/login, cartão de post. |
| `vercel.json` | Agenda do cron + rota SPA. |

### Como o escalonador decide (resumo)
- **Post novo:** ao publicar, vai para a posição 1 da vitrine *na hora*; os demais só descem uma posição, **sem recalcular prioridade de ninguém**.
- **Virada do dia (00:00 Recife):** (1) os posts exibidos ontem são **rebaixados** de nível e têm o "tempo sem aparecer" zerado; (2) todos os posts recebem nota = nível × (recência + fome + popularidade); (3) 6 posts são sorteados proporcionalmente à nota.
- **Recência:** cai com os dias desde a publicação. **Fome (anti-limbo):** sobe com os dias desde a última exibição e zera quando aparece.
- **Temas:** tema repetido no mesmo dia pesa 15% por repetição; tema há muito tempo sem aparecer ganha bônus.
- **Popularidade:** views dos últimos 7 dias + curtidas (curtida vale 3 views). Views: 1 por visitante por dia (logado = id da conta; anônimo = id aleatório no navegador).
- Os pesos ficam no topo de `lib/scheduler.ts` para ajuste fino.

## Passo a passo: rodar e testar localmente

1. Instale Node 18+ e rode `npm install`.
2. **Crie o projeto no Supabase** (supabase.com, plano gratuito). Na tela de criação, em *Security*: deixe **Enable Data API marcado** (obrigatório), **Automatically expose new tables desmarcado** (o `schema.sql` já libera só o necessário) e *Enable automatic RLS* à sua escolha (marcar é seguro).
3. No Supabase: **SQL Editor** → cole todo o `supabase/schema.sql` → Run. Depois `supabase/002_fotos.sql` → Run (fotografias e armazenamento de imagens) e `supabase/003_google_login.sql` → Run (cadastro robusto para login Google).
4. No Supabase: **Authentication → URL Configuration**: em *Site URL* coloque `http://localhost:5173` e adicione em *Redirect URLs* `http://localhost:5173/**` (depois adicione também o endereço da Vercel).
5. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API) e `VITE_BLOG_NAME`.
6. `npm run dev` e abra http://localhost:5173.
7. **Configure o login com Google** (seção abaixo). Depois clique no ícone de pessoa → Entrar → *Entrar com o Google*. Faça isso com **as duas contas** (a sua e a dela) **antes de divulgar o site**, e rode o passo 8 logo em seguida.
8. **Defina os admins** no SQL Editor (só você consegue fazer isso, pelo banco):
   ```sql
   insert into admins select id from auth.users where email in ('voce@email.com','ela@email.com');
   ```
9. Recarregue o site: o menu lateral mostra **Painel da autora**. Crie temas, escreva a biografia, publique um post.
10. Teste com uma conta comum (janela anônima): ler, curtir, ver conta. Ela **não** deve ver o painel; abrir `/admin` redireciona para o início.

### Login com Google (configuração única)
1. No [Google Cloud Console](https://console.cloud.google.com), crie um projeto. Em **Google Auth Platform** (ou *APIs e serviços → Tela de consentimento OAuth*): tipo de usuário **Externo**, preencha nome do app e e-mail de suporte, e mantenha só os escopos `openid`, `email` e `profile`.
2. **Publique o app** ("Em produção"). Se ficar em "Teste", só os e-mails cadastrados como testadores conseguem entrar. Com esses escopos básicos não é exigida verificação do Google.
3. Em **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**. Em *URIs de redirecionamento autorizados* coloque a **Callback URL** que o Supabase mostra em *Authentication → Sign In / Providers → Google* (formato `https://SEU-PROJETO.supabase.co/auth/v1/callback`).
4. Copie o **Client ID** e o **Client Secret** para essa mesma página do Supabase, ative o provedor Google e salve. O secret fica só no Supabase, nunca no código.
5. Confira *Authentication → URL Configuration* (Site URL e Redirect URLs com `http://localhost:5173/**` e o endereço da Vercel).
6. **Depois de confirmar que o login Google funciona** (e que seu admin está de pé, passo 8), vá em *Authentication → Sign In / Providers → Email* e **desligue o provedor Email**. Isso é obrigatório: remover o formulário do site não impede que alguém chame o cadastro por senha diretamente na API.

### Testes automáticos
`npm test` roda os testes do escalonador (recência, anti-limbo, rebaixamento, sem repetição de tema).

### Checklist manual
- [ ] Publicar post → aparece em primeiro na Início imediatamente.
- [ ] Publicar um 2º post → ele vai para o topo e o anterior desce.
- [ ] Curtir sem login abre o popup de login; logado, o contador sobe/desce.
- [ ] Tema → ordenar por recentes / mais vistos / mais curtidos.
- [ ] Excluir tema com posts mostra aviso (não apaga).

## Deploy na Vercel

1. Suba o projeto para um repositório no GitHub (`.env.local` já está no `.gitignore`).
2. Em vercel.com → **Add New Project** → importe o repositório (o preset Vite é detectado).
3. Em **Environment Variables** cadastre:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BLOG_NAME`, `VITE_CONTROLLER_NAME`, `VITE_CONTACT_EMAIL` (as duas últimas aparecem na página `/privacidade`)
   - `SUPABASE_URL` (mesmo valor), `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API → *service_role*; **segredo, nunca com prefixo VITE_**)
   - `CRON_SECRET` (qualquer texto longo e aleatório)
4. Deploy. Depois, adicione a URL da Vercel em **Supabase → Authentication → URL Configuration** (Site URL e Redirect URLs).
5. **Testar o cron manualmente** (no terminal):
   ```bash
   curl -H "Authorization: Bearer SEU_CRON_SECRET" https://SEU-SITE.vercel.app/api/cron/lineup
   ```
   Resposta esperada na 1ª vez: `{"day":"...","items":[...]}`; repetindo no mesmo dia: `{"skipped":"already ran today"}` (é proposital: evita rebaixar duas vezes).
   Se o cron falhar num dia, a Início completa a vitrine com os posts mais recentes (fallback), então nunca fica vazia.
   Nota: o plano Hobby da Vercel permite cron diário (a execução pode variar dentro da hora agendada).

## Segurança (resumo)
- Login somente com Google (o site nunca vê senha). Admin é um *id de conta* na tabela `admins`, definido só por você via SQL: crie as duas contas de admin primeiro e promova-as logo, assim ninguém consegue "tomar" esses e-mails.
- Fotos: enviadas só por admin (regra no bucket), reduzidas a 1800px e reencodadas (isso remove localização/EXIF). Nos textos só entram imagens do nosso bucket.
- Admin = linha na tabela `admins`, editável só via SQL. Todas as permissões são impostas por **RLS no banco**; esconder botões no front é só cosmético.
- Textos em Markdown renderizados sem HTML bruto (proteção contra XSS).
- A chave `service_role` só existe na Vercel (backend).

## Ideias para depois
agendamento de publicação, busca de texto, RSS, e moderar/ligar comentários.
