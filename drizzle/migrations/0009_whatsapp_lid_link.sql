-- Vínculo do WhatsApp por código (bug real de 26/09/2026): para quem não tem
-- o número do app salvo nos contatos, o WhatsApp esconde o telefone e o
-- Z-API entrega só um identificador "LID" (ex.: 184713742393347@lid). Aí o
-- número cadastrado no app nunca batia. Agora o cliente gera um código na
-- aba Fechamento, manda "VINCULAR 123456" no WhatsApp e o app grava esse
-- LID na conta dele. Migração só ADITIVA (escrita à mão, como a 0007/0008).

alter table "users" add column "whatsapp_lid" text;
--> statement-breakpoint
alter table "users" add column "whatsapp_link_code" text;
--> statement-breakpoint
alter table "users" add column "whatsapp_link_code_expires_at" timestamp with time zone;
--> statement-breakpoint
create unique index "users_whatsapp_lid_unique" on "users" using btree ("whatsapp_lid");
--> statement-breakpoint
create unique index "users_whatsapp_link_code_unique" on "users" using btree ("whatsapp_link_code");
--> statement-breakpoint
DO $$
DECLARE missing int;
BEGIN
  SELECT 3 - count(*) INTO missing FROM information_schema.columns
   WHERE table_name = 'users' AND column_name IN ('whatsapp_lid','whatsapp_link_code','whatsapp_link_code_expires_at');
  IF missing <> 0 THEN RAISE EXCEPTION 'migração 0009 incompleta: % colunas faltando', missing; END IF;
END $$;
