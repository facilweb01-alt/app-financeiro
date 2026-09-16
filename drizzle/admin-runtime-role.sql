-- Cria (ou atualiza) a role de runtime restrita que o PAINEL ADMINISTRATIVO
-- (app-financeiro-admin — app separado, outro deploy) usa para conversar
-- com o mesmo banco de dados do app-financeiro. É intencionalmente uma
-- role DIFERENTE de app_runtime (ver drizzle/rls-runtime-role.sql): as
-- políticas de RLS da migração 0006 só liberam o escape de
-- app.admin_mode para quem conecta como app_admin_runtime — nem
-- app_runtime (app dos clientes) nem nenhuma outra credencial conseguem
-- imitar isso, porque current_user reflete com qual senha a conexão
-- autenticou, não algo que o código da aplicação decide.
--
-- Ela NÃO é dona das tabelas e NÃO é superusuário — mesmo racional de
-- app_runtime (ver o outro arquivo): sem isso, as políticas de RLS não
-- valeriam pra ela.
--
-- Idempotente: pode rodar de novo sem erro.
--
-- Como usar:
--   - Localmente: rode este arquivo contra o Postgres de desenvolvimento
--     (psql "$DATABASE_URL" -f drizzle/admin-runtime-role.sql) antes de
--     rodar o app-financeiro-admin localmente.
--   - No Supabase (produção): abra o SQL Editor do projeto
--     app-financeiro-producao e cole este arquivo inteiro, trocando
--     SENHA_AQUI por uma senha forte gerada por você
--     (ex: openssl rand -base64 24) — DIFERENTE da senha de app_runtime.
--     Guarde essa senha — ela vira a ADMIN_DATABASE_URL do serviço
--     app-financeiro-admin no Render (nunca a mesma variável/valor do
--     app-financeiro comum).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_admin_runtime') then
    create role app_admin_runtime with login password 'SENHA_AQUI' nosuperuser nocreatedb nocreaterole noreplication;
  end if;
end
$$;

grant usage on schema public to app_admin_runtime;
grant select, insert, update, delete on all tables in schema public to app_admin_runtime;
grant usage, select on all sequences in schema public to app_admin_runtime;

alter default privileges in schema public grant select, insert, update, delete on tables to app_admin_runtime;
alter default privileges in schema public grant usage, select on sequences to app_admin_runtime;
