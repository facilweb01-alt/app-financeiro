-- Row-Level Security (RLS): o Postgres passa a impor, dentro do próprio
-- banco, que cada usuário só enxerga/altera as próprias linhas — mesmo que
-- um bug futuro no código da aplicação esqueça um filtro "WHERE user_id = ...".
--
-- Como funciona na prática: a aplicação define, por requisição autenticada,
-- a variável de sessão `app.current_user_id` (ver src/db/client.ts,
-- withRLS()). As políticas abaixo comparam essa variável com a dona da
-- linha. Sem essa variável definida, nenhuma linha é retornada nem pode ser
-- gravada — falha "fechada" por padrão.
--
-- FORCE ROW LEVEL SECURITY é necessário porque, por padrão, o Postgres
-- ignora RLS para quem é dono da tabela; a aplicação roda com uma role
-- separada (app_runtime, ver drizzle/rls-runtime-role.sql) sem privilégio
-- de dono, então FORCE nem seria estritamente necessário para ela — mas
-- deixamos ligado para o caso de alguém rodar migrações e esquecer de trocar
-- de role, o comportamento continua seguro.
--
-- app.service_mode: usado só nos pontos onde a aplicação precisa localizar
-- QUEM é o usuário antes de saber sua identidade (login por e-mail, cadastro,
-- verificação de sessão pelo cookie, busca por telefone no webhook do
-- WhatsApp). Esses pontos já são protegidos por outra credencial (senha com
-- hash, id de sessão imprevisível, segredo compartilhado do webhook) antes
-- de a aplicação ligar esse modo — ver src/lib/dal.ts, src/app/actions/auth.ts
-- e src/app/api/whatsapp/lancamento/route.ts.

alter table "users" enable row level security;
alter table "users" force row level security;
create policy "users_self_or_service" on "users"
  using (current_setting('app.current_user_id', true) = id or current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.current_user_id', true) = id or current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint

alter table "sessions" enable row level security;
alter table "sessions" force row level security;
create policy "sessions_self_or_service" on "sessions"
  using (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint

alter table "categories" enable row level security;
alter table "categories" force row level security;
create policy "categories_own_or_global_read" on "categories"
  for select
  using (user_id is null or current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true');
create policy "categories_own_write" on "categories"
  for insert
  with check (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true');
create policy "categories_own_update" on "categories"
  for update
  using (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true');
create policy "categories_own_delete" on "categories"
  for delete
  using (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint

alter table "transactions" enable row level security;
alter table "transactions" force row level security;
create policy "transactions_own" on "transactions"
  using (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint

alter table "credit_cards" enable row level security;
alter table "credit_cards" force row level security;
create policy "credit_cards_own" on "credit_cards"
  using (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint

alter table "card_purchases" enable row level security;
alter table "card_purchases" force row level security;
create policy "card_purchases_own" on "card_purchases"
  using (
    current_setting('app.service_mode', true) = 'true'
    or exists (
      select 1 from "credit_cards"
      where "credit_cards"."id" = "card_purchases"."card_id"
        and "credit_cards"."user_id" = current_setting('app.current_user_id', true)
    )
  )
  with check (
    current_setting('app.service_mode', true) = 'true'
    or exists (
      select 1 from "credit_cards"
      where "credit_cards"."id" = "card_purchases"."card_id"
        and "credit_cards"."user_id" = current_setting('app.current_user_id', true)
    )
  );
--> statement-breakpoint

alter table "card_installments" enable row level security;
alter table "card_installments" force row level security;
create policy "card_installments_own" on "card_installments"
  using (
    current_setting('app.service_mode', true) = 'true'
    or exists (
      select 1 from "card_purchases"
      join "credit_cards" on "credit_cards"."id" = "card_purchases"."card_id"
      where "card_purchases"."id" = "card_installments"."card_purchase_id"
        and "credit_cards"."user_id" = current_setting('app.current_user_id', true)
    )
  )
  with check (
    current_setting('app.service_mode', true) = 'true'
    or exists (
      select 1 from "card_purchases"
      join "credit_cards" on "credit_cards"."id" = "card_purchases"."card_id"
      where "card_purchases"."id" = "card_installments"."card_purchase_id"
        and "credit_cards"."user_id" = current_setting('app.current_user_id', true)
    )
  );
--> statement-breakpoint

alter table "card_statements" enable row level security;
alter table "card_statements" force row level security;
create policy "card_statements_own" on "card_statements"
  using (
    current_setting('app.service_mode', true) = 'true'
    or exists (
      select 1 from "credit_cards"
      where "credit_cards"."id" = "card_statements"."card_id"
        and "credit_cards"."user_id" = current_setting('app.current_user_id', true)
    )
  )
  with check (
    current_setting('app.service_mode', true) = 'true'
    or exists (
      select 1 from "credit_cards"
      where "credit_cards"."id" = "card_statements"."card_id"
        and "credit_cards"."user_id" = current_setting('app.current_user_id', true)
    )
  );
--> statement-breakpoint

alter table "investments" enable row level security;
alter table "investments" force row level security;
create policy "investments_own" on "investments"
  using (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint

alter table "fixed_accounts" enable row level security;
alter table "fixed_accounts" force row level security;
create policy "fixed_accounts_own" on "fixed_accounts"
  using (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true');
--> statement-breakpoint

alter table "month_closings" enable row level security;
alter table "month_closings" force row level security;
create policy "month_closings_own" on "month_closings"
  using (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true')
  with check (current_setting('app.current_user_id', true) = user_id or current_setting('app.service_mode', true) = 'true');
