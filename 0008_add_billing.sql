-- Cobrança mensal automática via Pix (Asaas) para quem se cadastra pela
-- página de vendas. Escrita à mão (mesmo motivo explicado na 0007: os
-- snapshots do drizzle-kit estão atrasados desde a 0003). Migração só
-- ADITIVA: nenhuma coluna existente muda; contas antigas ficam com
-- billing_enabled = false e continuam exatamente como antes (controle
-- manual de vencimento no painel admin).

alter table "users" add column "cpf" text;
--> statement-breakpoint
alter table "users" add column "billing_enabled" boolean default false not null;
--> statement-breakpoint
alter table "users" add column "asaas_customer_id" text;
--> statement-breakpoint
alter table "users" add column "asaas_subscription_id" text;
--> statement-breakpoint
create unique index "users_asaas_customer_unique" on "users" using btree ("asaas_customer_id");
--> statement-breakpoint
create unique index "users_asaas_subscription_unique" on "users" using btree ("asaas_subscription_id");
--> statement-breakpoint

-- Uma linha por cobrança mensal gerada no Asaas (espelho local, atualizado
-- pelo webhook e pela própria tela de pagamento). O Pix copia-e-cola e a
-- imagem do QR Code ficam em cache aqui para a tela abrir rápido.
create table "billing_payments" (
  "id" text primary key not null,
  "user_id" text not null,
  "asaas_payment_id" text not null,
  "due_date" date not null,
  "value" numeric(12, 2) not null,
  "status" text not null,
  "paid_at" timestamp with time zone,
  "invoice_url" text,
  "pix_payload" text,
  "pix_qr_image" text,
  "pix_expires_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
--> statement-breakpoint
alter table "billing_payments" add constraint "billing_payments_user_id_users_id_fk"
  foreign key ("user_id") references "public"."users"("id") on delete cascade on update no action;
--> statement-breakpoint
create unique index "billing_payments_asaas_unique" on "billing_payments" using btree ("asaas_payment_id");
--> statement-breakpoint
create index "billing_payments_user_idx" on "billing_payments" using btree ("user_id");
--> statement-breakpoint

-- Idempotência do webhook: o Asaas entrega "pelo menos uma vez", então o id
-- de cada evento é gravado antes de processar — evento repetido é ignorado.
create table "billing_webhook_events" (
  "id" text primary key not null,
  "event" text not null,
  "payment_id" text,
  "received_at" timestamp with time zone default now() not null
);
--> statement-breakpoint

-- RLS — billing_payments: o cliente só LÊ as próprias cobranças; quem grava
-- é só o modo serviço (webhook do Asaas / tela de pagamento, depois de a
-- credencial já ter sido conferida). O painel admin lê (escape amarrado à
-- role app_admin_runtime, mesmo padrão da 0006).
alter table "billing_payments" enable row level security;
--> statement-breakpoint
alter table "billing_payments" force row level security;
--> statement-breakpoint
create policy "billing_payments_read" on "billing_payments"
  for select
  using (
    current_setting('app.current_user_id', true) = user_id
    or current_setting('app.service_mode', true) = 'true'
    or (current_setting('app.admin_mode', true) = 'true' and current_user = 'app_admin_runtime')
  );
--> statement-breakpoint
create policy "billing_payments_service_insert" on "billing_payments"
  for insert
  with check (current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint
create policy "billing_payments_service_update" on "billing_payments"
  for update
  using (current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint
create policy "billing_payments_service_delete" on "billing_payments"
  for delete
  using (current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint

-- billing_webhook_events: só o modo serviço (o webhook) enxerga/grava.
alter table "billing_webhook_events" enable row level security;
--> statement-breakpoint
alter table "billing_webhook_events" force row level security;
--> statement-breakpoint
create policy "billing_webhook_events_service" on "billing_webhook_events"
  using (current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint

-- Permissões das roles de runtime (os "default privileges" já cobririam
-- tabelas novas criadas pela mesma role dona, mas deixamos explícito para
-- não depender disso — só se a role existir).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_runtime') then
    grant select, insert, update, delete on "billing_payments", "billing_webhook_events" to app_runtime;
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_admin_runtime') then
    grant select on "billing_payments" to app_admin_runtime;
  end if;
end
$$;
--> statement-breakpoint

-- Validação: as políticas precisam existir (tabela com FORCE RLS e zero
-- políticas bloqueia tudo, inclusive o próprio app).
do $$
declare
  missing int;
begin
  select count(*) into missing
  from (values
    ('billing_payments', 'billing_payments_read'),
    ('billing_payments', 'billing_payments_service_insert'),
    ('billing_payments', 'billing_payments_service_update'),
    ('billing_payments', 'billing_payments_service_delete'),
    ('billing_webhook_events', 'billing_webhook_events_service')
  ) as expected(tbl, pol)
  where not exists (
    select 1 from pg_policies where tablename = expected.tbl and policyname = expected.pol
  );
  if missing > 0 then
    raise exception 'Migração 0008: % política(s) esperada(s) não foram criadas', missing;
  end if;
end
$$;
