"use server";

import * as z from "zod";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withRLS } from "@/db/client";
import { investmentGoals } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import type { SimpleFormState } from "@/lib/form-state";

const GoalSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome para a meta."),
  targetAmount: z.coerce.number().positive("O valor alvo precisa ser maior que zero."),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
    .optional()
    .or(z.literal("")),
});

export async function createInvestmentGoal(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();

  const parsed = GoalSchema.safeParse({
    name: formData.get("name"),
    targetAmount: formData.get("targetAmount"),
    targetDate: formData.get("targetDate"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  await withRLS(session.userId, () =>
    db.insert(investmentGoals).values({
      userId: session.userId,
      name: data.name,
      targetAmount: data.targetAmount.toString(),
      targetDate: data.targetDate ? data.targetDate : null,
    })
  );

  revalidatePath("/investimentos");
  return { ok: true };
}

const ContributionSchema = z.object({
  id: z.string().trim().min(1),
  amount: z.coerce.number().positive("O valor precisa ser maior que zero."),
});

// Registra um aporte manual, somando ao progresso já acumulado da meta.
export async function addGoalContribution(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();

  const parsed = ContributionSchema.safeParse({
    id: formData.get("id"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  await withRLS(session.userId, () =>
    db
      .update(investmentGoals)
      .set({ currentAmount: sql`${investmentGoals.currentAmount} + ${data.amount}` })
      .where(and(eq(investmentGoals.id, data.id), eq(investmentGoals.userId, session.userId)))
  );

  revalidatePath("/investimentos");
  return { ok: true };
}

export async function deleteInvestmentGoal(formData: FormData) {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await withRLS(session.userId, () =>
    db.delete(investmentGoals).where(and(eq(investmentGoals.id, id), eq(investmentGoals.userId, session.userId)))
  );
  revalidatePath("/investimentos");
}
