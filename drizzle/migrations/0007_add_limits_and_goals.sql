-- Duas tabelas novas, pedidas para fechar o gap de funcionalidades em
-- relação aos concorrentes pesquisados (GranaZen e outros): limites de
-- gastos por categoria com alerta, e metas de investimento com progresso.
--
-- Nota: o `drizzle-kit generate` deste projeto ficou "atrasado" desde a
-- migração 0003 (0003-0006 foram escritas à mão, sem rodar generate, então
-- os snapshots em drizzle/migrations/meta/*.json não refletem o estado
-- real do banco desde então) — isso não afeta `drizzle-kit migrate` (que
-- só lê a lista de arquivos .sql e a tabela de controle, não os
-- snapshots), mas faz o próximo `generate` tentar recriar admin_sessions e
-- as colunas de users de novo. Por isso este arquivo foi editado à mão
-- depois do generate, removendo essas duplicatas — mesmo padrão já usado
-- nas migrações anteriores.

CREATE TABLE "investment_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"target_amount" numeric(12, 2) NOT NULL,
	"current_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"target_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spending_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category_id" text NOT NULL,
	"monthly_limit" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investment_goals" ADD CONSTRAINT "investment_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_limits" ADD CONSTRAINT "spending_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_limits" ADD CONSTRAINT "spending_limits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investment_goals_user_idx" ON "investment_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "spending_limits_user_idx" ON "spending_limits" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spending_limits_user_category_unique" ON "spending_limits" USING btree ("user_id","category_id");--> statement-breakpoint

-- Row-Level Security — mesmo padrão das demais tabelas de domínio do
-- usuário (migração 0003): isolamento real no banco, não só na aplicação.
alter table "investment_goals" enable row level security;
alter table "investment_goals" force row level security;
create policy "investment_goals_own" on "investment_goals"
  using (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint

alter table "spending_limits" enable row level security;
alter table "spending_limits" force row level security;
create policy "spending_limits_own" on "spending_limits"
  using (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true');

-- Validação: confirma que as duas políticas foram criadas (mesmo padrão de
-- checagem usado na migração 0006 — "fechado por padrão" só vale se a
-- policy existir de verdade).
do $$
declare
  missing int;
begin
  select count(*) into missing
  from (values ('investment_goals', 'investment_goals_own'), ('spending_limits', 'spending_limits_own')) as expected(tbl, pol)
  where not exists (
    select 1 from pg_policies where tablename = expected.tbl and policyname = expected.pol
  );
  if missing > 0 then
    raise exception 'Migração 0007: % política(s) esperada(s) não foram criadas', missing;
  end if;
end
$$;
