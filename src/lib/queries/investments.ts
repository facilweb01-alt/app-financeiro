import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { investments } from "@/db/schema";

export async function listInvestmentsForUser(userId: string) {
  return db
    .select()
    .from(investments)
    .where(eq(investments.userId, userId))
    .orderBy(desc(investments.date));
}
