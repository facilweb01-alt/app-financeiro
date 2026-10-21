"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { processPendingWelcomesSafely } from "@/lib/whatsapp/welcome";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRawSession } from "@/lib/dal";
import { CardCheckoutError, PlanChangeError, changeBillingPlan, getBillingOverview, startCardCheckout } from "@/lib/billing/service";
import { eq } from "drizzle-orm";
import { db, withRLS } from "@/db/client";
import { users } from "@/db/schema";
import { isValidCpf, onlyDigits, validateBillingAddress } from "@/lib/billing/core";

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

  // Cadastro simplificado (21/10/2026): o CPF vem no mesmo formulário do
  // cartão quando a conta ainda não tem (antes era uma tela só para ele).
  const rawCpf = formData.get("cpf")?.toString();
  if (rawCpf !== undefined) {
    if (!isValidCpf(rawCpf)) return { error: "CPF inválido. Confira os números." };
    const [current] = await withRLS(session.userId, () =>
      db.select({ cpf: users.cpf }).from(users).where(eq(users.id, session.userId)).limit(1)
    );
    if (!current) redirect("/login");
    if (!current.cpf) {
      const cpf = onlyDigits(rawCpf);
      await withRLS(session.userId, () => db.update(users).set({ cpf }).where(eq(users.id, session.userId)));
    }
  }

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
          : "Não foi possível abrir o cadastro do cartão agora. Tente de novo em instantes ou fale com o suporte pelo WhatsApp (83) 98199-5301.",
    };
  }
  redirect(url);
}

/**
 * Grava o CPF na tela de pagamento. O cadastro com teste grátis não pede CPF;
 * o Asaas exige para emitir a cobrança, então ele é pedido aqui, antes de
 * mostrar o cartão e o Pix. Só grava se a conta ainda não tem CPF (depois que
 * a cobrança existe no Asaas, trocar o CPF é assunto do suporte).
 */
export async function saveCpf(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const session = await getRawSession();
  if (!session) redirect("/login");
  if (!session.billingEnabled) return { error: "Esta conta não tem cobrança automática." };
  if (session.status === "suspended") return { error: "Conta suspensa. Fale com o suporte." };

  const raw = formData.get("cpf")?.toString() ?? "";
  if (!isValidCpf(raw)) return { error: "CPF inválido. Confira os números." };
  const cpf = onlyDigits(raw);

  const [current] = await withRLS(session.userId, () =>
    db.select({ cpf: users.cpf }).from(users).where(eq(users.id, session.userId)).limit(1)
  );
  if (!current) redirect("/login");
  if (!current.cpf) {
    await withRLS(session.userId, () => db.update(users).set({ cpf }).where(eq(users.id, session.userId)));
  }
  revalidatePath("/assinatura");
  return { error: null };
}

/**
 * Escolha do plano (mensal ou anual com 15% de desconto) na tela de
 * pagamento. Só para quem ainda não pagou; a regra fica em
 * billing/service.ts#changeBillingPlan.
 */
export async function choosePlan(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const session = await getRawSession();
  if (!session) redirect("/login");
  if (!session.billingEnabled) return { error: "Esta conta não tem cobrança automática." };
  if (session.status === "suspended") return { error: "Conta suspensa. Fale com o suporte." };

  const raw = formData.get("plan")?.toString();
  if (raw !== "MONTHLY" && raw !== "YEARLY") return { error: "Escolha o plano mensal ou o anual." };
  try {
    await changeBillingPlan(session.userId, raw);
  } catch (err) {
    if (err instanceof PlanChangeError) return { error: err.message };
    console.error("[billing] erro ao trocar de plano:", err);
    return { error: "Não foi possível trocar de plano agora. Tente de novo em instantes." };
  }
  revalidatePath("/assinatura");
  return { error: null };
}
