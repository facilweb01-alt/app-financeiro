-- 11/10/2026. Migração ADITIVA (uma coluna nova, nula para quem já existe).
--
-- users.signup_source: de qual anúncio/link veio o cadastro, no formato
-- "utm_source=meta&utm_medium=cpc&utm_campaign=<campanha>&utm_content=<anúncio>"
-- (ver src/lib/business/signupSource.ts). Só o nome da origem, da campanha e
-- do anúncio; nenhum identificador de clique (fbclid) é guardado. Nulo = a
-- pessoa chegou sem parâmetros de anúncio (acesso direto, indicação, busca).
--
-- Para que serve: saber qual anúncio traz cadastro e qual traz assinatura
-- paga, mesmo quando a pessoa recusa os cookies da Meta (caso em que o pixel
-- não conta nada).
--
-- Consulta de conferência / relatório (rodar no SQL Editor quando quiser):
--   select coalesce(signup_source, '(direto)') as origem,
--          count(*) as cadastros,
--          count(*) filter (where status = 'active') as pagaram
--   from users
--   where billing_enabled and created_at >= '2026-10-11'
--   group by 1 order by 2 desc;

alter table "users" add column "signup_source" text;
--> statement-breakpoint
alter table "users" add constraint "users_signup_source_len_check"
  check ("signup_source" is null or char_length("signup_source") <= 400);
