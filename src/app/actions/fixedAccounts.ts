"use server";

import * as z from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withRLS } from "@/db/client";
import { fixedAccounts } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import type { SimpleFormState } from "@/lib/form-state";

const FixedAccountSchema = z.object({
  description: z.string().trim().min(1, "Informe uma descrição."),
  amount: z.coerce.number().positive("Valor precisa ser maior que zero."),
});

export async function createFixedAccount(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();
  const parsed = FixedAccountSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  await withRLS(session.userId, () =>
    db.insert(fixedAccounts).values({
      userId: session.userId,
      description: data.description,
      amount: data.amount.toString(),
    })
  );

  revalidatePath("/contas-fixas");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteFixedAccount(formData: FormData) {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await withRLS(session.userId, () =>
    db.delete(fixedAccounts).where(and(eq(fixedAccounts.id, id), eq(fixedAccounts.userId, session.userId)))
  );
  revalidatePath("/contas-fixas");
  revalidatePath("/dashboard");
}

export async function toggleFixedAccountActive(formData: FormData) {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;
  await withRLS(session.userId, () =>
    db
      .update(fixedAccounts)
      .set({ active: !active })
      .where(and(eq(fixedAccounts.id, id), eq(fixedAccounts.userId, session.userId)))
  );
  revalidatePath("/contas-fixas");
  revalidatePath("/dashboard");
}
