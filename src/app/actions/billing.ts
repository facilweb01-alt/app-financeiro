"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { processPendingWelcomesSafely } from "@/lib/whatsapp/welcome";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRawSession } from "@/lib/dal";
import { CardCheckoutError, getBillingOverview, startCardCheckout } from "@/lib/billing/service";
import { validateBillingAddress } from "@/lib/billing/core";

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
  // Se o pagamento acabou de liberar a conta, manda as boas-vindas pelo WhatsApp.
  after(processPendingWelcomesSafely);
  revalidatePath("/assinatura");
  const waiting = overview.user.status === "pending" || overview.openPayment !== null;
  return { waiting };
}

/** Endereço público do app (para o Asaas mandar o cliente de volta depois do Checkout). */
async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * "Pagar com cartão de crédito": cria o Checkout do Asaas (cartão recorrente)
 * e manda o cliente para lá. Mesma regra de sessão do refresh acima — tem que
 * funcionar para quem ainda está aguardando o 1º pagamento ou bloqueado.
 */
export async function payWithCard(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const session = await getRawSession();
  if (!session) redirect("/login");
  if (!session.billingEnabled) return { error: "Esta conta não tem cobrança automática." };
  if (session.status === "suspended") return { error: "Conta suspensa. Fale com o suporte." };

  const addr = validateBillingAddress({
    postalCode: formData.get("postalCode")?.toString(),
    address: formData.get("address")?.toString(),
    addressNumber: formData.get("addressNumber")?.toString(),
    complement: formData.get("complement")?.toString(),
    province: formData.get("province")?.toString(),
  });
  if (!addr.ok) return { error: addr.error };

  let url: string;
  try {
    url = await startCardCheckout(session.userId, await appOrigin(), addr.data);
  } catch (err) {
    console.error("[billing] erro ao criar checkout do cartão:", err);
    return {
      error:
        err instanceof CardCheckoutError
          ? err.message
          : "Não foi possível abrir o pagamento com cartão agora. Tente de novo em instantes ou pague com Pix.",
    };
  }
  redirect(url);
}
