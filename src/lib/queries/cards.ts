import "server-only";
import { and, eq, asc } from "drizzle-orm";
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

/** Lista leve (só id + nome) — usada no seletor de cartão do relatório em PDF. */
export async function listCardsForUser(userId: string) {
  return db.query.creditCards.findMany({
    where: eq(creditCards.userId, userId),
    orderBy: [asc(creditCards.createdAt)],
    columns: { id: true, name: true },
  });
}

/** Um cartão específico com todos os detalhes, já escopado ao dono — usado no relatório em PDF por cartão. */
export async function getCardWithDetailsForUser(userId: string, cardId: string) {
  return db.query.creditCards.findFirst({
    where: and(eq(creditCards.userId, userId), eq(creditCards.id, cardId)),
    with: {
      purchases: {
        orderBy: (p, { desc }) => [desc(p.purchaseDate)],
        with: {
          installments: { orderBy: (i, { asc }) => [asc(i.installmentNumber)] },
          category: true,
        },
      },
    },
  });
}
