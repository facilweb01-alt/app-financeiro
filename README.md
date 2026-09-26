# App Financeiro

App financeiro pessoal (web, funciona no celular e no computador — pode ser "instalado" como PWA) com lançamentos manuais, cartões com parcelas e fechamento de fatura manual, investimentos, contas fixas, fechamento mensal com projeção de parcelas futuras, e gráficos de gasto por categoria em % da renda.

## Stack

- **Next.js 16** (App Router, Server Actions) + **React 19** + **TypeScript** + **Tailwind CSS 4**
- **Postgres** via **Drizzle ORM** — mesmo schema roda local (dev) e no **Supabase** (produção)
- Autenticação própria (e-mail + senha, sessão em banco) — ver `src/lib/session.ts` e `src/lib/dal.ts`
- **Recharts** para os gráficos
- Suporte a múltiplos usuários — isolamento reforçado com **Row-Level Security** de verdade no Postgres (cada um só vê os próprios dados mesmo que haja um bug na aplicação, ver seção de segurança abaixo)

## Rodando localmente

Pré-requisitos: Node.js 20+, um Postgres local (ou Docker) rodando.

```bash
npm install
cp .env.example .env.local   # edite DATABASE_URL e AUTH_SECRET
npm run db:migrate            # cria as tabelas
npm run db:seed               # cria as categorias padrão (idempotente)
npm run dev                   # http://localhost:3000
```

### Scripts disponíveis

| Script | O que faz |
| --- | --- |
| `npm run dev` | Sobe o app em modo desenvolvimento |
| `npm run build` / `npm run start` | Build e execução em produção |
| `npm run lint` | ESLint |
| `npm run db:generate` | Gera uma nova migração a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica as migrações pendentes no banco apontado por `DATABASE_URL` |
| `npm run db:seed` | Cria/atualiza as categorias padrão (idempotente — pode rodar quantas vezes quiser) |
| `npm run test:business` | Testes automatizados da lógica de negócio pura (parcelas, fechamento mensal) |

### Testes de ponta a ponta (`e2e/`)

Contra um `next dev` já rodando (ajuste a porta se necessário):

```bash
node e2e/auth.smoke.mjs              # cadastro, login, logout, proteção de rotas, gate de aprovação e suspensão
node e2e/full-flow.smoke.mjs         # fluxo completo: lançamento, cartão, fatura, investimento, conta fixa, fechamento
node e2e/new-features.smoke.mjs      # metas de investimento, limites por categoria, PDF do fechamento mensal
node e2e/dashboard-cards-upgrade.smoke.mjs   # gasto do próximo mês, gráfico de parcelas (3 meses + filtro de 10), editar compra no cartão, PDF por cartão
node e2e/dashboard-mes-filtro-listas.smoke.mjs   # seletor de mês (até 3 à frente), total somado, listas colapsáveis "Ver mais"
node e2e/dashboard-painel-didatico.smoke.mjs     # resumo didático (frase + barra + composição + investido separado), busca de categoria com detalhe, filtro por categoria nas parcelas futuras
WHATSAPP_WEBHOOK_SECRET=... node e2e/whatsapp-webhook.smoke.mjs   # endpoint do WhatsApp (use o mesmo valor do .env.local)
node e2e/admin-panel.smoke.mjs       # painel /admin: aprovar, suspender, reativar, vencimento, controle de acesso
# Página de vendas + cobrança Pix, contra um Asaas FALSO (e2e/helpers/fakeAsaas.mjs). Suba o app assim antes:
#   ASAAS_API_KEY='$aact_hmlg_teste' ASAAS_BASE_URL=http://localhost:3998/v3 ASAAS_WEBHOOK_TOKEN=token-teste-webhook npx next start -p 3100
node e2e/billing-pix.smoke.mjs       # landing, cadastro com CPF/WhatsApp, QR Pix, webhook, aviso de vencimento, bloqueio após 3 dias, desbloqueio
```

Precisam do Chromium do Playwright instalado (`npx playwright install chromium`, se ainda não tiver). Os testes que criam usuários usam `e2e/helpers/testDb.mjs` (conecta direto no banco com `DATABASE_URL`) para simular ações que só um admin faria em `/admin` — sem isso, todo teste de outra funcionalidade teria que primeiro passar pela UI do painel administrativo.

## Arquitetura — decisões e por quê

