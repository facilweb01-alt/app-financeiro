import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, withServiceMode } from "@/db/client";
import { billingPayments, billingWebhookEvents, users } from "@/db/schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AsaasError,
  checkoutPageUrl,
  createCardCheckout,
  createCustomer,
  createSubscription,
  deleteSubscription,
  getPayment,
  getPixQrCode,
  isAsaasConfigured,
  listCustomerSubscriptions,
  listSubscriptionPayments,
  type AsaasPayment,
} from "./asaas";
import {
  PLAN_NAME,
  PLAN_PRICE,
  cardFirstDueDate,
  checkoutDueDateTime,
  computeSubscriptionDueDate,
  isOpenStatus,
  isPaidStatus,
  normalizeBillingMethod,
  pickCardSubscription,
  todayInSaoPaulo,
  type BillingMethod,
} from "./core";

// Orquestra a cobrança mensal (Pix ou cartão de crédito recorrente): cria
// cliente/assinatura no Asaas, espelha as
// cobranças em billing_payments e mantém users.status/subscriptionDueDate em
// dia. Tudo aqui roda em modo serviço (billing_payments só aceita escrita
// nesse modo — ver migração 0008), SEMPRE depois de outra credencial já ter
// sido conferida: a sessão do próprio cliente (tela /assinatura, e só para o
// userId dele) ou o token do webhook do Asaas.

export type OpenPayment = {
  id: string;
  asaasPaymentId: string;
  dueDate: string;
  value: string;
  status: string;
  billingType: BillingMethod;
  pixPayload: string | null;
  pixQrImage: string | null;
  invoiceUrl: string | null;
};

export type BillingOverview = {
  configured: boolean;
  error: string | null;
  user: {
    id: string;
    name: string | null;
    status: string;
    billingEnabled: boolean;
    subscriptionDueDate: string | null;
    billingCanceledAt: Date | null;
    billingMethod: BillingMethod;
  };
  openPayment: OpenPayment | null;
  history: { dueDate: string; value: string; status: string; paidAt: Date | null }[];
};

/** Grava/atualiza uma cobrança do Asaas no espelho local e recalcula a conta do dono. */
export async function applyAsaasPayment(
  payment: AsaasPayment
): Promise<{ userId: string | null; needsCardSync: boolean }> {
  return withServiceMode(async () => {
    // Descobre o dono: pela assinatura, depois pelo cliente, depois pela referência externa.
    const conditions = [
      payment.subscription ? eq(users.asaasSubscriptionId, payment.subscription) : undefined,
      payment.customer ? eq(users.asaasCustomerId, payment.customer) : undefined,
      payment.externalReference ? eq(users.id, payment.externalReference) : undefined,
    ].filter(Boolean);

    let owner: { id: string; asaasSubscriptionId: string | null } | undefined;
    for (const cond of conditions) {
      [owner] = await db
        .select({ id: users.id, asaasSubscriptionId: users.asaasSubscriptionId })
        .from(users)
        .where(cond!)
        .limit(1);
      if (owner) break;
    }
    if (!owner) return { userId: null, needsCardSync: false };

    const paid = isPaidStatus(payment.status);
    const paidAtStr = payment.clientPaymentDate || payment.paymentDate || payment.confirmedDate;
    const status = payment.deleted ? "DELETED" : payment.status;
    const values = {
      userId: owner.id,
      asaasPaymentId: payment.id,
      dueDate: payment.dueDate,
      value: payment.value.toFixed(2),
      status,
      paidAt: paid ? (paidAtStr ? new Date(`${paidAtStr}T12:00:00-03:00`) : new Date()) : null,
      invoiceUrl: payment.invoiceUrl ?? null,
      billingType: payment.billingType ?? null,
      asaasSubscriptionId: payment.subscription ?? null,
      updatedAt: new Date(),
    };

    await db
      .insert(billingPayments)
      .values(values)
      .onConflictDoUpdate({
        target: billingPayments.asaasPaymentId,
        set: {
          dueDate: values.dueDate,
          value: values.value,
          status: values.status,
          paidAt: values.paidAt,
          invoiceUrl: values.invoiceUrl,
          ...(values.billingType ? { billingType: values.billingType } : {}),
          ...(values.asaasSubscriptionId ? { asaasSubscriptionId: values.asaasSubscriptionId } : {}),
          updatedAt: values.updatedAt,
        },
      });

    await recomputeUserBilling(owner.id);
    // Cobrança de cartão de uma assinatura que o app ainda não conhece = o
    // cliente acabou de concluir o Checkout do Asaas. Quem chamou (webhook)
    // roda syncCardSubscription() para adotar a assinatura nova.
    const needsCardSync =
      payment.billingType === "CREDIT_CARD" &&
      Boolean(payment.subscription) &&
      payment.subscription !== owner.asaasSubscriptionId &&
      !payment.deleted;
    return { userId: owner.id, needsCardSync };
  });
}

