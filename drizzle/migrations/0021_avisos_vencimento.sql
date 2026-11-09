-- Avisos de vencimento pelo WhatsApp (09/11/2026, pedido do Marcelo).
-- Aditiva: só estende a lista de tipos de automation_messages com
-- 'vencimento'. O passo guarda a data do vencimento (AAAAMMDD × 10 + aviso),
-- então cada aviso sai uma vez por cobrança. Ver src/lib/business/automations.ts.
alter table "automation_messages" drop constraint if exists "automation_messages_kind_check";
--> statement-breakpoint
alter table "automation_messages" add constraint "automation_messages_kind_check" check ("kind" in ('sem_uso', 'nao_pagou', 'teste', 'ativacao', 'reativacao', 'vencimento'));
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'automation_messages_kind_check'
      AND pg_get_constraintdef(oid) LIKE '%vencimento%'
      AND pg_get_constraintdef(oid) LIKE '%reativacao%'
  ) THEN
    RAISE EXCEPTION 'migração 0021 incompleta: automation_messages_kind_check sem o tipo vencimento';
  END IF;
END $$;
