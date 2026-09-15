"use server";

import * as z from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withRLS } from "@/db/client";
import { investments } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import type { SimpleFormState } from "@/lib/form-state";

const InvestmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  description: z.string().trim().min(1, "Informe uma descrição."),
  type: z.string().trim().optional(),
  amount: z.coerce.number().positive("Valor precisa ser maior que zero."),
  notes: z.string().trim().optional(),
});

export async function createInvestment(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();
  const parsed = InvestmentSchema.safeParse({
    date: formData.get("date"),
    description: formData.get("description"),
    type: formData.get("type") || undefined,
    amount: formData.get("amount"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  await withRLS(session.userId, () =>
    db.insert(investments).values({
      userId: session.userId,
      date: data.date,
      description: data.description,
      type: data.type ?? null,
      amount: data.amount.toString(),
      notes: data.notes ?? null,
    })
  );

  revalidatePath("/investimentos");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteInvestment(formData: FormData) {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await withRLS(session.userId, () =>
    db.delete(investments).where(and(eq(investments.id, id), eq(investments.userId, session.userId)))
  );
  revalidatePath("/investimentos");
  revalidatePath("/dashboard");
}
