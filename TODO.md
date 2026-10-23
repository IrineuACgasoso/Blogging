# TODO

Atualizado em 23/10/2026.

Legenda: `[x]` feito · `[ ]` pendente. "Falta testar" = o código está pronto, mas ainda não foi confirmado no ar.
Confirmados no ar até agora: login Google, acesso de admin, exclusão de conta e o endereço do cron respondendo com o segredo certo.
Banco: `schema.sql`, `002`, `003`, `004` e `005` já rodados no Supabase.

## 🔴 Urgente (antes de divulgar)

- [ ] **1. Testar as regras de segurança** (visitante e leitor tentando criar post, curtir, ler rascunho, subir foto, chamar `publish_post`)
- [ ] **2. Backup semanal**, incluindo o bucket de fotos além do banco
- [x] **3. Privacidade e LGPD**
  - [x] Página `/privacidade`
  - [x] Aviso no login
  - [x] Botão "Excluir minha conta" (testado)
  - [ ] Revisão do texto por quem entenda de LGPD
  - [x] Conferir que o e-mail de contato aparece na página
- [x] **4. Esqueci a senha e SMTP** — não se aplica (login só Google; provedor Email desativado)
- [x] **5. Anti-bot (CAPTCHA)** — coberto pelo login só Google
- [ ] **6. Proteger o admin**
  - [x] Login Google, com admin confirmado
  - [ ] Ativar a verificação em duas etapas nas contas Google das duas admins
- [x] **Google, em *Público-alvo*: confirmar que o status é "Em produção"** (em "Testando", só os testadores entram)

## 🛠 Descobertos na análise

- [x] Cron fecha o acesso quando falta o segredo (falta testar)
- [x] `/admin` não expulsa mais a admin ao recarregar (falta testar)
- [x] Proteção contra duplo clique em "Publicar" (falta testar)
- [x] Imports ESM corrigidos nas funções da Vercel, com checagem no build
- [x] **Testar o cron** com o `curl` do README: respondeu `skipped / already ran today` (segredo aceito, banco respondeu)
- [ ] **Conferir que a vitrine de hoje foi gravada**: rodar no SQL Editor a consulta de `daily_lineup` do dia (está no README, passo 5) e ver até 6 linhas
- [ ] **Confirmar que o deploy novo está no ar** (código com `commit_day`): a resposta `skipped` é igual na versão antiga e na nova; ver na Vercel o último deploy e rodar `node tests/run.mjs live`
- [ ] **Conferir a execução automática da meia-noite**: na Vercel, *Settings › Cron Jobs* / *Logs*, depois da 00h de Recife
- [ ] **Subir o código novo ao GitHub e ver o CI verde** (aba *Actions*); opcional: exigir CI verde em *Settings › Branches*
- [ ] **Configurar os testes `live`** (`tests/.env.test`, passo a passo em `tests/README.md`) e rodar `node tests/run.mjs live`
- [x] Confirmar que `supabase/003_google_login.sql` foi rodado
- [x] **Cron atômico** (`004_cron_atomico.sql` rodado; falta só a conferência no ar listada acima): leitura em snapshot único + gravação em transação única (`commit_day`); contagem de views agregada no banco (acabou o limite silencioso de 1000 linhas). Falhou => nada muda e o `curl` pode ser repetido
- [ ] **Rascunho automático no editor**, para não perder texto numa sessão expirada
- [x] Republicar um post já na vitrine derrubava outro e deixava buraco (`005_publish_sem_buraco.sql`, já rodado)
- [ ] Limitar abuso e crescimento de `post_views` (poda de registros antigos)
- [ ] Upload de foto: excluir primeiro a linha do banco e depois o arquivo; tratar WebP no Safari antigo; `bmp.close()`
- [x] Qualidade: type-check da pasta `api/` (`tsconfig.server.json`, já no build), ESLint (com regras anti-`eval`), Prettier e CI no GitHub (`.github/workflows/ci.yml`)
- [x] Auditoria de dependências automática nos testes (`tests/static/dependencias.test.mjs`)
- [ ] **Atualizar dependências com vulnerabilidades conhecidas** (etapa própria, com teste no navegador): `react-router-dom` 6 → 7 (único de produção, moderado, não explorável hoje) e, só de desenvolvimento, `vite` e `vitest` (ver `tests/static/auditoria-aceita.json`)
- [ ] Escalonador: "priority boost" para os níveis não convergirem todos ao 3

## 🟠 Médio

- [ ] 7. Pré-visualização nas redes (Open Graph)
- [ ] 8. Prévia ao vivo do Markdown no editor
- [ ] 9. Comentários com moderação
- [ ] 10. Busca e paginação
- [ ] 11. Agendamento de publicação e rascunho com link privado
- [ ] 12. Fotos mais leves (miniaturas) e divisão do pacote de 535 kB
- [ ] 13. Alerta se o cron falhar e monitor de erros (depende do cron atômico)
- [ ] 14. Cabeçalhos de segurança no `vercel.json` e domínio próprio

## 🟢 Baixo

- [ ] 15. Galeria com todas as fotografias
- [ ] 16. Estatísticas para a autora
- [ ] 17. Compartilhar, tempo de leitura e posts relacionados
- [ ] 18. RSS e newsletter
- [ ] 19. Modo escuro e variações sazonais
- [ ] 20. Seguir temas e salvar favoritos
- [ ] 21. Exibir imagem do email no ícone

## Ordem sugerida

1. Fechar as conferências do cron (vitrine de hoje, deploy novo, execução da meia-noite) e ver o CI verde no GitHub
2. Backup (item 2)
3. Parte 3: rascunho automático no editor + correções do upload de foto (com testes)
4. Parte 4: poda e limite de `post_views` + "priority boost" do escalonador
5. Parte 5: cabeçalhos de segurança, domínio próprio e alerta de falha do cron (itens 13 e 14)
6. Atualizar dependências (`react-router` 7, `vite`, `vitest`) com teste no navegador
