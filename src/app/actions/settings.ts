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

// ---------------------------------------------------------------------------
// Vincular pelo WhatsApp com código (para quando o WhatsApp esconde o
// telefone e o app recebe só um "LID" — ver migração 0009). Gera um código
// de 6 dígitos válido por 30 minutos; o cliente manda "VINCULAR 123456" no
// WhatsApp do app e o endpoint /api/whatsapp/lancamento grava o vínculo.
// ---------------------------------------------------------------------------
export type LinkCodeState = { ok: true; code: string; expiresAt: string } | { ok: false; error: string } | undefined;

export async function generateWhatsappLinkCode(): Promise<LinkCodeState> {
  const session = await verifySession();
  const { randomInt } = await import("node:crypto");
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    try {
      await withRLS(session.userId, () =>
        db
          .update(users)
          .set({ whatsappLinkCode: code, whatsappLinkCodeExpiresAt: expiresAt })
          .where(eq(users.id, session.userId))
      );
      return { ok: true, code, expiresAt: expiresAt.toISOString() };
    } catch {
      // colisão rara com o código de outra pessoa (índice único): tenta outro
    }
  }
  return { ok: false, error: "Não consegui gerar o código agora. Tente de novo." };
}

export async function unlinkWhatsappLid() {
  const session = await verifySession();
  await withRLS(session.userId, () =>
    db.update(users).set({ whatsappLid: null }).where(eq(users.id, session.userId))
  );
  revalidatePath("/fechamento");
}
