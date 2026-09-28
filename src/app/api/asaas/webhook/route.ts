import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  applyAsaasPayment,
  findUserIdByAsaasCustomer,
  registerWebhookEvent,
  syncCardSubscription,
  unregisterWebhookEvent,
} from "@/lib/billing/service";
import type { AsaasPayment } from "@/lib/billing/asaas";

// Webhook do Asaas (configurar no painel do Asaas: Integrações → Webhooks,
// URL https://<app>/api/asaas/webhook, eventos de Cobranças — e, para o
// cartão recorrente, também os de Assinaturas e Checkout — e o mesmo token
// da variável ASAAS_WEBHOOK_TOKEN no campo "Token de autenticação").
// Mesmo sem os eventos de Assinaturas/Checkout ligados, a troca para cartão
// funciona: a 1ª cobrança do cartão chega como evento de cobrança e a tela
// /assinatura também confere direto no Asaas quando o cliente volta do
// Checkout.
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

const CARD_EVENTS = new Set(["SUBSCRIPTION_CREATED", "SUBSCRIPTION_UPDATED", "CHECKOUT_PAID"]);

export async function POST(request: NextRequest) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Webhook do Asaas não configurado (ASAAS_WEBHOOK_TOKEN ausente)." }, { status: 503 });
  }
  const received = request.headers.get("asaas-access-token") ?? "";
  if (!tokenMatches(received, expected)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: {
    id?: string;
    event?: string;
    payment?: AsaasPayment;
    subscription?: { id?: string; customer?: string; billingType?: string };
    checkout?: { id?: string; customer?: string | null };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const event = body.event ?? "";
  const payment = body.payment;

  // Cartão recorrente: assinatura criada pelo Checkout / checkout pago ->
  // adota a assinatura de cartão do cliente.
  if (CARD_EVENTS.has(event)) {
    const customer = body.subscription?.customer ?? body.checkout?.customer ?? null;
    if (!customer) return NextResponse.json({ ok: true, ignored: true });
    if (event.startsWith("SUBSCRIPTION_") && body.subscription?.billingType && body.subscription.billingType !== "CREDIT_CARD") {
      return NextResponse.json({ ok: true, ignored: true });
    }
    const eventId = body.id ?? `${event}:${body.subscription?.id ?? body.checkout?.id ?? customer}`;
    const isNew = await registerWebhookEvent(eventId, event, null);
    if (!isNew) return NextResponse.json({ ok: true, duplicate: true });
    try {
      const userId = await findUserIdByAsaasCustomer(customer);
      const switched = userId ? await syncCardSubscription(userId) : false;
      return NextResponse.json({ ok: true, matched: Boolean(userId), switched });
    } catch (err) {
      console.error("[asaas-webhook] erro ao adotar assinatura de cartão", eventId, err);
      await unregisterWebhookEvent(eventId);
      return NextResponse.json({ error: "Erro ao processar." }, { status: 500 });
    }
  }

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
    // 1ª cobrança de uma assinatura de cartão que o app ainda não conhece:
    // o cliente concluiu o Checkout -> troca para a assinatura de cartão.
    if (result.userId && result.needsCardSync) {
      await syncCardSubscription(result.userId);
    }
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
