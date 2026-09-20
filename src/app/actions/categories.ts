"use server";

import * as z from "zod";
import { and, eq, or, isNull, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withRLS } from "@/db/client";
import { categories } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import { slugifyCategoryLabel, CUSTOM_CATEGORY_COLORS } from "@/lib/categories";

const CategorySchema = z.object({
  label: z.string().trim().min(1, "Informe um nome para a categoria.").max(40, "Nome muito longo."),
});

export type CategoryFormState =
  | { ok: true; category: { id: string; key: string; label: string; color: string | null } }
  | { ok: false; error: string }
  | undefined;

/**
 * Cria uma categoria própria do usuário (userId preenchido — diferente das
 * categorias globais do sistema, que têm userId = null). Aparece somando às
 * globais em listCategoriesForUser a partir de agora.
 */
export async function createCategory(
  _prevState: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  const session = await verifySession();

  const parsed = CategorySchema.safeParse({ label: formData.get("label") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const label = parsed.data.label;
  const baseKey = slugifyCategoryLabel(label);

  return withRLS(session.userId, async () => {
    // Evita colidir com o índice único (key, userId): se já existir uma
    // categoria própria com essa key, acrescenta um sufixo numérico.
    const existing = await db
      .select({ key: categories.key })
      .from(categories)
      .where(
        and(eq(categories.userId, session.userId), or(eq(categories.key, baseKey), like(categories.key, `${baseKey}_%`)))
      );
    const existingKeys = new Set(existing.map((c) => c.key));
    let key = baseKey;
    let suffix = 2;
    while (existingKeys.has(key)) {
      key = `${baseKey}_${suffix}`;
      suffix += 1;
    }

    // Também evita duplicar exatamente o mesmo nome de uma categoria global.
    const alreadyGlobal = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(isNull(categories.userId), eq(categories.key, baseKey)));
    if (alreadyGlobal.length > 0 && !existingKeys.has(baseKey)) {
      return { ok: false, error: "Já existe uma categoria com esse nome." };
    }

    const color = CUSTOM_CATEGORY_COLORS[Math.floor(Math.random() * CUSTOM_CATEGORY_COLORS.length)];

    const [created] = await db
      .insert(categories)
      .values({ userId: session.userId, key, label, color })
      .returning({ id: categories.id, key: categories.key, label: categories.label, color: categories.color });

    revalidatePath("/lancamentos");
    revalidatePath("/dashboard");
    revalidatePath("/fechamento");

    return { ok: true, category: created };
  });
}
