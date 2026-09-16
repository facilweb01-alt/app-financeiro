-- Isola o painel administrativo num banco de dados de verdade, não só na
-- aplicação: cria uma tabela de sessão exclusiva do painel admin
-- (admin_sessions) e um segundo mecanismo de bypass de RLS
-- (app.admin_mode), amarrado a uma role de banco específica
-- (app_admin_runtime — ver drizzle/admin-runtime-role.sql), separado do
-- app.service_mode que o app dos clientes (app_runtime) já usa.
--
-- Por que isso importa: hoje (antes desta migração) o escape
-- app.service_mode é só uma variável de sessão do Postgres — qualquer
-- conexão autenticada como app_runtime (a credencial que o app dos clientes
-- usa no dia a dia) PODE setar app.service_mode='true' e, com isso, ler ou
-- alterar a conta de QUALQUER usuário, não só a própria. Isso nunca foi
-- explorável de fora (só quem tem a APP_DATABASE_URL consegue fazer isso, e
-- essa credencial só existe nas variáveis de ambiente do servidor), mas
-- significa que o app dos clientes, mesmo sem nenhuma tela de admin,
-- sempre teve capacidade técnica de acessar dado de qualquer cliente — a
-- única barreira era o código da aplicação (verifyAdminSession()) decidir
-- não usar esse poder. Um bug de lógica (não precisa nem ser um RCE) que
-- pulasse essa checagem seria suficiente para vazar dado de outro cliente.
--
-- app.admin_mode resolve isso de um jeito que o Postgres reforça sozinho:
-- as políticas abaixo só aceitam esse escape quando, além da variável de
-- sessão estar 'true', current_user for literalmente a role
-- app_admin_runtime — e current_user reflete com QUAL credencial a conexão
-- foi autenticada, não é algo que o código da aplicação consiga fingir. A
-- role app_runtime (usada pelo app dos clientes) pode setar
-- app.admin_mode='true' à vontade, não faz diferença nenhuma: a política
-- também exige current_user = 'app_admin_runtime', que só quem conectar
-- com a senha certa (só configurada no serviço do painel admin) consegue
-- satisfazer. Esse é o ganho real de segurança do painel separado.
--
-- app.service_mode continua existindo e continua sendo usado só pelo app
-- dos clientes, só nos pontos que já precisavam dele antes de existir
-- qualquer conceito de admin: login por e-mail, checagem de e-mail
-- duplicado no cadastro, verificação de sessão pelo cookie, busca por
-- telefone no webhook do WhatsApp (ver src/lib/session.ts,
-- src/app/actions/auth.ts). Nenhum desses pontos precisa (nem deveria)
-- também ganhar acesso de admin_mode.

create table "admin_sessions" (
  "id" text primary key not null,
  "user_id" text not null,
  "expires_at" timestamp with time zone not null,
  "created_at" timestamp with time zone default now() not null
);
--> statement-breakpoint
alter table "admin_sessions" add constraint "admin_sessions_user_id_users_id_fk"
  foreign key ("user_id") references "public"."users"("id") on delete cascade on update no action;
--> statement-breakpoint
create index "admin_sessions_user_idx" on "admin_sessions" using btree ("user_id");
--> statement-breakpoint

-- admin_sessions: SEM cláusula de "dono" — só quem conecta como
-- app_admin_runtime com app.admin_mode='true' enxerga ou grava aqui. O
-- painel admin sempre roda em modo serviço (não há RLS "por usuário" pro
-- painel em si), então não precisa de nenhum outro caso de acesso.
alter table "admin_sessions" enable row level security;
alter table "admin_sessions" force row level security;
create policy "admin_sessions_admin_only" on "admin_sessions"
  using (current_setting('app.admin_mode', true) = 'true' and current_user = 'app_admin_runtime')
  with check (current_setting('app.admin_mode', true) = 'true' and current_user = 'app_admin_runtime');
--> statement-breakpoint

-- users: adiciona o escape de admin_mode (amarrado à role) ao lado do
-- escape de service_mode que já existia (continua servindo o app dos
-- clientes) e do acesso "é o próprio usuário".
drop policy "users_self_or_service" on "users";
--> statement-breakpoint
create policy "users_self_service_or_admin" on "users"
  using (
    current_setting('app.current_user_id', true) = id
    or current_setting('app.service_mode', true) = 'true'
    or (current_setting('app.admin_mode', true) = 'true' and current_user = 'app_admin_runtime')
  )
  with check (
    current_setting('app.current_user_id', true) = id
    or current_setting('app.service_mode', true) = 'true'
    or (current_setting('app.admin_mode', true) = 'true' and current_user = 'app_admin_runtime')
  );
--> statement-breakpoint

-- month_closings: o painel admin lê (só leitura, nunca grava) o último mês
-- fechado de cada cliente para a coluna "saúde de uso" — precisa do mesmo
-- escape amarrado à role.
drop policy "month_closings_own" on "month_closings";
--> statement-breakpoint
create policy "month_closings_own_or_admin" on "month_closings"
  using (
    current_setting('app.current_user_id', true) = user_id
    or current_setting('app.service_mode', true) = 'true'
    or (current_setting('app.admin_mode', true) = 'true' and current_user = 'app_admin_runtime')
  )
  with check (
    current_setting('app.current_user_id', true) = user_id
    or current_setting('app.service_mode', true) = 'true'
    or (current_setting('app.admin_mode', true) = 'true' and current_user = 'app_admin_runtime')
  );
--> statement-breakpoint

-- Validação: confirma que as duas políticas reescritas continuam existindo
-- com o nome novo (evita ficar sem nenhuma política — "fechado por padrão"
-- só vale se a policy existir; uma tabela com FORCE RLS e zero políticas
-- bloqueia geral, incluindo o próprio app funcionando).
do $$
declare
  missing int;
begin
  select count(*) into missing
  from (values ('users', 'users_self_service_or_admin'), ('month_closings', 'month_closings_own_or_admin'), ('admin_sessions', 'admin_sessions_admin_only')) as expected(tbl, pol)
  where not exists (
    select 1 from pg_policies where tablename = expected.tbl and policyname = expected.pol
  );
  if missing > 0 then
    raise exception 'Migração 0006: % política(s) esperada(s) não foram criadas', missing;
  end if;
end
$$;
