import "server-only";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { creditCards } from "@/db/schema";

export async function listCardsWithDetailsForUser(userId: string) {
  return db.query.creditCards.findMany({
    where: eq(creditCards.userId, userId),
    orderBy: [asc(creditCards.createdAt)],
    with: {
      purchases: {
        orderBy: (p, { desc }) => [desc(p.purchaseDate)],
        with: {
          installments: { orderBy: (i, { asc }) => [asc(i.installmentNumber)] },
          category: true,
        },
      },
      statements: {
        orderBy: (s, { desc }) => [desc(s.periodStart)],
      },
    },
  });
}
