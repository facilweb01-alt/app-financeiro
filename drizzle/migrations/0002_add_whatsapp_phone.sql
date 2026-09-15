ALTER TABLE "users" ADD COLUMN "whatsapp_phone" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_whatsapp_phone_unique" ON "users" USING btree ("whatsapp_phone");