"use server";

import * as z from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withRLS } from "@/db/client";
import { transactions } from "@/db/schema";
import { verifySession } from "@/lib/dal";

const TransactionSchema = z.object({
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data da compra inválida."),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento inválida."),
  description: z.string().trim().min(1, "Informe o produto ou serviço."),
  categoryId: z.string().min(1, "Selecione uma categoria."),
  amount: z.coerce.number().positive("Valor precisa ser maior que zero."),
  notes: z.string().trim().optional(),
});

export type TransactionFormState = { ok: true } | { ok: false; error: string } | undefined;

export async function createTransaction(
  _prevState: TransactionFormState,
  formData: FormData
): Promise<TransactionFormState> {
  const session = await verifySession();

  const parsed = TransactionSchema.safeParse({
    purchaseDate: formData.get("purchaseDate"),
    dueDate: formData.get("dueDate"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    amount: formData.get("amount"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const data = parsed.data;

  await withRLS(session.userId, () =>
    db.insert(transactions).values({
      userId: session.userId,
      purchaseDate: data.purchaseDate,
      dueDate: data.dueDate,
      description: data.description,
      categoryId: data.categoryId,
      amount: data.amount.toString(),
      notes: data.notes ?? null,
    })
  );

  revalidatePath("/lancamentos");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteTransaction(formData: FormData) {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await withRLS(session.userId, () =>
    db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, session.userId)))
  );

  revalidatePath("/lancamentos");
  revalidatePath("/dashboard");
}