/**
 * Recalcula o vencimento que importa e, se o primeiro Pix foi pago, libera a
 * conta (pending -> active). Conta suspensa manualmente pelo admin continua
 * suspensa — pagamento não desfaz uma decisão do admin. Precisa rodar dentro
 * de withServiceMode().
 */
async function recomputeUserBilling(userId: string): Promise<void> {
  const payments = await db
    .select({
      dueDate: billingPayments.dueDate,
      status: billingPayments.status,
      asaasSubscriptionId: billingPayments.asaasSubscriptionId,
    })
    .from(billingPayments)
    .where(eq(billingPayments.userId, userId));

  const [user] = await db
    .select({ status: users.status, approvedAt: users.approvedAt, asaasSubscriptionId: users.asaasSubscriptionId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return;

  // "Dia do contrato" = o da assinatura atual (muda quando troca Pix -> cartão).
  const current = payments
    .filter((p) => user.asaasSubscriptionId && p.asaasSubscriptionId === user.asaasSubscriptionId)
    .map((p) => p.dueDate)
    .sort();
  const dueDate = computeSubscriptionDueDate(payments, { anchorDate: current[0] ?? null });
  const anyPaid = payments.some((p) => isPaidStatus(p.status));

  const activate = anyPaid && user.status === "pending";
  await db
    .update(users)
    .set({
      subscriptionDueDate: dueDate,
      ...(activate ? { status: "active", approvedAt: user.approvedAt ?? new Date() } : {}),
    })
    .where(eq(users.id, userId));
}

/**
 * Registra o id do evento do webhook. Devolve false se já tinha sido
 * processado (entrega repetida do Asaas).
 */
export async function registerWebhookEvent(id: string, event: string, paymentId: string | null): Promise<boolean> {
  return withServiceMode(async () => {
    const inserted = await db
      .insert(billingWebhookEvents)
      .values({ id, event, paymentId })
      .onConflictDoNothing()
      .returning({ id: billingWebhookEvents.id });
    return inserted.length > 0;
  });
}

/** Desfaz o registro de um evento que falhou ao processar (para o reenvio do Asaas valer). */
export async function unregisterWebhookEvent(id: string): Promise<void> {
  await withServiceMode(() => db.delete(billingWebhookEvents).where(eq(billingWebhookEvents.id, id)));
}

/**
 * Garante cliente + assinatura no Asaas para o usuário (cria na primeira vez)
 * e sincroniza as cobranças já geradas. Idempotente: se já existe, só
 * sincroniza.
 */
async function ensureSubscription(userId: string): Promise<void> {
  // Trava por usuário (advisory lock do Postgres) enquanto cria cliente e
  // assinatura: duas abas/cliques simultâneos na tela de pagamento não podem
  // criar duas assinaturas (= duas cobranças) no Asaas. As leituras/escritas
  // abaixo rodam em transações próprias (veem o que a outra requisição já
  // gravou); esta transação externa só segura a trava.
  await withServiceMode(async () => {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${"billing:" + userId}))`);
    await ensureSubscriptionLocked(userId);
  });
}

async function ensureSubscriptionLocked(userId: string): Promise<void> {
  const [user] = await withServiceMode(() =>
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        cpf: users.cpf,
        whatsappPhone: users.whatsappPhone,
        asaasCustomerId: users.asaasCustomerId,
        asaasSubscriptionId: users.asaasSubscriptionId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  );
  if (!user) return;

  let customerId = user.asaasCustomerId;
  if (!customerId) {
    if (!user.cpf) throw new AsaasError("CPF não informado no cadastro.", 400);
    const customer = await createCustomer({
      name: user.name || user.email,
      cpfCnpj: user.cpf,
      email: user.email,
      mobilePhone: user.whatsappPhone,
      externalReference: user.id,
    });
    customerId = customer.id;
    await withServiceMode(() => db.update(users).set({ asaasCustomerId: customerId }).where(eq(users.id, userId)));
  }

  let subscriptionId = user.asaasSubscriptionId;
  if (!subscriptionId) {
    const subscription = await createSubscription({
      customer: customerId,
      value: PLAN_PRICE,
      nextDueDate: todayInSaoPaulo(),
      description: PLAN_NAME,
      externalReference: user.id,
    });
    subscriptionId = subscription.id;
    await withServiceMode(() =>
      db.update(users).set({ asaasSubscriptionId: subscriptionId }).where(eq(users.id, userId))
    );
  }

  const payments = await listSubscriptionPayments(subscriptionId);
  for (const p of payments) {
    await applyAsaasPayment({ ...p, subscription: p.subscription ?? subscriptionId });
  }
}

/**
 * Confere direto no Asaas o status das cobranças em aberto (caso o webhook
 * ainda não tenha chegado — ex.: cliente pagou e clicou "Já paguei").
 */
export async function refreshOpenPayments(userId: string): Promise<void> {
  const open = await withServiceMode(() =>
    db
      .select({ asaasPaymentId: billingPayments.asaasPaymentId })
      .from(billingPayments)
      .where(and(eq(billingPayments.userId, userId), inArray(billingPayments.status, ["PENDING", "OVERDUE"])))
  );
  for (const row of open) {
    const payment = await getPayment(row.asaasPaymentId);
    await applyAsaasPayment(payment);
  }
}

/** Cobrança em aberto mais antiga, com o Pix (QR + copia-e-cola) garantido em cache. */
async function getOpenPaymentWithPix(userId: string): Promise<OpenPayment | null> {
  const [row] = await withServiceMode(() =>
    db
      .select()
      .from(billingPayments)
      .where(and(eq(billingPayments.userId, userId), inArray(billingPayments.status, ["PENDING", "OVERDUE"])))
      .orderBy(asc(billingPayments.dueDate))
      .limit(1)
  );
  if (!row) return null;

  const billingType = normalizeBillingMethod(row.billingType);
  if (billingType === "CREDIT_CARD") {
    // Cobrança do cartão: o Asaas cobra sozinho no vencimento. Se ficou em
    // aberto (cartão recusado), o cliente paga pela fatura do Asaas.
    return {
      id: row.id,
      asaasPaymentId: row.asaasPaymentId,
      dueDate: row.dueDate,
      value: row.value,
      status: row.status,
      billingType,
      pixPayload: null,
      pixQrImage: null,
      invoiceUrl: row.invoiceUrl,
    };
  }

  const expired = row.pixExpiresAt ? row.pixExpiresAt.getTime() < Date.now() : false;
  if (!row.pixPayload || !row.pixQrImage || expired) {
    const pix = await getPixQrCode(row.asaasPaymentId);
    const expiresAt = pix.expirationDate ? new Date(pix.expirationDate.replace(" ", "T") + "-03:00") : null;
    await withServiceMode(() =>
      db
        .update(billingPayments)
        .set({
          pixPayload: pix.payload,
          pixQrImage: pix.encodedImage,
          pixExpiresAt: expiresAt && !isNaN(expiresAt.getTime()) ? expiresAt : null,
          updatedAt: new Date(),
        })
        .where(eq(billingPayments.id, row.id))
    );
    row.pixPayload = pix.payload;
    row.pixQrImage = pix.encodedImage;
  }

  return {
    id: row.id,
    asaasPaymentId: row.asaasPaymentId,
    dueDate: row.dueDate,
    value: row.value,
    status: row.status,
    billingType,
    pixPayload: row.pixPayload,
    pixQrImage: row.pixQrImage,
    invoiceUrl: row.invoiceUrl,
  };
}

function friendlyError(err: unknown): string {
  if (err instanceof AsaasError) {
    if (err.status === 401) return "A integração de pagamento está com a chave de acesso inválida. Avise o suporte.";
    if (err.status === 0) return "A cobrança automática ainda não foi configurada. Avise o suporte.";
    return `Não foi possível gerar o Pix agora (${err.message}). Tente de novo em instantes.`;
  }
  return "Não foi possível falar com o sistema de pagamento agora. Tente de novo em instantes.";
}

/**
 * Tudo que a tela /assinatura precisa, para o usuário já autenticado.
 * Cria a assinatura na primeira visita (logo depois do cadastro).
 */
export async function getBillingOverview(userId: string, opts: { refresh?: boolean } = {}): Promise<BillingOverview> {
  const readUser = () =>
    withServiceMode(() =>
      db
        .select({
          id: users.id,
          name: users.name,
          status: users.status,
          billingEnabled: users.billingEnabled,
          subscriptionDueDate: users.subscriptionDueDate,
          asaasSubscriptionId: users.asaasSubscriptionId,
          billingCanceledAt: users.billingCanceledAt,
          billingMethod: users.billingMethod,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    );

  let [user] = await readUser();
  if (!user) throw new Error("Usuário não encontrado.");

  const configured = isAsaasConfigured();
  let error: string | null = null;
  let openPayment: OpenPayment | null = null;

  // Assinatura cancelada: não cria nem consulta mais nada no Asaas (a
  // assinatura de lá foi apagada); só mostra o histórico.
  if (user.billingEnabled && configured && !user.billingCanceledAt) {
    try {
      if (!user.asaasSubscriptionId) {
        await ensureSubscription(userId);
      } else if (opts.refresh) {
        // voltou do Checkout do cartão (ou o webhook atrasou): adota a
        // assinatura de cartão, se houver uma nova
        await syncCardSubscription(userId);
        await refreshOpenPayments(userId);
        // traz cobranças novas que o webhook ainda não entregou
        await ensureSubscription(userId);
      }
      openPayment = await getOpenPaymentWithPix(userId);
    } catch (err) {
      console.error("[billing] erro ao preparar cobrança:", err);
      error = friendlyError(err);
    }
    [user] = await readUser();
  }

  const history = await withServiceMode(() =>
    db
      .select({
        dueDate: billingPayments.dueDate,
        value: billingPayments.value,
        status: billingPayments.status,
        paidAt: billingPayments.paidAt,
      })
      .from(billingPayments)
      .where(eq(billingPayments.userId, userId))
      .orderBy(asc(billingPayments.dueDate))
  );

  return {
    configured,
    error,
    user: {
      id: user.id,
      name: user.name,
      status: user.status,
      billingEnabled: user.billingEnabled,
      subscriptionDueDate: user.subscriptionDueDate,
      billingCanceledAt: user.billingCanceledAt,
      billingMethod: normalizeBillingMethod(user.billingMethod),
    },
    openPayment: openPayment && isOpenStatus(openPayment.status) ? openPayment : null,
    history: history.reverse(),
  };
}

// ---------------------------------------------------------------------------
// Cartão de crédito recorrente (Checkout do Asaas)
// ---------------------------------------------------------------------------

let cachedLogo: string | null = null;
/** Logo do app em PNG/base64 — o Checkout do Asaas pede uma imagem do item. */
function planImageBase64(): string {
  if (cachedLogo) return cachedLogo;
  try {
    cachedLogo = readFileSync(join(process.cwd(), "public", "icons", "icon-192.png")).toString("base64");
  } catch {
    // PNG 1x1 transparente (não deve acontecer: o arquivo faz parte do app)
    cachedLogo = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  }
  return cachedLogo;
}

export class CardCheckoutError extends Error {}

/**
 * Cria a página de Checkout do Asaas (cartão de crédito recorrente) para o
 * cliente e devolve o endereço para onde mandá-lo. O cartão é digitado na
 * página do Asaas — nunca passa pelo nosso servidor. Serve tanto para quem
 * ainda vai pagar a 1ª mensalidade quanto para quem já paga por Pix e quer
 * trocar (a 1ª cobrança no cartão cai no vencimento que já existe, ver
 * core.ts#cardFirstDueDate).
 */
export async function startCardCheckout(userId: string, origin: string): Promise<string> {
  if (!isAsaasConfigured()) throw new CardCheckoutError("A cobrança automática ainda não foi configurada. Avise o suporte.");
  // garante o cliente no Asaas (e a assinatura Pix, que vira reserva até o cartão ser aprovado)
  await ensureSubscription(userId);

  const [user] = await withServiceMode(() =>
    db
      .select({
        id: users.id,
        status: users.status,
        subscriptionDueDate: users.subscriptionDueDate,
        asaasCustomerId: users.asaasCustomerId,
        billingEnabled: users.billingEnabled,
        billingCanceledAt: users.billingCanceledAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  );
  if (!user || !user.billingEnabled) throw new CardCheckoutError("Esta conta não tem cobrança automática.");
  if (user.billingCanceledAt) throw new CardCheckoutError("Sua assinatura foi cancelada. Para voltar a assinar, fale com o suporte.");
  if (!user.asaasCustomerId) throw new CardCheckoutError("Não foi possível preparar o pagamento agora. Tente de novo em instantes.");

  const firstDue = cardFirstDueDate({
    status: user.status,
    subscriptionDueDate: user.subscriptionDueDate,
    today: todayInSaoPaulo(),
  });
  const base = origin.replace(/\/$/, "");
  const checkout = await createCardCheckout({
    customer: user.asaasCustomerId,
    value: PLAN_PRICE,
    nextDueDateTime: checkoutDueDateTime(firstDue),
    itemName: "App Financeiro",
    itemDescription: "Plano mensal — cobrança automática no cartão de crédito",
    imageBase64: planImageBase64(),
    externalReference: user.id,
    successUrl: `${base}/assinatura?cartao=ok`,
    cancelUrl: `${base}/assinatura?cartao=cancelado`,
    expiredUrl: `${base}/assinatura?cartao=expirado`,
  });
  return checkoutPageUrl(checkout);
}

/**
 * Procura no Asaas uma assinatura de CARTÃO nova do cliente (criada quando
 * ele conclui o Checkout) e, se achar, passa a usá-la: apaga a assinatura
 * anterior no Asaas (Pix ou cartão antigo — apagar remove as cobranças ainda
 * não pagas, então ninguém é cobrado duas vezes), marca essas cobranças como
 * canceladas no espelho local, troca users.asaas_subscription_id e
 * billing_method = 'CREDIT_CARD' e sincroniza as cobranças da nova.
 * Idempotente e com a mesma trava por usuário da criação da assinatura.
 * Devolve true se trocou.
 */
export async function syncCardSubscription(userId: string): Promise<boolean> {
  if (!isAsaasConfigured()) return false;
  let switched = false;
  let newSubscriptionId: string | null = null;
  await withServiceMode(async () => {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${"billing:" + userId}))`);

    const [user] = await withServiceMode(() =>
      db
        .select({
          asaasCustomerId: users.asaasCustomerId,
          asaasSubscriptionId: users.asaasSubscriptionId,
          billingCanceledAt: users.billingCanceledAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    );
    if (!user?.asaasCustomerId || user.billingCanceledAt) return;

    const subscriptions = await listCustomerSubscriptions(user.asaasCustomerId);
    const card = pickCardSubscription(subscriptions, user.asaasSubscriptionId);
    if (!card) return;

    // Todas as outras assinaturas ativas do cliente saem (normalmente só a
    // Pix de antes). A cobrança já PAGA continua no histórico.
    const toRemove = new Set(subscriptions.filter((s) => s.id !== card.id && !s.deleted).map((s) => s.id));
    if (user.asaasSubscriptionId && user.asaasSubscriptionId !== card.id) toRemove.add(user.asaasSubscriptionId);
    const canceledPaymentIds: string[] = [];
    for (const oldId of toRemove) {
      try {
        const oldPayments = await listSubscriptionPayments(oldId);
        canceledPaymentIds.push(...oldPayments.filter((p) => isOpenStatus(p.status)).map((p) => p.id));
      } catch (err) {
        console.error("[billing] não consegui listar as cobranças da assinatura antiga", oldId, err);
      }
      try {
        await deleteSubscription(oldId);
      } catch (err) {
        // 404 = já apagada; qualquer outro erro fica registrado mas não
        // impede a troca (o admin vê as duas no Asaas e pode apagar à mão)
        if (!(err instanceof AsaasError && err.status === 404)) {
          console.error("[billing] não consegui apagar a assinatura antiga", oldId, err);
        }
      }
    }

    await withServiceMode(async () => {
      if (canceledPaymentIds.length > 0) {
        await db
          .update(billingPayments)
          .set({ status: "DELETED", updatedAt: new Date() })
          .where(
            and(
              eq(billingPayments.userId, userId),
              inArray(billingPayments.asaasPaymentId, canceledPaymentIds),
              inArray(billingPayments.status, ["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"])
            )
          );
      }
      await db
        .update(users)
        .set({ asaasSubscriptionId: card.id, billingMethod: "CREDIT_CARD" })
        .where(eq(users.id, userId));
    });
    switched = true;
    newSubscriptionId = card.id;
  });

  if (switched && newSubscriptionId) {
    const payments = await listSubscriptionPayments(newSubscriptionId);
    for (const p of payments) {
      await applyAsaasPayment({ ...p, subscription: p.subscription ?? newSubscriptionId, billingType: p.billingType ?? "CREDIT_CARD" });
    }
    // recalcula mesmo sem cobrança nova (a Pix em aberto saiu do cálculo)
    await withServiceMode(() => recomputeUserBilling(userId));
  }
  return switched;
}

/** Acha o usuário pelo id de cliente do Asaas (webhooks de assinatura/checkout). */
export async function findUserIdByAsaasCustomer(customerId: string): Promise<string | null> {
  const [row] = await withServiceMode(() =>
    db.select({ id: users.id }).from(users).where(eq(users.asaasCustomerId, customerId)).limit(1)
  );
  return row?.id ?? null;
}
