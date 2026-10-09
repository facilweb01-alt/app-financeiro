-- Pedidos do Marcelo em 09/10/2026. Migração ADITIVA (nada é apagado nem
-- reescrito; quem já existe fica com as colunas novas nulas).
--
-- 1) Dia de fechamento e dia de vencimento do cartão. Com os dois
--    preenchidos, a compra é lançada só com a data da compra e o app calcula
--    sozinho o 1º vencimento (compra a partir do dia do fechamento vai para a
--    fatura seguinte). Cartões antigos ficam nulos e continuam como antes
--    (1º vencimento informado à mão; pelo WhatsApp, a compra + 1 mês).
--
-- 2) Mensagens automáticas pelo WhatsApp:
--    - "sem_uso": cliente ativo que ainda não fez nenhum lançamento
--      (7 e 14 dias depois de liberado);
--    - "nao_pagou": cadastro que não pagou (1 hora depois e até 6 ofertas,
--      uma a cada 15 dias).
--    automation_messages guarda cada envio. A chave única (user_id, kind,
--    step) garante que a mesma mensagem nunca sai duas vezes, mesmo com duas
--    rodadas ao mesmo tempo (o envio só acontece depois de gravar a linha).
--    Falhou (Z-API fora do ar, número inválido)? Grava o erro e tenta de novo
--    depois de algumas horas, no máximo 3 tentativas.
--    users.marketing_opt_out_at: o cliente respondeu SAIR; não recebe mais
--    ofertas.

alter table "credit_cards" add column "closing_day" integer;
--> statement-breakpoint
alter table "credit_cards" add column "due_day" integer;
--> statement-breakpoint
alter table "credit_cards" add constraint "credit_cards_closing_day_check"
  check ("closing_day" is null or ("closing_day" between 1 and 31));
--> statement-breakpoint
alter table "credit_cards" add constraint "credit_cards_due_day_check"
  check ("due_day" is null or ("due_day" between 1 and 31));
--> statement-breakpoint
alter table "credit_cards" add constraint "credit_cards_cycle_both_or_none"
  check (("closing_day" is null) = ("due_day" is null));
--> statement-breakpoint

alter table "users" add column "marketing_opt_out_at" timestamp with time zone;
--> statement-breakpoint

create table "automation_messages" (
  "id" text primary key not null,
  "user_id" text not null references "users"("id") on delete cascade,
  "kind" text not null,
  "step" integer not null,
  "created_at" timestamp with time zone default now() not null,
  "attempts" integer default 0 not null,
  "last_attempt_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "error" text,
  constraint "automation_messages_kind_check" check ("kind" in ('sem_uso', 'nao_pagou'))
);
--> statement-breakpoint
create unique index "automation_messages_user_kind_step_idx" on "automation_messages" ("user_id", "kind", "step");
--> statement-breakpoint

-- Só o modo serviço (a rotina de envio) lê e grava.
alter table "automation_messages" enable row level security;
--> statement-breakpoint
alter table "automation_messages" force row level security;
--> statement-breakpoint
create policy "automation_messages_service" on "automation_messages"
  using (current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_runtime') then
    grant select, insert, update, delete on "automation_messages" to app_runtime;
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_admin_runtime') then
    grant select on "automation_messages" to app_admin_runtime;
  end if;
end
$$;
--> statement-breakpoint

-- Validação final.
do $$
begin
  if (select count(*) from information_schema.columns
      where (table_name = 'credit_cards' and column_name in ('closing_day', 'due_day'))
         or (table_name = 'users' and column_name = 'marketing_opt_out_at')) <> 3 then
    raise exception 'migração 0013 incompleta: colunas novas não existem';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'automation_messages' and policyname = 'automation_messages_service') then
    raise exception 'migração 0013 incompleta: política de automation_messages não foi criada';
  end if;
end
$$;