- **Postgres desde o início (não SQLite)**: o destino final é Supabase (Postgres), então rodar Postgres local em dev evita surpresa de compatibilidade na hora de ir para produção. `DATABASE_URL` é a única coisa que muda entre ambientes.
- **Drizzle ORM em vez de Prisma**: o Prisma precisa baixar um binário de um CDN próprio (`binaries.prisma.sh`) toda instalação, o que se mostrou frágil; Drizzle usa só pacotes npm normais (`postgres`), sem esse ponto de falha externo.
- **Sessão própria em vez de uma lib de auth pronta**: seguindo o guia oficial de autenticação do Next.js (sessão em banco + cookie HttpOnly assinado com JWT curto via `jose`), evitando depender de uma lib de terceiros ainda em beta para uma versão do Next.js tão nova.
- **`proxy.ts` (não `middleware.ts`)**: no Next.js 16 o arquivo de middleware foi renomeado para `proxy.ts` — e, como este projeto usa a pasta `src/`, ele precisa ficar em `src/proxy.ts` (não na raiz) para o Next reconhecer. Isso só foi descoberto testando de verdade (ver `e2e/auth.smoke.mjs`) — o build compilava normalmente mesmo com o arquivo no lugar errado, só a proteção de rota é que silenciosamente não funcionava.
- **Categorias em tabela, não fixas no código**: já vêm as 9 categorias pedidas (produto, serviço, lazer, saúde, alimentação, compras pessoais, viagem, gasolina, outros), mas o usuário pode criar categorias próprias depois.
- **Parcelas geradas na hora da compra**: ao lançar uma compra parcelada no cartão, todas as parcelas já são gravadas (cada uma com seu vencimento mês a mês). É isso que permite ao fechamento do mês somar automaticamente o que ainda falta pagar nos próximos meses sem precisar recalcular nada depois.
- **Valores monetários em `numeric(12,2)`**: nunca `float`, para não acumular erro de arredondamento. A divisão de uma compra em N parcelas (`src/lib/business/money.ts`) trabalha em centavos e distribui o resto entre as primeiras parcelas — testado com casos "feios" tipo R$100 em 3x.
- **Cloudflare Workers avaliado e descartado**: chegamos a montar o deploy via `@opennextjs/cloudflare`, mas testes reais (não só build) mostraram conexões diretas ao Postgres travando de forma intermitente dentro do Worker (erro "hung request" + erro de hidratação no React) — limitação conhecida da Cloudflare para TCP direto ao Postgres sem o Hyperdrive (proxy pago de pool de conexões, que também exigiria reescrever o cliente do banco para pegar a conexão por requisição). Como o projeto já teria custo de qualquer forma nesse caminho, optamos por um host Node tradicional (ver seção de deploy), que roda a aplicação exatamente como em dev.
- **Gate de aprovação com "grandfathering"**: a migração que adicionou `status = 'pending'` como padrão para conta nova (ver "Painel administrativo") deu `status = 'active'` para todo mundo que já tinha conta antes dela existir, e só depois trocou o `DEFAULT` da coluna — senão qualquer usuário (inclusive os de teste já em produção) ficaria bloqueado do dia para a noite quando essa migração rodasse.

## Segurança — isolamento de dados entre clientes (Row-Level Security)

Como o app vai ser usado por vários clientes pagantes (não só um usuário só), fizemos o isolamento entre contas valer **dentro do próprio Postgres**, não só na lógica da aplicação — assim, mesmo um bug num Server Action não consegue vazar dado de um cliente para outro, porque o banco recusa a linha antes mesmo da query chegar nela.

