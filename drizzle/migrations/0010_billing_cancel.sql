-- Cancelamento de assinatura pelo painel admin: quando preenchido, a
-- assinatura Pix no Asaas foi cancelada. O cliente continua usando o app até
-- o fim do período já pago (users.subscription_due_date) e depois o acesso é
-- encerrado (tela /assinatura avisa). Migração só ADITIVA.

alter table "users" add column "billing_canceled_at" timestamp with time zone;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'billing_canceled_at') THEN
    RAISE EXCEPTION 'migração 0010 incompleta: coluna billing_canceled_at não existe';
  END IF;
END $$;
