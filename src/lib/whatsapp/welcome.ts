import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db, withServiceMode } from "@/db/client";
import { users } from "@/db/schema";
import { buildWelcomeMessage, zapiPhone } from "@/lib/business/welcome";
import { buildManualPdf } from "@/lib/pdf/manualPdf";
import { publicAppUrl } from "@/lib/appUrl";
import { WHATSAPP_BOT_DISPLAY } from "@/lib/whatsappBot";
import { sendWhatsappPdf, sendWhatsappText } from "./zapi";

// Boas-vindas pelo WhatsApp com o manual em PDF.
//
// Fluxo (colunas da migração 0012):
//   1. alguém PEDE o envio preenchendo users.welcome_requested_at — o próprio
//      app quando o 1º pagamento libera a conta (billing/service.ts), ou o
//      painel admin (aprovação manual e botão "Enviar boas-vindas");
//   2. processPendingWelcomes() envia para quem está pedido, ativo, ainda
//      não enviado e sem erro registrado, e grava welcome_sent_at.
// Falhou? Grava welcome_error e NÃO tenta de novo sozinho (para nunca mandar
// a mesma mensagem várias vezes): o painel mostra o erro e o botão reenvia.

const PENDING = and(
  isNotNull(users.welcomeRequestedAt),
  isNull(users.welcomeSentAt),
  isNull(users.welcomeError),
  eq(users.status, "active")
);

export type WelcomeResult = { sent: number; failed: number };

export async function processPendingWelcomes(): Promise<WelcomeResult> {
  const pending = await withServiceMode(() =>
    db
      .select({ id: users.id, name: users.name, whatsappPhone: users.whatsappPhone })
      .from(users)
      .where(PENDING)
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
        .where(and(eq(users.id, user.id), PENDING))
        .returning({ id: users.id })
    );
    if (claimed.length === 0) continue;

    try {
      const phone = zapiPhone(user.whatsappPhone);
      if (!phone) throw new Error("Cliente sem número de WhatsApp válido no cadastro.");
      const appUrl = publicAppUrl();
      await sendWhatsappText(phone, buildWelcomeMessage({ name: user.name, appUrl, botNumber: WHATSAPP_BOT_DISPLAY }));
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
