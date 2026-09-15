"use server";

import * as z from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withServiceMode } from "@/db/client";
import { users } from "@/db/schema";
import { verifyAdminSession } from "@/lib/dal";
import type { SimpleFormState } from "@/lib/form-state";

// Escritas do painel administrativo. Todas mexem em contas de OUTROS
// usuários (não a do próprio admin) — por isso rodam em withServiceMode
// (não withRLS), e é exatamente por isso que cada uma reconfirma
// verifyAdminSession() antes de tocar no banco, mesmo que a própria página
// /admin já tenha checado isso: uma Server Action pode ser chamada
// diretamente, sem passar pela página.

async function setClientStatus(adminUserId: string, targetUserId: string, status: "active" | "suspended") {
  if (targetUserId === adminUserId) {
    return { ok: false, error: "Você não pode alterar o status da sua própria conta por aqui." } as const;
  }

  await withServiceMode(() =>
    db
      .update(users)
      .set({
        status,
        ...(status === "active" ? { approvedAt: new Date() } : {}),
      })
      .where(eq(users.id, targetUserId))
  );

  return { ok: true } as const;
}

export async function approveClient(formData: FormData) {
  const session = await verifyAdminSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setClientStatus(session.userId, id, "active");
  revalidatePath("/admin");
}

export async function suspendClient(formData: FormData) {
  const session = await verifyAdminSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setClientStatus(session.userId, id, "suspended");
  revalidatePath("/admin");
}

export async function reactivateClient(formData: FormData) {
  const session = await verifyAdminSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setClientStatus(session.userId, id, "active");
  revalidatePath("/admin");
}

const DueDateSchema = z.object({
  id: z.string().min(1),
  subscriptionDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
    .optional()
    .or(z.literal("")),
});

export async function updateSubscriptionDueDate(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  await verifyAdminSession();

  const parsed = DueDateSchema.safeParse({
    id: formData.get("id"),
    subscriptionDueDate: formData.get("subscriptionDueDate"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await withServiceMode(() =>
    db
      .update(users)
      .set({ subscriptionDueDate: parsed.data.subscriptionDueDate || null })
      .where(eq(users.id, parsed.data.id))
  );

  revalidatePath("/admin");
  return { ok: true };
}