- **Row-Level Security (RLS) ativado e forçado** (`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`) em todas as tabelas por usuário (`drizzle/migrations/0003_add_row_level_security.sql`). Cada política só libera a linha quando ela pertence ao usuário autenticado.
- **Descoberta importante, testada antes de considerar isso pronto**: no Postgres, o *dono* da tabela e usuários `SUPERUSER` **sempre ignoram RLS**, mesmo com `FORCE`. Se a aplicação rodasse com a mesma conexão usada para criar as tabelas (comum em tutoriais), as políticas existiriam no papel mas não valeriam nada. Por isso a aplicação roda com uma role própria e restrita, `app_runtime` (`NOSUPERUSER`, não é dona de nenhuma tabela — script pronto em `drizzle/rls-runtime-role.sql`), separada da role usada só para rodar migrações.
- **Duas connection strings diferentes**: `DATABASE_URL` (role dona, só para `npm run db:migrate`) e `APP_DATABASE_URL` (role `app_runtime`, é a que a aplicação usa em runtime — ver `.env.example`).
- **Contexto por requisição sem precisar passar conexão manualmente**: `src/db/client.ts` usa `AsyncLocalStorage` para que, dentro de `withRLS(userId, fn)`, todo uso de `db` em qualquer arquivo (`src/lib/queries/*`, `src/app/actions/*`) automaticamente rode dentro de uma transação com `app.current_user_id` já definido — sem precisar mudar a assinatura de nenhuma função existente.
- **Padrão fail-closed**: fora de `withRLS`/`withServiceMode`, uma query em `db` não retorna nada (SELECT) ou falha (INSERT/UPDATE) — nunca vaza dado por padrão. Existe um modo de serviço (`withServiceMode`) só para os poucos pontos que precisam localizar o usuário antes de saber quem ele é (login por e-mail, cadastro, verificação de sessão pelo cookie, busca por telefone no webhook do WhatsApp) — cada um desses já é protegido por outra credencial real (senha com hash, id de sessão imprevisível, segredo do webhook).
- **Verificado com SQL cru, não só pelos testes da aplicação**: conectando direto como `app_runtime` via `psql`, confirmamos que (a) sem contexto de usuário definido, todas as tabelas retornam zero linhas, e (b) com o contexto do usuário A definido, uma tentativa de ler até um único campo (e-mail) do usuário B é bloqueada pelo banco.
- **Para reproduzir em produção (Supabase)**: depois de rodar as migrações normalmente com `DATABASE_URL`, colar o conteúdo de `drizzle/rls-runtime-role.sql` no SQL Editor do projeto Supabase, trocando a senha de exemplo por uma gerada com `openssl rand -base64 24`, e usar essa connection string (com a role `app_runtime`) como `APP_DATABASE_URL` nas variáveis de ambiente de produção — nunca como `DATABASE_URL`.


## Estrutura

```
src/db/schema.ts              Schema do banco (Drizzle) — fonte da verdade
src/lib/business/             Lógica de negócio pura, testada isoladamente (sem banco)
src/lib/session.ts, dal.ts    Autenticação e checagem de sessão
src/lib/queries/              Leituras do banco por módulo
src/app/actions/              Server Actions (escrita) por módulo
src/app/(app)/...             Páginas autenticadas (dashboard, lançamentos, cartões, investimentos, contas fixas, fechamento, admin)
src/app/conta-pendente/       Tela de espera para conta 'pending'/'suspended' (ver seção "Painel administrativo")
src/app/api/whatsapp/         Endpoint para a integração com WhatsApp (ver abaixo)
src/proxy.ts                  Proteção de rota (checagem otimista)
drizzle/migrations/           Migrações SQL, todas aditivas
drizzle/promote-admin.sql     SQL manual para dar acesso de admin a uma conta
e2e/                          Testes de ponta a ponta (Playwright)
```

## Integração com WhatsApp — o que já existe e o que falta

O pedido original foi "comando pelo WhatsApp para atualizar o app sem precisar abrir". O que já está pronto:

- Cada usuário pode vincular o próprio número de WhatsApp na aba **Fechamento** (dentro do app, já logado — sem verificação por SMS).
- `POST /api/whatsapp/lancamento`: endpoint autenticado (segredo compartilhado `WHATSAPP_WEBHOOK_SECRET`) que recebe um lançamento já estruturado (`{ phone, description, amount, categoryKey? }`) e grava na conta vinculada àquele número. Testado de ponta a ponta em `e2e/whatsapp-webhook.smoke.mjs`.

O que falta, e que exige uma conta/número de verdade (por isso não foi feito nesta sessão — é uma decisão que só você pode tomar, e são credenciais que não devo digitar por você):

1. **Um número de WhatsApp Business** (ou reaproveitar um que você já tenha).
2. **Uma automação que receba as mensagens e entenda o comando** — o caminho mais rápido, já que você tem o n8n rodando para o Webfacilita, é criar um fluxo novo (nó dedicado, sem mexer no que já existe — como manda o método) que: recebe a mensagem do WhatsApp → usa IA para extrair `description`, `amount`, `categoryKey` → chama `POST /api/whatsapp/lancamento` com o segredo.
3. Isso é testável localmente antes de qualquer coisa em produção (dispara a chamada com `curl`/Postman simulando o n8n, sem precisar de WhatsApp de verdade rodando).

