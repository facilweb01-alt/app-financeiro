-- 11/10/2026 — plano anual com 15% de desconto (pedido do Marcelo). ADITIVA.
--
-- users.billing_plan: 'MONTHLY' (R$ 29,90 por mês) ou 'YEARLY' (R$ 304,98
-- por ano = 12 x 29,90 com 15% de desconto). Todo mundo que já existe fica
-- 'MONTHLY', que é o que já pagam; nada muda para eles. O plano é escolhido
-- na tela de pagamento por quem ainda não pagou (teste grátis ou cadastro
-- aguardando a 1ª cobrança). Regras em src/lib/billing/core.ts (planInfo).

alter table "users" add column "billing_plan" text default 'MONTHLY' not null;
--> statement-breakpoint
alter table "users" add constraint "users_billing_plan_check"
  check ("billing_plan" in ('MONTHLY', 'YEARLY'));

-- Conferência (deve dar 0): select count(*) from users where billing_plan <> 'MONTHLY';
