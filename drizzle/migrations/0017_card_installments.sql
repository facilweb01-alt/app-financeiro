-- 12/10/2026 — plano anual no cartão em até 12x (decisão do Marcelo). ADITIVA.
--
-- O Asaas não parcela assinatura recorrente. O anual no cartão passa a ser
-- uma COMPRA avulsa feita no Checkout do Asaas (à vista ou em até 12x, o
-- cliente escolhe lá), sem renovação automática: perto do fim do ano o app
-- pede a renovação (cartão de novo ou Pix).
--
-- - billing_payments.asaas_installment_id / installment_number: o Asaas cria
--   uma cobrança por parcela, todas com o mesmo id de parcelamento. O app
--   trata o grupo como UM pagamento do ano (core.ts#collapseCardPurchases).
-- - billing_payments.period_start: dia em que começa o ano pago por essa
--   compra (no teste grátis, o último dia do teste — ninguém perde dia de
--   teste). Só nas compras no cartão; nula nas cobranças de assinatura.
-- - users.card_period_start: início do ano gravado na hora de abrir o
--   Checkout, copiado para period_start quando a compra chega.
-- - users.billing_method ganha 'CARD_INSTALLMENT' (ano pago no cartão,
--   sem assinatura ativa no Asaas).

alter table "billing_payments" add column "asaas_installment_id" text;
--> statement-breakpoint
alter table "billing_payments" add column "installment_number" integer;
--> statement-breakpoint
alter table "billing_payments" add column "period_start" date;
--> statement-breakpoint
create index if not exists "billing_payments_installment_idx" on "billing_payments" ("asaas_installment_id");
--> statement-breakpoint
alter table "users" add column "card_period_start" date;
--> statement-breakpoint
alter table "users" drop constraint if exists "users_billing_method_check";
--> statement-breakpoint
alter table "users" add constraint "users_billing_method_check" check ("billing_method" in ('PIX', 'CREDIT_CARD', 'CARD_INSTALLMENT'));
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'billing_payments' AND column_name = 'period_start') THEN
    RAISE EXCEPTION 'migração 0017 incompleta: coluna billing_payments.period_start não existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'card_period_start') THEN
    RAISE EXCEPTION 'migração 0017 incompleta: coluna users.card_period_start não existe';
  END IF;
  IF EXISTS (SELECT 1 FROM "users" WHERE "billing_method" NOT IN ('PIX', 'CREDIT_CARD', 'CARD_INSTALLMENT')) THEN
    RAISE EXCEPTION 'migração 0017: há usuários com billing_method inválido';
  END IF;
END $$;

-- Conferência (deve dar 0): select count(*) from billing_payments where period_start is not null;