## Página de vendas e cobrança mensal via Pix (Asaas)

- `/` (visitante) é a página de vendas: destaque para o lançamento pelo WhatsApp, todos os recursos, preço (R$ 29,90/mês) e o botão **Quero esse app**, que leva ao cadastro (`/registrar`: nome, e-mail, WhatsApp, CPF, senha).
- Com `ASAAS_API_KEY` configurada, o cadastro cria o cliente e uma assinatura mensal **Pix** no Asaas, com o 1º vencimento no dia do cadastro — e a pessoa cai em `/assinatura`, com QR Code e Pix copia-e-cola. Pagou → o webhook `POST /api/asaas/webhook` (ou a checagem automática da tela) libera o acesso sozinho.
- Todo mês, no mesmo dia do cadastro, o Asaas gera o novo Pix. Dentro do app aparece um aviso 5 dias antes ("vence em N dias — Pagar com Pix"), aviso vermelho quando vence, e **o acesso é pausado 3 dias depois do vencimento** (redireciona para `/assinatura`). Pagou, volta na hora.
- Contas antigas (antes da cobrança) ficam isentas (`billing_enabled = false`) e continuam no controle manual do painel admin.
- O painel admin (app separado) mostra "Aguardando 1º Pix", "Pix automático — em dia / vence em / vencido / bloqueado", último Pix pago e o total recebido no mês.
- Regras em `src/lib/billing/core.ts` (puro, com testes em `run-tests.ts`); chamadas à API em `asaas.ts`; sincronização em `service.ts`; tabelas na migração `0008_add_billing.sql` (com RLS).

### Para ligar em produção (passo a passo)

1. Criar a conta no Asaas (começar pelo **sandbox**) e cadastrar uma chave Pix.
2. Gerar a chave de API e colar no Render como `ASAAS_API_KEY`.
3. Em Integrações > Webhooks: URL `https://<seu-app>/api/asaas/webhook`, eventos de **Cobranças**, e um token de autenticação — o mesmo valor vai no Render como `ASAAS_WEBHOOK_TOKEN`.
4. Fazer um cadastro de teste pela página de vendas e pagar o Pix no sandbox; conferir a liberação e o painel admin.

## Termos de Uso / Política de Privacidade (LGPD)

Texto e versão vigente ficam em `src/lib/terms.ts` (fonte única, reaproveitada no cadastro, na página pública `/termos` e no aceite retroativo).

- **Cadastro novo**: `/registrar` exige o checkbox marcado (validado no servidor via `SignupFormSchema`, não só no HTML) — sem isso a conta não é criada. O aceite é gravado junto com a conta: `users.termsAcceptedAt` (data/hora) + `users.termsVersion` (qual texto foi aceito) — não é só um booleano, porque o ônus da prova do consentimento é de quem trata o dado (LGPD art. 8º, §2º).
- **Contas antigas / mudança de versão**: `verifySession()` e `verifyAdminSession()` (`src/lib/dal.ts`) barram qualquer conta cujo `termsAcceptedAt` seja nulo ou cujo `termsVersion` não bata com `CURRENT_TERMS_VERSION`, mandando para `/aceitar-termos` — mesmo padrão do gate de aprovação (`/conta-pendente`). É assim que uma conta criada antes desta funcionalidade existir (ou depois de o texto mudar) é pega no próximo acesso, sem precisar de migração de dados retroativa.
- **Painel `/admin`**: cada cliente mostra se aceitou a versão vigente, uma versão antiga, ou nenhuma — com a data do aceite (ver `TermsInfo` em `src/app/(app)/admin/page.tsx`).
- **Mudar o texto**: edite `TERMS_SECTIONS`/`TERMS_CHECKBOX_LABEL` em `src/lib/terms.ts` e troque `CURRENT_TERMS_VERSION` (ex: para a data do dia) — todo mundo que já tinha aceitado uma versão anterior é automaticamente mandado para aceitar de novo.
- **Isto não é aconselhamento jurídico formal**: o texto foi elaborado com base em pesquisa sobre a LGPD (Lei 13.709/2018) e fontes públicas — vale revisão de um advogado antes de tratar como definitivo, principalmente por ser um serviço pago (Código de Defesa do Consumidor também se aplica).

