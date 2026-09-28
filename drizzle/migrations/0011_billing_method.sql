-- Cartão de crédito recorrente como segunda forma de pagamento (além do Pix).
-- - users.billing_method: forma da assinatura ATUAL no Asaas ('PIX' ou
--   'CREDIT_CARD'). Todo mundo começa em PIX (inclusive quem já existe); vira
--   CREDIT_CARD quando o cliente conclui o Checkout do Asaas com cartão e o
--   app troca users.asaas_subscription_id para a assinatura nova.
-- - billing_payments.billing_type: forma de cada cobrança (o Asaas manda
--   "billingType" em cada cobrança). Só serve para a tela de pagamento saber
--   se mostra QR Code do Pix ou o link da fatura do cartão. Pode ficar nula
--   nas cobranças antigas (tratadas como PIX).
-- - billing_payments.asaas_subscription_id: de qual assinatura do Asaas veio
--   a cobrança. Quando o cliente troca de Pix para cartão, o "dia do
--   vencimento" passa a ser o da assinatura nova (ver
--   core.ts#computeSubscriptionDueDate, opção anchorDate). Nula nas antigas.
-- Migração só ADITIVA.

alter table "users" add column "billing_method" text default 'PIX' not null;
--> statement-breakpoint
alter table "users" add constraint "users_billing_method_check" check ("billing_method" in ('PIX', 'CREDIT_CARD'));
--> statement-breakpoint
alter table "billing_payments" add column "billing_type" text;
--> statement-breakpoint
alter table "billing_payments" add column "asaas_subscription_id" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'billing_method') THEN
    RAISE EXCEPTION 'migração 0011 incompleta: coluna users.billing_method não existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'billing_payments' AND column_name = 'billing_type') THEN
    RAISE EXCEPTION 'migração 0011 incompleta: coluna billing_payments.billing_type não existe';
  END IF;
  IF EXISTS (SELECT 1 FROM "users" WHERE "billing_method" NOT IN ('PIX', 'CREDIT_CARD')) THEN
    RAISE EXCEPTION 'migração 0011: há usuários com billing_method inválido';
  END IF;
END $$;
