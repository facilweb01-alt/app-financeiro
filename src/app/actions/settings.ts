"use server";

import * as z from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withRLS } from "@/db/client";
import { users } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import type { SimpleFormState } from "@/lib/form-state";

// Aceita só dígitos, no formato internacional (ex: 5583999998888). Quem
// estiver integrando o WhatsApp (ex: via n8n) deve enviar o número dos
// contatos nesse mesmo formato para bater com o que foi vinculado aqui.
const PhoneSchema = z.object({
  whatsappPhone: z
    .string()
    .trim()
    .regex(/^\d{10,15}$/, "Use só números, com DDI e DDD (ex: 5583999998888)."),
});

export async function updateWhatsappPhone(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();
  const raw = String(formData.get("whatsappPhone") ?? "").replace(/\D/g, "");
  const parsed = PhoneSchema.safeParse({ whatsappPhone: raw });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Número inválido." };
  }

  try {
    await withRLS(session.userId, () =>
      db.update(users).set({ whatsappPhone: parsed.data.whatsappPhone }).where(eq(users.id, session.userId))
    );
  } catch {
    return { ok: false, error: "Esse número já está vinculado a outra conta." };
  }

  revalidatePath("/fechamento");
  return { ok: true };
}

export async function unlinkWhatsappPhone() {
  const session = await verifySession();
  await withRLS(session.userId, () =>
    db.update(users).set({ whatsappPhone: null }).where(eq(users.id, session.userId))
  );
  revalidatePath("/fechamento");
}
