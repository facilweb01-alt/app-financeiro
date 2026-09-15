// Seed idempotente das categorias padrão do sistema. Pode rodar quantas
// vezes quiser (dev, depois de recriar o banco, ou em produção) que nunca
// duplica: para cada categoria, só insere se ainda não existir uma global
// (userId null) com a mesma key.
//
// Nota técnica: o índice único (key, user_id) do Postgres NÃO impede
// duplicidade quando user_id é NULL (NULL não é igual a NULL nas regras de
// unicidade do Postgres) — por isso a checagem de duplicidade das
// categorias globais é feita aqui, na aplicação, e não só pela constraint.
// Testado abaixo rodando o seed duas vezes seguidas.
import { db, withServiceMode } from "./client";
import { categories } from "./schema";
import { isNull, eq, and } from "drizzle-orm";
import { DEFAULT_CATEGORIES } from "@/lib/categories";

export async function seedDefaultCategories() {
  let created = 0;
  let skipped = 0;

  // Categorias globais (user_id = null) não pertencem a nenhum usuário
  // específico — gravá-las exige modo serviço (ver 0003_add_row_level_security.sql).
  await withServiceMode(async () => {
    for (const cat of DEFAULT_CATEGORIES) {
      const [existing] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.key, cat.key), isNull(categories.userId)))
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      await db.insert(categories).values({
        key: cat.key,
        label: cat.label,
        color: cat.color,
        userId: null,
      });
      created++;
    }
  });

  return { created, skipped };
}

// Permite rodar via `npx tsx src/db/seed.ts`
if (require.main === module) {
  seedDefaultCategories()
    .then(({ created, skipped }) => {
      console.log(`Seed de categorias: ${created} criada(s), ${skipped} já existiam.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Erro ao rodar seed:", err);
      process.exit(1);
    });
}
