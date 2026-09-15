-- Painel administrativo (piloto vendido por mensalidade): controle de
-- aprovação de acesso e de vencimento da assinatura, ver README "Painel
-- administrativo".
--
-- Grandfathering importante: contas que já existiam antes desta migração
-- (inclusive as usadas em dev/testes) recebem status = 'active' aqui, não
-- 'pending' — senão todo mundo que já tinha conta ficaria bloqueado do dia
-- para a noite. O DEFAULT da coluna só passa a ser 'pending' depois desse
-- backfill, então só contas criadas a partir de agora (ver
-- src/app/actions/auth.ts, signup) nascem pendentes de aprovação.
--
-- Não foi necessário mexer nas políticas de RLS da migração 0003: o acesso
-- do painel administrativo a dados de outros usuários usa o mesmo
-- app.service_mode já existente (ver src/db/client.ts, withServiceMode),
-- sempre depois de src/lib/dal.ts#verifyAdminSession() confirmar, com uma
-- leitura RLS normal da própria linha do usuário logado (sem risco de
-- recursão), que a sessão pertence de fato a um admin. Deliberadamente não
-- foi criada uma policy adicional baseada em função SECURITY DEFINER que
-- consulta a própria tabela "users" para decidir se o usuário é admin,
-- porque "users" está com FORCE ROW LEVEL SECURITY — nesse modo até o dono
-- da tabela fica sujeito às políticas, o que tornaria essa função
-- recursiva. Reaproveitar o service_mode já testado evita esse risco.

alter table "users" add column "role" text not null default 'user';
alter table "users" add column "status" text not null default 'active';
alter table "users" alter column "status" set default 'pending';
alter table "users" add column "subscription_due_date" date;
alter table "users" add column "last_login_at" timestamp with time zone;
alter table "users" add column "approved_at" timestamp with time zone;
--> statement-breakpoint

alter table "users" add constraint "users_role_check" check ("role" in ('user', 'admin'));
alter table "users" add constraint "users_status_check" check ("status" in ('pending', 'active', 'suspended'));
