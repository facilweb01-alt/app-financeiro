import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { spendingLimits, categories } from "@/db/schema";

export async function listSpendingLimitsForUser(userId: string) {
  return db
    .select({
      id: spendingLimits.id,
      categoryId: spendingLimits.categoryId,
      categoryKey: categories.key,
      categoryLabel: categories.label,
      categoryColor: categories.color,
      monthlyLimit: spendingLimits.monthlyLimit,
    })
    .from(spendingLimits)
    .innerJoin(categories, eq(spendingLimits.categoryId, categories.id))
    .where(eq(spendingLimits.userId, userId))
    .orderBy(categories.label);
}
