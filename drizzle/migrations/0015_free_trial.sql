-- 11/10/2026 — teste grátis de 7 dias (pedido do Marcelo). Migração ADITIVA.
--
-- 1) users.trial_ends_at: último dia do teste grátis (dia do cadastro + 7).
--    Só é preenchida para quem se cadastrar DEPOIS desta publicação. Quem já
--    tem conta fica com nulo e nada muda para essas pessoas: cliente ativo
--    continua ativo, cadastro que não pagou continua vendo a tela de
--    pagamento (decisão do Marcelo: o teste vale só para cadastros novos).
--    Regras em src/lib/billing/core.ts (TRIAL_DAYS, computeBillingState).
--
-- 2) automation_messages.kind passa a aceitar 'teste' (avisos da véspera e do
--    último dia do teste, com o link de pagamento). A regra antiga é
--    removida e recriada com os valores de antes + o novo, então nenhuma
--    linha existente deixa de valer.

alter table "users" add column "trial_ends_at" date;
--> statement-breakpoint

alter table "automation_messages" drop constraint "automation_messages_kind_check";
--> statement-breakpoint
alter table "automation_messages" add constraint "automation_messages_kind_check"
  check ("kind" in ('sem_uso', 'nao_pagou', 'teste'));

-- Conferência (rodar no SQL Editor se quiser; as duas contagens devem dar 0):
--   select count(*) from automation_messages where kind not in ('sem_uso', 'nao_pagou', 'teste');
--   select count(*) from users where trial_ends_at is not null and created_at < '2026-10-11';
