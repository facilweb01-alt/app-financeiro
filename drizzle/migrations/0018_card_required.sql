-- 20/10/2026 — teste grátis só com cartão de crédito (decisão do Marcelo). ADITIVA.
--
-- A partir desta versão, quem se cadastra pelo site precisa cadastrar um
-- cartão de crédito (Checkout do Asaas) para liberar os 7 dias grátis; a 1ª
-- mensalidade é cobrada sozinha no fim do teste. Não há mais Pix para essas
-- contas. As contas criadas antes continuam como estavam (podem pagar no Pix).
--
-- - users.card_required: true = conta do fluxo "cartão obrigatório". Nasce
--   false para todas as contas existentes (regra antiga, Pix aceito).

alter table "users" add column if not exists "card_required" boolean not null default false;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'card_required') THEN
    RAISE EXCEPTION 'migração 0018 incompleta: coluna users.card_required não existe';
  END IF;
  IF EXISTS (SELECT 1 FROM "users" WHERE "card_required") THEN
    RAISE NOTICE 'migração 0018: já existem contas com card_required = true (rodou depois do deploy?)';
  END IF;
END $$;
