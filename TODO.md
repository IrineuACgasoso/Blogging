# TODO

Atualizado em 22/10/2026.

Legenda: `[x]` feito · `[ ]` pendente. "Falta testar" = o código está pronto, mas ainda não foi confirmado no ar.
Confirmados no ar até agora: login Google, acesso de admin e exclusão de conta.

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
- [ ] **Testar o cron** com o `curl` do README (provavelmente nunca rodou por causa dos imports)
- [x] Confirmar que `supabase/003_google_login.sql` foi rodado
- [x] **Cron atômico** (falta rodar `004_cron_atomico.sql` no Supabase e testar no ar): leitura em snapshot único + gravação em transação única (`commit_day`); contagem de views agregada no banco (acabou o limite silencioso de 1000 linhas). Falhou => nada muda e o `curl` pode ser repetido
- [ ] **Rascunho automático no editor**, para não perder texto numa sessão expirada
- [x] Republicar um post já na vitrine derrubava outro e deixava buraco (`005_publish_sem_buraco.sql`, falta rodar no Supabase)
- [ ] Limitar abuso e crescimento de `post_views` (poda de registros antigos)
- [ ] Upload de foto: excluir primeiro a linha do banco e depois o arquivo; tratar WebP no Safari antigo; `bmp.close()`
- [x] Qualidade: type-check da pasta `api/` (`tsconfig.server.json`, já no build), ESLint (com regras anti-`eval`), Prettier e CI no GitHub (`.github/workflows/ci.yml`). Falta: no GitHub, em *Settings › Branches*, exigir o CI verde antes de aceitar mudanças (opcional)
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

1. Rodar `supabase/004_cron_atomico.sql`, fazer o deploy e testar o cron com o `curl` do README
2. Backup (item 2)
3. ~~Cron atômico~~ (feito, falta testar no ar)
4. Rascunho automático no editor