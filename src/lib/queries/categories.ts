import "server-only";
import { or, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { categories } from "@/db/schema";

/** Categorias visíveis para um usuário: as globais do sistema + as próprias dele. */
export async function listCategoriesForUser(userId: string) {
  return db
    .select({ id: categories.id, key: categories.key, label: categories.label, color: categories.color })
    .from(categories)
    .where(or(isNull(categories.userId), eq(categories.userId, userId)))
    .orderBy(categories.label);
}
