-- 28/10/2026 — troca de conta do Asaas. A conta antiga foi travada pelo
-- Asaas e o Marcelo abriu uma conta nova; a chave de API (ASAAS_API_KEY) e o
-- token do webhook (ASAAS_WEBHOOK_TOKEN) passam a ser os da conta nova.
--
-- Os IDs de cliente e de assinatura gravados até aqui são da conta antiga e
-- não existem na nova. Esta migração:
--   1) guarda os IDs antigos em colunas novas (consulta futura, nada se perde);
--   2) zera os IDs nas colunas em uso — o app recria cliente e assinatura na
--      conta nova sozinho, quando a pessoa abrir /assinatura (ensureSubscription);
--   3) marca como DELETED as cobranças em aberto da conta antiga (o Pix delas
--      não deve mais aparecer na tela);
--   4) quem pagava no cartão recorrente da conta antiga volta para PIX no app:
--      o cartão ficou guardado na conta antiga e precisa ser cadastrado de novo.
-- Quem já pagou continua com o acesso até a data paga (subscription_due_date
-- não muda).

alter table "users" add column if not exists "asaas_legacy_customer_id" text;
--> statement-breakpoint
alter table "users" add column if not exists "asaas_legacy_subscription_id" text;
--> statement-breakpoint
update "users"
   set "asaas_legacy_customer_id" = coalesce("asaas_legacy_customer_id", "asaas_customer_id"),
       "asaas_legacy_subscription_id" = coalesce("asaas_legacy_subscription_id", "asaas_subscription_id")
 where "asaas_customer_id" is not null or "asaas_subscription_id" is not null;
--> statement-breakpoint
update "billing_payments"
   set "status" = 'DELETED', "updated_at" = now()
 where "status" in ('PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS');
--> statement-breakpoint
update "users" set "billing_method" = 'PIX' where "billing_method" = 'CREDIT_CARD';
--> statement-breakpoint
update "users" set "asaas_customer_id" = null, "asaas_subscription_id" = null
 where "asaas_customer_id" is not null or "asaas_subscription_id" is not null;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "asaas_customer_id" IS NOT NULL OR "asaas_subscription_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'migração 0019 incompleta: ainda há IDs da conta antiga do Asaas';
  END IF;
  IF EXISTS (SELECT 1 FROM "billing_payments" WHERE "status" IN ('PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS')) THEN
    RAISE EXCEPTION 'migração 0019 incompleta: ainda há cobranças em aberto da conta antiga';
  END IF;
END $$;
