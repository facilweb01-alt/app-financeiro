import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { transactions, categories, cardInstallments, cardPurchases, creditCards, fixedAccounts, investments, monthClosings } from "@/db/schema";
import { toYearMonth } from "@/lib/business/dates";
import type { TransactionLike, CardInstallmentLike } from "@/lib/business/monthClosing";

/** Reúne, do banco, tudo que computeMonthClosingSnapshot precisa para um usuário. */
export async function loadClosingInputsForUser(userId: string) {
  const [txRows, cardInstallmentRows, fixedRows, investmentRows] = await Promise.all([
    db
      .select({
        dueDate: transactions.dueDate,
        description: transactions.description,
        amount: transactions.amount,
        categoryKey: categories.key,
        categoryLabel: categories.label,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(eq(transactions.userId, userId)),

    db
      .select({
        dueDate: cardInstallments.dueDate,
        amount: cardInstallments.amount,
        installmentNumber: cardInstallments.installmentNumber,
        installmentsTotal: cardPurchases.installmentsTotal,
        cardName: creditCards.name,
        purchaseDescription: cardPurchases.description,
        categoryKey: categories.key,
        categoryLabel: categories.label,
      })
      .from(cardInstallments)
      .innerJoin(cardPurchases, eq(cardInstallments.cardPurchaseId, cardPurchases.id))
      .innerJoin(creditCards, eq(cardPurchases.cardId, creditCards.id))
      .leftJoin(categories, eq(cardPurchases.categoryId, categories.id))
      .where(eq(creditCards.userId, userId)),

    db.select().from(fixedAccounts).where(eq(fixedAccounts.userId, userId)),
    db.select().from(investments).where(eq(investments.userId, userId)),
  ]);

  const txLikes: TransactionLike[] = txRows.map((t) => ({
    dueDate: t.dueDate,
    description: t.description,
    amount: Number(t.amount),
    categoryKey: t.categoryKey,
    categoryLabel: t.categoryLabel,
  }));

  const cardLikes: CardInstallmentLike[] = cardInstallmentRows.map((i) => ({
    dueDate: i.dueDate,
    amount: Number(i.amount),
    categoryKey: i.categoryKey,
    categoryLabel: i.categoryLabel,
    cardName: i.cardName,
    purchaseDescription: i.purchaseDescription,
    installmentNumber: i.installmentNumber,
    installmentsTotal: i.installmentsTotal,
  }));

  return {
    transactions: txLikes,
    cardInstallments: cardLikes,
    fixedAccountsTotal: fixedRows.filter((f) => f.active).reduce((sum, f) => sum + Number(f.amount), 0),
    investmentsByYearMonth: (yearMonth: string) =>
      investmentRows.filter((inv) => toYearMonth(inv.date) === yearMonth).reduce((sum, inv) => sum + Number(inv.amount), 0),
  };
}

export async function listMonthClosingsForUser(userId: string) {
  return db
    .select()
    .from(monthClosings)
    .where(eq(monthClosings.userId, userId))
    .orderBy(desc(monthClosings.yearMonth));
}
