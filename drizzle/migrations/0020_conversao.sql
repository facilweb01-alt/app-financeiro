-- 04/11/2026 — estratégia de conversão (aprovada pelo Marcelo). ADITIVA.
--
-- - users.first_entry_at: quando a conta fez o 1º registro (gasto, compra no
--   cartão ou conta fixa, pelo app ou pelo WhatsApp). Usado no painel admin
--   ("fez 1º registro") e para avisar a Meta (evento PrimeiroRegistro, só de
--   quem aceitou os cookies). Preenchido aqui para as contas que já têm
--   registros, para nenhuma conta antiga disparar o evento.
-- - users.ads_consent_at / meta_fbp / meta_fbc / meta_ua: a pessoa aceitou os
--   cookies da Meta na página de vendas antes de se cadastrar; guardamos só os
--   identificadores dos cookies da própria Meta e o navegador (para a Meta
--   reconhecer a visita). Sem consentimento, ficam nulos e nada é enviado.
-- - users.reactivated_at: quando a conta ganhou um novo teste grátis na
--   reativação de cadastros antigos (mensagem pelo WhatsApp).
-- - automation_messages.kind: aceita também 'ativacao' (mensagens do teste
--   sem cartão) e 'reativacao' (os tipos antigos continuam valendo).

alter table "users" add column if not exists "first_entry_at" timestamp with time zone;
--> statement-breakpoint
alter table "users" add column if not exists "ads_consent_at" timestamp with time zone;
--> statement-breakpoint
alter table "users" add column if not exists "meta_fbp" text;
--> statement-breakpoint
alter table "users" add column if not exists "meta_fbc" text;
--> statement-breakpoint
alter table "users" add column if not exists "meta_ua" text;
--> statement-breakpoint
alter table "users" add column if not exists "reactivated_at" timestamp with time zone;
--> statement-breakpoint
alter table "automation_messages" drop constraint if exists "automation_messages_kind_check";
--> statement-breakpoint
alter table "automation_messages" add constraint "automation_messages_kind_check" check ("kind" in ('sem_uso', 'nao_pagou', 'teste', 'ativacao', 'reativacao'));
--> statement-breakpoint
update "users" u set "first_entry_at" = x.first_at
from (
  select user_id, min(created_at) as first_at from (
    select user_id, created_at from "transactions"
    union all
    select user_id, created_at from "fixed_accounts"
    union all
    select c.user_id, p.created_at from "card_purchases" p join "credit_cards" c on c.id = p.card_id
  ) all_entries group by user_id
) x
where x.user_id = u.id and u."first_entry_at" is null;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'first_entry_at') THEN
    RAISE EXCEPTION 'migração 0020 incompleta: coluna users.first_entry_at não existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'reactivated_at') THEN
    RAISE EXCEPTION 'migração 0020 incompleta: coluna users.reactivated_at não existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'automation_messages_kind_check' AND pg_get_constraintdef(oid) LIKE '%reativacao%'
  ) THEN
    RAISE EXCEPTION 'migração 0020 incompleta: automation_messages_kind_check sem os tipos novos';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "users" u
    WHERE u."first_entry_at" IS NULL
      AND (EXISTS (SELECT 1 FROM "transactions" t WHERE t.user_id = u.id)
        OR EXISTS (SELECT 1 FROM "fixed_accounts" f WHERE f.user_id = u.id))
  ) THEN
    RAISE EXCEPTION 'migração 0020: há contas com registros e sem first_entry_at';
  END IF;
END $$;
