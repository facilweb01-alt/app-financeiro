import "server-only";
import { and, eq, desc, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { transactions, categories, cardInstallments, cardPurchases, creditCards, fixedAccounts, investments, monthClosings } from "@/db/schema";
import { addMonthsToYearMonth, toYearMonth } from "@/lib/business/dates";
import { monthPendingClose } from "@/lib/business/monthClosing";
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

/** Meses ("YYYY-MM") que o usuário já encerrou. */
export async function listClosedYearMonths(userId: string): Promise<string[]> {
  const rows = await db
    .select({ yearMonth: monthClosings.yearMonth })
    .from(monthClosings)
    .where(eq(monthClosings.userId, userId));
  return rows.map((r) => r.yearMonth);
}

/**
 * O mês passado terminou sem ser encerrado e teve gasto? Devolve "YYYY-MM"
 * para o aviso do topo do app, ou null. Precisa rodar dentro de withRLS.
 */
export async function getMonthPendingClose(userId: string, today: string): Promise<string | null> {
  const previous = addMonthsToYearMonth(toYearMonth(today), -1);
  const from = `${previous}-01`;
  const to = `${toYearMonth(today)}-01`;

  const [closed, tx, inst] = await Promise.all([
    listClosedYearMonths(userId),
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), gte(transactions.dueDate, from), lt(transactions.dueDate, to)))
      .limit(1),
    db
      .select({ id: cardInstallments.id })
      .from(cardInstallments)
      .innerJoin(cardPurchases, eq(cardInstallments.cardPurchaseId, cardPurchases.id))
      .innerJoin(creditCards, eq(cardPurchases.cardId, creditCards.id))
      .where(and(eq(creditCards.userId, userId), gte(cardInstallments.dueDate, from), lt(cardInstallments.dueDate, to)))
      .limit(1),
  ]);

  return monthPendingClose({
    today,
    closedMonths: closed,
    monthsWithActivity: tx.length > 0 || inst.length > 0 ? [previous] : [],
  });
}
