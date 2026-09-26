"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRawSession } from "@/lib/dal";
import { getBillingOverview } from "@/lib/billing/service";

/**
 * "Já paguei" / checagem periódica da tela /assinatura: consulta o Asaas
 * direto (caso o webhook ainda não tenha chegado) e atualiza a conta.
 * Usa getRawSession() (não verifySession()) de propósito: esta ação precisa
 * funcionar justamente para quem ainda está bloqueado ou aguardando o 1º Pix.
 */
export async function refreshBillingStatus(): Promise<{ waiting: boolean }> {
  const session = await getRawSession();
  if (!session) redirect("/login");
  if (!session.billingEnabled) return { waiting: false };

  const overview = await getBillingOverview(session.userId, { refresh: true });
  revalidatePath("/assinatura");
  const waiting = overview.user.status === "pending" || overview.openPayment !== null;
  return { waiting };
}
