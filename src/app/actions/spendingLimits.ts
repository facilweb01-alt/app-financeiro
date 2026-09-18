"use server";

import * as z from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withRLS } from "@/db/client";
import { spendingLimits } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import type { SimpleFormState } from "@/lib/form-state";

const SpendingLimitSchema = z.object({
  categoryId: z.string().trim().min(1, "Selecione uma categoria."),
  monthlyLimit: z.coerce.number().positive("O limite precisa ser maior que zero."),
});

// Cria ou atualiza (upsert) o limite mensal de uma categoria — cada usuário
// só pode ter um limite por categoria (constraint spending_limits_user_category_unique).
export async function setSpendingLimit(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();

  const parsed = SpendingLimitSchema.safeParse({
    categoryId: formData.get("categoryId"),
    monthlyLimit: formData.get("monthlyLimit"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  await withRLS(session.userId, () =>
    db
      .insert(spendingLimits)
      .values({ userId: session.userId, categoryId: data.categoryId, monthlyLimit: data.monthlyLimit.toString() })
      .onConflictDoUpdate({
        target: [spendingLimits.userId, spendingLimits.categoryId],
        set: { monthlyLimit: data.monthlyLimit.toString() },
      })
  );

  revalidatePath("/fechamento");
  return { ok: true };
}

export async function deleteSpendingLimit(formData: FormData) {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await withRLS(session.userId, () =>
    db.delete(spendingLimits).where(and(eq(spendingLimits.id, id), eq(spendingLimits.userId, session.userId)))
  );
  revalidatePath("/fechamento");
}