## Painel administrativo (`/admin`)

Como o app agora é vendido por mensalidade (piloto), existe um painel só para quem tem `role = 'admin'`:

- **Aprovação manual de acesso**: toda conta nova nasce com `status = 'pending'` e consegue logar, mas cai numa tela de espera (`/conta-pendente`) em vez do app — em qualquer canal, inclusive WhatsApp — até um admin clicar em "Aprovar acesso" em `/admin`. Contas que já existiam antes desse recurso foram mantidas como `active` (não ficaram bloqueadas do dia para a noite).
- **Suspender/reativar**: um admin pode suspender uma conta a qualquer momento (volta a cair em `/conta-pendente`) e reativar depois.
- **Visão de uso**: por cliente, último acesso (dia e horário), um indicador de "saúde de uso" (ativo nos últimos 7 dias / baixo uso em até 30 / inativo / nunca acessou) e o último mês que o cliente efetivamente fechou — combinar os dois é mais informativo que só "logou ou não": alguém pode logar toda semana e nunca fechar o mês, por exemplo, o que também é sinal de baixo engajamento com a parte que mais gera valor do app.
- **Controle de mensalidade**: campo de vencimento por cliente, com aviso visual de "vence em breve" e "vencido" — pensado para, na Fase 2, virar gatilho automático de cobrança/lembrete.
- **Como uma conta vira admin**: não existe tela para isso de propósito (para ninguém virar admin sozinho). Rode `drizzle/promote-admin.sql` (trocando o e-mail) direto no banco — localmente ou no SQL Editor do Supabase em produção, sempre com a connection string "dona" (`DATABASE_URL`), nunca a `app_runtime`.
- **Segurança**: `/admin` exige sessão válida + `role = 'admin'` lido fresco do banco a cada chamada (nunca do cookie) — ver `verifyAdminSession()` em `src/lib/dal.ts`. As leituras/escritas que cruzam dados de outros clientes usam `withServiceMode` (a mesma peça já usada em login/cadastro), sempre depois dessa checagem — ver comentário em `drizzle/migrations/0004_add_admin_subscription_fields.sql` sobre por que não foi criada uma policy de RLS adicional baseada em função para isso.

## Deploy em produção (Supabase + host Node) — próxima fase

Ainda não publicado — nada foi colocado em produção nesta sessão. O caminho definido é **Supabase (banco) + um host Node tradicional** para a aplicação (Cloudflare Workers foi avaliado e descartado — ver seção de arquitetura acima); qual host exatamente (ex: Render) ainda depende de uma confirmação sua. Quando quiser seguir:

1. Criar um projeto **novo** no [Supabase](https://supabase.com) (não reaproveitar o do Webfacilita), pegar a connection string "dona" em *Settings → Database → Connection string* e usar como `DATABASE_URL` só para rodar `npm run db:migrate` e `npm run db:seed`.
2. Rodar o script `drizzle/rls-runtime-role.sql` no SQL Editor do Supabase para criar a role restrita `app_runtime` (senha gerada com `openssl rand -base64 24`) e usar essa connection string como `APP_DATABASE_URL` — é o que faz o Row-Level Security (ver seção de segurança acima) realmente valer em produção. **Sem esse passo, a aplicação funciona, mas o isolamento entre clientes fica só na lógica, não no banco.**
3. Gerar um `AUTH_SECRET` novo de produção (`openssl rand -base64 32`) — nunca reaproveitar o de desenvolvimento.
4. Publicar a aplicação no host Node escolhido, com `DATABASE_URL` (só para migração, não precisa estar nas env vars de runtime), `APP_DATABASE_URL` e `AUTH_SECRET` configurados lá.
5. Rodar `drizzle/promote-admin.sql` (com `DATABASE_URL`, trocando o e-mail pelo seu) para virar admin e conseguir acessar `/admin` em produção — senão nem você mesmo consegue aprovar o primeiro cliente.
6. **Antes de publicar de verdade**: eu vou pedir sua confirmação explícita, como de costume — essa regra não muda mesmo com a skill de método carregada. Você configura as credenciais de produção (connection strings, segredos) diretamente no painel do Supabase/host — eu não devo digitá-las por você.
