-- Boas-vindas pelo WhatsApp com o manual do usuário (pedido do Marcelo em
-- 02/10/2026). Três colunas só de controle do envio — migração ADITIVA:
--   welcome_requested_at: quando o envio foi pedido (conta liberada pelo 1º
--     pagamento, aprovação no painel, ou botão "Enviar boas-vindas");
--   welcome_sent_at: quando o WhatsApp foi enviado de verdade;
--   welcome_error: motivo da última falha (o painel mostra e permite reenviar).
-- Quem já era cliente fica com tudo nulo: não recebe nada sozinho.

alter table "users" add column "welcome_requested_at" timestamp with time zone;
--> statement-breakpoint
alter table "users" add column "welcome_sent_at" timestamp with time zone;
--> statement-breakpoint
alter table "users" add column "welcome_error" text;
--> statement-breakpoint
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('welcome_requested_at', 'welcome_sent_at', 'welcome_error')) <> 3 THEN
    RAISE EXCEPTION 'migração 0012 incompleta: colunas welcome_* não existem';
  END IF;
END $$;
