"use server";

import * as z from "zod";
import { and, eq, gte, lte, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withRLS } from "@/db/client";
import { creditCards, cardPurchases, cardInstallments, cardStatements } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import { generateInstallments } from "@/lib/business/installments";
import type { SimpleFormState } from "@/lib/form-state";

// ---------------------------------------------------------------------------
// Cartão
// ---------------------------------------------------------------------------
const CardSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do cartão."),
});

export async function createCard(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();
  const parsed = CardSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  await withRLS(session.userId, () => db.insert(creditCards).values({ userId: session.userId, name: parsed.data.name }));
  revalidatePath("/cartoes");
  return { ok: true };
}

export async function deleteCard(formData: FormData) {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await withRLS(session.userId, () =>
    db.delete(creditCards).where(and(eq(creditCards.id, id), eq(creditCards.userId, session.userId)))
  );
  revalidatePath("/cartoes");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Compra no cartão (gera as parcelas automaticamente)
// ---------------------------------------------------------------------------
const CardPurchaseSchema = z.object({
  cardId: z.string().min(1),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data da compra inválida."),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento inválida."),
  description: z.string().trim().min(1, "Informe a descrição da compra."),
  categoryId: z.string().optional(),
  totalAmount: z.coerce.number().positive("Valor precisa ser maior que zero."),
  installmentsTotal: z.coerce.number().int().min(1).max(48, "Máximo de 48 parcelas."),
});

export async function createCardPurchase(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();

  const parsed = CardPurchaseSchema.safeParse({
    cardId: formData.get("cardId"),
    purchaseDate: formData.get("purchaseDate"),
    firstDueDate: formData.get("firstDueDate"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId") || undefined,
    totalAmount: formData.get("totalAmount"),
    installmentsTotal: formData.get("installmentsTotal"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  let generated;
  try {
    generated = generateInstallments({
      totalAmount: data.totalAmount,
      installmentsTotal: data.installmentsTotal,
      firstDueDate: data.firstDueDate,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível gerar as parcelas." };
  }

  const result = await withRLS(session.userId, async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    // Garante que o cartão pertence ao usuário logado.
    const [card] = await db
      .select({ id: creditCards.id })
      .from(creditCards)
      .where(and(eq(creditCards.id, data.cardId), eq(creditCards.userId, session.userId)))
      .limit(1);
    if (!card) {
      return { ok: false, error: "Cartão não encontrado." };
    }

    const [purchase] = await db
      .insert(cardPurchases)
      .values({
        cardId: data.cardId,
        purchaseDate: data.purchaseDate,
        description: data.description,
        categoryId: data.categoryId || null,
        totalAmount: data.totalAmount.toString(),
        installmentsTotal: data.installmentsTotal,
      })
      .returning({ id: cardPurchases.id });

    await db.insert(cardInstallments).values(
      generated.map((inst) => ({
        cardPurchaseId: purchase.id,
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDate,
        amount: inst.amount.toString(),
      }))
    );

    return { ok: true };
  });

  if (result.ok) {
    revalidatePath("/cartoes");
    revalidatePath("/dashboard");
  }
  return result;
}

export async function deleteCardPurchase(formData: FormData) {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await withRLS(session.userId, async () => {
    // Confere que a compra pertence a um cartão do usuário logado antes de apagar.
    const [purchase] = await db
      .select({ id: cardPurchases.id, cardId: cardPurchases.cardId })
      .from(cardPurchases)
      .innerJoin(creditCards, eq(cardPurchases.cardId, creditCards.id))
      .where(and(eq(cardPurchases.id, id), eq(creditCards.userId, session.userId)))
      .limit(1);

    if (purchase) {
      await db.delete(cardPurchases).where(eq(cardPurchases.id, id));
    }
  });

  revalidatePath("/cartoes");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Fechamento manual de fatura ("de tal data até tal data")
// ---------------------------------------------------------------------------
const StatementSchema = z.object({
  cardId: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inicial inválida."),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data final inválida."),
  closingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de fechamento inválida."),
});

export async function createCardStatement(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();

  const parsed = StatementSchema.safeParse({
    cardId: formData.get("cardId"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    closingDate: formData.get("closingDate"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  if (data.periodStart > data.periodEnd) {
    return { ok: false, error: "A data inicial precisa ser antes (ou igual) da data final." };
  }

  const result = await withRLS(session.userId, async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const [card] = await db
      .select({ id: creditCards.id })
      .from(creditCards)
      .where(and(eq(creditCards.id, data.cardId), eq(creditCards.userId, session.userId)))
      .limit(1);
    if (!card) {
      return { ok: false, error: "Cartão não encontrado." };
    }

    // Parcelas do cartão com vencimento dentro do período informado que ainda
    // não pertencem a nenhuma fatura fechada.
    const pendingInstallments = await db
      .select({ id: cardInstallments.id, amount: cardInstallments.amount })
      .from(cardInstallments)
      .innerJoin(cardPurchases, eq(cardInstallments.cardPurchaseId, cardPurchases.id))
      .where(
        and(
          eq(cardPurchases.cardId, data.cardId),
          gte(cardInstallments.dueDate, data.periodStart),
          lte(cardInstallments.dueDate, data.periodEnd),
          isNull(cardInstallments.statementId)
        )
      );

    if (pendingInstallments.length === 0) {
      return { ok: false, error: "Não há parcelas/lançamentos de cartão pendentes nesse período." };
    }

    const totalAmount = pendingInstallments.reduce((sum, i) => sum + Number(i.amount), 0);

    let statement;
    try {
      [statement] = await db
        .insert(cardStatements)
        .values({
          cardId: data.cardId,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          closingDate: data.closingDate,
          totalAmount: totalAmount.toFixed(2),
        })
        .returning({ id: cardStatements.id });
    } catch {
      // Violação do índice único (cardId, periodStart, periodEnd): já existe
      // uma fatura fechada com exatamente esse período para este cartão.
      return { ok: false, error: "Já existe uma fatura fechada com esse período exato para este cartão." };
    }

    for (const inst of pendingInstallments) {
      await db.update(cardInstallments).set({ statementId: statement.id, paid: true }).where(eq(cardInstallments.id, inst.id));
    }

    return { ok: true };
  });

  if (result.ok) {
    revalidatePath("/cartoes");
    revalidatePath("/fechamento");
  }
  return result;
}
