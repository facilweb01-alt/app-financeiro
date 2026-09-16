-- Aceite dos Termos de Uso / Política de Privacidade (LGPD) — ver
-- src/lib/terms.ts (texto e versão atual) e README "Termos de Uso (LGPD)".
--
-- Sem backfill de propósito: contas que já existiam antes desta migração
-- (inclusive quem já se cadastrou em produção) ficam com terms_accepted_at
-- NULL, e são mandadas para /aceitar-termos no próximo acesso (ver
-- src/lib/dal.ts#verifySession) — diferente da migração 0004, aqui não faz
-- sentido "dar como aceito" um consentimento que a pessoa nunca deu de
-- verdade.

alter table "users" add column "terms_accepted_at" timestamp with time zone;
alter table "users" add column "terms_version" text;
