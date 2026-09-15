-- Promove uma conta já cadastrada a admin (acesso a /admin) e garante que
-- ela está ativa. Rode manualmente sempre que precisar dar acesso de admin
-- a alguém — não existe (de propósito) nenhuma tela no app para isso, só
-- SQL direto, para não abrir uma forma de qualquer cadastro virar admin
-- sozinho.
--
-- Como usar:
--   - Localmente: psql "$DATABASE_URL" -f drizzle/promote-admin.sql (depois
--     de trocar o e-mail abaixo), ou cole o UPDATE no seu cliente de banco.
--   - Supabase (produção): SQL Editor do projeto, cole o UPDATE abaixo com o
--     e-mail certo. Sempre use a connection string "dona" (DATABASE_URL),
--     nunca a app_runtime — ela nem tem permissão de bypass de RLS pra
--     mexer na conta de outro usuário fora do fluxo normal do app.

update "users"
set "role" = 'admin', "status" = 'active', "approved_at" = now()
where "email" = 'TROQUE-PELO-EMAIL@exemplo.com';
