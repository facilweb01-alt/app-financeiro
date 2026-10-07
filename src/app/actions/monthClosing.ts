"use server";

import * as z from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withRLS } from "@/db/client";
import { monthClosings, users } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import { computeMonthClosingSnapshot } from "@/lib/business/monthClosing";
import { loadClosingInputsForUser } from "@/lib/queries/monthClosing";
import { closeMonthCardStatements } from "@/lib/cardStatements";
import { compareYearMonth, currentYearMonth, todaySaoPaulo } from "@/lib/business/dates";
import { formatYearMonthBR } from "@/lib/format";
import type { SimpleFormState } from "@/lib/form-state";

const CloseMonthSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido."),
});

export async function closeMonth(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();
  const parsed = CloseMonthSchema.safeParse({ yearMonth: formData.get("yearMonth") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { yearMonth } = parsed.data;

  // Mês que ainda nem começou não tem o que encerrar (e ficaria travado
  // como "encerrado" antes de existir qualquer gasto nele).
  if (compareYearMonth(yearMonth, currentYearMonth()) > 0) {
    return { ok: false, error: `${formatYearMonthBR(yearMonth)} ainda não começou. Só dá para encerrar o mês atual ou um mês anterior.` };
  }

  const result = await withRLS(session.userId, async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const [user] = await db
      .select({ monthlyIncome: users.monthlyIncome })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    const income = Number(user?.monthlyIncome ?? 0);

    const inputs = await loadClosingInputsForUser(session.userId);
    const snapshot = computeMonthClosingSnapshot({
      yearMonth,
      income,
      transactions: inputs.transactions,
      cardInstallments: inputs.cardInstallments,
      fixedAccountsTotal: inputs.fixedAccountsTotal,
      investmentsTotal: inputs.investmentsByYearMonth(yearMonth),
    });

    // Checa antes de inserir: um erro de índice único dentro da transação
    // do withRLS abortaria a transação inteira.
    const [already] = await db
      .select({ id: monthClosings.id })
      .from(monthClosings)
      .where(and(eq(monthClosings.userId, session.userId), eq(monthClosings.yearMonth, yearMonth)))
      .limit(1);
    if (already) {
      return { ok: false, error: "Esse mês já foi fechado antes." };
    }

    await db.insert(monthClosings).values({
      userId: session.userId,
      yearMonth,
      income: income.toString(),
      snapshot: JSON.stringify(snapshot),
    });

    // Encerrar o mês fecha junto a fatura daquele mês em cada cartão: as
    // parcelas do mês recebem baixa e saem da lista de parcelas em aberto.
    await closeMonthCardStatements(session.userId, yearMonth, todaySaoPaulo());

    return { ok: true };
  });

  if (!result.ok) {
    return result;
  }

  // O aviso "encerrar o mês?" mora no layout, e a lista de lançamentos
  // esconde os meses encerrados: tudo precisa ser recalculado.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteMonthClosing(formData: FormData) {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await withRLS(session.userId, () =>
    db.delete(monthClosings).where(and(eq(monthClosings.id, id), eq(monthClosings.userId, session.userId)))
  );
  revalidatePath("/", "layout");
}

const IncomeSchema = z.object({
  monthlyIncome: z.coerce.number().min(0, "Renda não pode ser negativa."),
});

export async function updateMonthlyIncome(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();
  const parsed = IncomeSchema.safeParse({ monthlyIncome: formData.get("monthlyIncome") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Valor inválido." };
  }
  await withRLS(session.userId, () =>
    db.update(users).set({ monthlyIncome: parsed.data.monthlyIncome.toString() }).where(eq(users.id, session.userId))
  );
  revalidatePath("/dashboard");
  revalidatePath("/fechamento");
  return { ok: true };
}
