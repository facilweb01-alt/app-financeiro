-- Cria (ou atualiza) a role de runtime restrita que a aplicação usa para
-- conversar com o banco no dia a dia. Ela NÃO é dona das tabelas e NÃO é
-- superusuário — por isso as políticas de Row-Level Security (RLS) da
-- migração 0003 realmente valem pra ela (num Postgres, o dono da tabela e
-- o superusuário sempre ignoram RLS, então rodar a aplicação com a mesma
-- role que criou as tabelas tornaria as políticas inúteis).
--
-- Idempotente: pode rodar de novo sem erro.
--
-- Como usar:
--   - Localmente: já roda automaticamente (ver README / dev-setup).
--   - No Supabase: abra o SQL Editor do projeto e cole este arquivo inteiro,
--     trocando SENHA_AQUI por uma senha forte gerada por você
--     (ex: openssl rand -base64 24). Guarde essa senha — ela vira a
--     APP_DATABASE_URL de produção (ver .env.example).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime with login password 'SENHA_AQUI' nosuperuser nocreatedb nocreaterole noreplication;
  end if;
end
$$;

grant usage on schema public to app_runtime;
grant select, insert, update, delete on all tables in schema public to app_runtime;
grant usage, select on all sequences in schema public to app_runtime;

-- Garante que tabelas criadas por migrações futuras também sejam acessíveis
-- pela role de runtime automaticamente, sem precisar rodar este script de novo.
alter default privileges in schema public grant select, insert, update, delete on tables to app_runtime;
alter default privileges in schema public grant usage, select on sequences to app_runtime;
