"use server";

import * as z from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withRLS } from "@/db/client";
import { transactions, monthClosings } from "@/db/schema";
import { toYearMonth } from "@/lib/business/dates";
import { formatYearMonthBR } from "@/lib/format";
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

  // Mês já encerrado não recebe lançamento novo: o fechamento é uma foto do
  // mês, e o lançamento ficaria fora dela e fora da lista.
  const dueMonth = toYearMonth(data.dueDate);
  const blocked = await withRLS(session.userId, async () => {
    const [closed] = await db
      .select({ id: monthClosings.id })
      .from(monthClosings)
      .where(and(eq(monthClosings.userId, session.userId), eq(monthClosings.yearMonth, dueMonth)))
      .limit(1);
    if (closed) return true;

    await db.insert(transactions).values({
      userId: session.userId,
      purchaseDate: data.purchaseDate,
      dueDate: data.dueDate,
      description: data.description,
      categoryId: data.categoryId,
      amount: data.amount.toString(),
      notes: data.notes ?? null,
    });
    return false;
  });
  if (blocked) {
    return {
      ok: false,
      error: `O mês de ${formatYearMonthBR(dueMonth)} já foi encerrado. Para lançar nele, reabra o mês na aba Fechamento.`,
    };
  }

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
