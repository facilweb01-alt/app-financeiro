import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { fixedAccounts } from "@/db/schema";

export async function listFixedAccountsForUser(userId: string) {
  return db
    .select()
    .from(fixedAccounts)
    .where(eq(fixedAccounts.userId, userId))
    .orderBy(desc(fixedAccounts.createdAt));
}
