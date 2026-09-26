import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { applyAsaasPayment, registerWebhookEvent, unregisterWebhookEvent } from "@/lib/billing/service";
import type { AsaasPayment } from "@/lib/billing/asaas";

// Webhook do Asaas (configurar no painel do Asaas: Integrações → Webhooks,
// URL https://<app>/api/asaas/webhook, eventos de cobrança, e o mesmo token
// da variável ASAAS_WEBHOOK_TOKEN no campo "Token de autenticação").
//
// - Autentica pelo header "asaas-access-token" (comparação em tempo
//   constante). Sem ASAAS_WEBHOOK_TOKEN configurado, recusa tudo.
// - Idempotente: o id de cada evento é gravado antes de processar; evento
//   repetido responde 200 sem refazer nada (o Asaas entrega "pelo menos uma
//   vez" e pausa a fila depois de 15 falhas seguidas — por isso só
//   respondemos erro quando vale a pena ele tentar de novo).

function tokenMatches(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const PAYMENT_EVENTS = new Set([
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED",
]);

export async function POST(request: NextRequest) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Webhook do Asaas não configurado (ASAAS_WEBHOOK_TOKEN ausente)." }, { status: 503 });
  }
  const received = request.headers.get("asaas-access-token") ?? "";
  if (!tokenMatches(received, expected)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: { id?: string; event?: string; payment?: AsaasPayment };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const event = body.event ?? "";
  const payment = body.payment;

  // Eventos que não são de cobrança (ou sem cobrança anexada): só confirma o recebimento.
  if (!PAYMENT_EVENTS.has(event) || !payment?.id) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const eventId = body.id ?? `${event}:${payment.id}:${payment.status}`;
  const isNew = await registerWebhookEvent(eventId, event, payment.id);
  if (!isNew) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const result = await applyAsaasPayment({
      ...payment,
      ...(event === "PAYMENT_DELETED" ? { deleted: true } : {}),
    });
    // Cobrança de alguém que não é deste app (mesma conta Asaas usada para
    // outra coisa): confirma e ignora, para não travar a fila do Asaas.
    return NextResponse.json({ ok: true, matched: Boolean(result.userId) });
  } catch (err) {
    console.error("[asaas-webhook] erro ao processar evento", eventId, err);
    // Libera o evento para o Asaas reenviar (senão o reenvio seria tratado como duplicado).
    await unregisterWebhookEvent(eventId);
    return NextResponse.json({ error: "Erro ao processar." }, { status: 500 });
  }
}
