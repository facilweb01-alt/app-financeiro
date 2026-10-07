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

export type TransactionFormState = { ok: true; notice?: string } | { ok: false; error: string } | undefined;

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

  // O lançamento sempre vale para o mês que o cliente indicou (regra do
  // Marcelo, 07/10/2026). Se esse mês já foi encerrado, ele entra direto no
  // fechamento daquele mês: não vai para o mês seguinte nem soma no atual,
  // e por isso não aparece na lista do dia a dia.
  const dueMonth = toYearMonth(data.dueDate);
  const monthClosed = await withRLS(session.userId, async () => {
    const [closed] = await db
      .select({ id: monthClosings.id })
      .from(monthClosings)
      .where(and(eq(monthClosings.userId, session.userId), eq(monthClosings.yearMonth, dueMonth)))
      .limit(1);

    await db.insert(transactions).values({
      userId: session.userId,
      purchaseDate: data.purchaseDate,
      dueDate: data.dueDate,
      description: data.description,
      categoryId: data.categoryId,
      amount: data.amount.toString(),
      notes: data.notes ?? null,
    });
    return Boolean(closed);
  });

  revalidatePath("/lancamentos");
  revalidatePath("/dashboard");
  revalidatePath("/fechamento");
  if (monthClosed) {
    return {
      ok: true,
      notice: `${formatYearMonthBR(dueMonth)} já está encerrado: o lançamento entrou direto no fechamento desse mês e não aparece na lista abaixo. Veja na aba Fechamento.`,
    };
  }
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
  revalidatePath("/fechamento");
}
