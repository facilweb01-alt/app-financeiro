import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { investmentGoals } from "@/db/schema";

export async function listInvestmentGoalsForUser(userId: string) {
  return db
    .select()
    .from(investmentGoals)
    .where(eq(investmentGoals.userId, userId))
    .orderBy(desc(investmentGoals.createdAt));
}
