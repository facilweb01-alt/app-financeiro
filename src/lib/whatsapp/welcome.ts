import "server-only";
import { and, eq, gte, isNotNull, isNull, or } from "drizzle-orm";
import { db, withServiceMode } from "@/db/client";
import { users } from "@/db/schema";
import { buildWelcomeMessage, zapiPhone } from "@/lib/business/welcome";
import { buildManualPdf } from "@/lib/pdf/manualPdf";
import { publicAppUrl } from "@/lib/appUrl";
import { WHATSAPP_BOT_DISPLAY } from "@/lib/whatsappBot";
import { todayInSaoPaulo } from "@/lib/billing/core";
import { sendWhatsappPdf, sendWhatsappText } from "./zapi";

// Boas-vindas pelo WhatsApp com o manual em PDF.
//
// Fluxo (colunas da migração 0012):
//   1. alguém PEDE o envio preenchendo users.welcome_requested_at — o
//      cadastro com teste grátis (actions/auth.ts), o próprio app quando o
//      1º pagamento libera a conta (billing/service.ts), ou o painel admin
//      (aprovação manual e botão "Enviar boas-vindas");
//   2. processPendingWelcomes() envia para quem está pedido, ativo OU em
//      teste grátis ainda valendo, ainda não enviado e sem erro registrado,
//      e grava welcome_sent_at. Quem recebeu no teste não recebe de novo
//      quando paga (welcome_sent_at já está preenchido).
// Falhou? Grava welcome_error e NÃO tenta de novo sozinho (para nunca mandar
// a mesma mensagem várias vezes): o painel mostra o erro e o botão reenvia.

const pendingFilter = () =>
  and(
    isNotNull(users.welcomeRequestedAt),
    isNull(users.welcomeSentAt),
    isNull(users.welcomeError),
    or(
      eq(users.status, "active"),
      and(eq(users.status, "pending"), eq(users.billingEnabled, true), isNull(users.billingCanceledAt), gte(users.trialEndsAt, todayInSaoPaulo()))
    )
  );

export type WelcomeResult = { sent: number; failed: number };

export async function processPendingWelcomes(): Promise<WelcomeResult> {
  const pending = await withServiceMode(() =>
    db
      .select({ id: users.id, name: users.name, whatsappPhone: users.whatsappPhone, status: users.status, trialEndsAt: users.trialEndsAt })
      .from(users)
      .where(pendingFilter())
      .limit(20)
  );

  const result: WelcomeResult = { sent: 0, failed: 0 };
  for (const user of pending) {
    // "Reserva" o envio antes de mandar: se duas chamadas chegarem juntas,
    // só uma delas consegue marcar e enviar.
    const claimed = await withServiceMode(() =>
      db
        .update(users)
        .set({ welcomeSentAt: new Date() })
        .where(and(eq(users.id, user.id), pendingFilter()))
        .returning({ id: users.id })
    );
    if (claimed.length === 0) continue;

    try {
      const phone = zapiPhone(user.whatsappPhone);
      if (!phone) throw new Error("Cliente sem número de WhatsApp válido no cadastro.");
      const appUrl = publicAppUrl();
      await sendWhatsappText(phone, buildWelcomeMessage({
          name: user.name,
          appUrl,
          botNumber: WHATSAPP_BOT_DISPLAY,
          // conta ainda em teste grátis: a mensagem avisa até quando ele vale
          trialEndsAt: user.status === "pending" ? user.trialEndsAt : null,
        }));
      await sendWhatsappPdf(phone, await buildManualPdf({ appUrl }), "Manual-Contay", "📘 Manual do Contay");
      result.sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido.";
      console.error("[boas-vindas] falha ao enviar para", user.id, message);
      await withServiceMode(() =>
        db.update(users).set({ welcomeSentAt: null, welcomeError: message.slice(0, 300) }).where(eq(users.id, user.id))
      );
      result.failed += 1;
    }
  }
  return result;
}

/** Versão que nunca lança erro — para rodar depois da resposta (after()). */
export async function processPendingWelcomesSafely(): Promise<void> {
  try {
    await processPendingWelcomes();
  } catch (err) {
    console.error("[boas-vindas] erro ao processar pendentes:", err);
  }
}
