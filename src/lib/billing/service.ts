import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, withServiceMode } from "@/db/client";
import { billingPayments, billingWebhookEvents, users } from "@/db/schema";
import {
  AsaasError,
  createCustomer,
  createSubscription,
  getPayment,
  getPixQrCode,
  isAsaasConfigured,
  listSubscriptionPayments,
  type AsaasPayment,
} from "./asaas";
import { PLAN_NAME, PLAN_PRICE, computeSubscriptionDueDate, isOpenStatus, isPaidStatus, todayInSaoPaulo } from "./core";

// Orquestra a cobrança mensal: cria cliente/assinatura no Asaas, espelha as
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
  };
  openPayment: OpenPayment | null;
  history: { dueDate: string; value: string; status: string; paidAt: Date | null }[];
};

/** Grava/atualiza uma cobrança do Asaas no espelho local e recalcula a conta do dono. */
export async function applyAsaasPayment(payment: AsaasPayment): Promise<{ userId: string | null }> {
  return withServiceMode(async () => {
    // Descobre o dono: pela assinatura, depois pelo cliente, depois pela referência externa.
    const conditions = [
      payment.subscription ? eq(users.asaasSubscriptionId, payment.subscription) : undefined,
      payment.customer ? eq(users.asaasCustomerId, payment.customer) : undefined,
      payment.externalReference ? eq(users.id, payment.externalReference) : undefined,
    ].filter(Boolean);

    let owner: { id: string } | undefined;
    for (const cond of conditions) {
      [owner] = await db.select({ id: users.id }).from(users).where(cond!).limit(1);
      if (owner) break;
    }
    if (!owner) return { userId: null };

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
          updatedAt: values.updatedAt,
        },
      });

    await recomputeUserBilling(owner.id);
    return { userId: owner.id };
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
    .select({ dueDate: billingPayments.dueDate, status: billingPayments.status })
    .from(billingPayments)
    .where(eq(billingPayments.userId, userId));

  const dueDate = computeSubscriptionDueDate(payments);
  const anyPaid = payments.some((p) => isPaidStatus(p.status));

  const [user] = await db
    .select({ status: users.status, approvedAt: users.approvedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return;

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

  if (user.billingEnabled && configured) {
    try {
      if (!user.asaasSubscriptionId) {
        await ensureSubscription(userId);
      } else if (opts.refresh) {
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
    },
    openPayment: openPayment && isOpenStatus(openPayment.status) ? openPayment : null,
    history: history.reverse(),
  };
}
