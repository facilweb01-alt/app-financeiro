import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { transactions, categories } from "@/db/schema";

export async function listTransactionsForUser(userId: string) {
  const rows = await db
    .select({
      id: transactions.id,
      purchaseDate: transactions.purchaseDate,
      dueDate: transactions.dueDate,
      description: transactions.description,
      amount: transactions.amount,
      notes: transactions.notes,
      categoryId: transactions.categoryId,
      categoryLabel: categories.label,
      categoryColor: categories.color,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.dueDate));

  return rows;
}
