import "server-only";

// Cliente mínimo da API v3 do Asaas — só o que a cobrança mensal (Pix ou
// cartão de crédito recorrente) precisa. Documentação: https://docs.asaas.com
//
// Variáveis de ambiente (produção: painel do Render; nunca no código):
// - ASAAS_API_KEY: chave da API (produção começa com $aact_prod_, sandbox
//   com $aact_hmlg_). Sem ela, a cobrança automática fica desligada e o
//   cadastro volta ao fluxo antigo (aprovação manual no painel admin).
// - ASAAS_WEBHOOK_TOKEN: token que o Asaas manda no header
//   "asaas-access-token" de cada webhook (configurado no painel do Asaas).
// - ASAAS_BASE_URL (opcional): sobrescreve a URL da API — usado nos testes
//   automatizados (servidor falso local). Sem ela, a URL é escolhida pelo
//   prefixo da chave (sandbox ou produção).
// - ASAAS_CHECKOUT_BASE_URL (opcional): sobrescreve o endereço da página de
//   Checkout (cartão) — só para os testes automatizados.

export function isAsaasConfigured(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}

function baseUrl(): string {
  if (process.env.ASAAS_BASE_URL) return process.env.ASAAS_BASE_URL.replace(/\/$/, "");
  const key = process.env.ASAAS_API_KEY ?? "";
  return key.startsWith("$aact_hmlg_") ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
}

export class AsaasError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AsaasError";
  }
}

async function request<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new AsaasError("ASAAS_API_KEY não configurada.", 0);

  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      access_token: apiKey,
      "User-Agent": "app-financeiro",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    // o Asaas recomenda timeout de pelo menos 60s em operações com cartão
    signal: AbortSignal.timeout(60_000),
  });

  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }

  if (!res.ok) {
    // Formato de erro do Asaas: { errors: [{ code, description }] }
    const description =
      (json as { errors?: { description?: string }[] })?.errors?.[0]?.description ?? `HTTP ${res.status}`;
    throw new AsaasError(description, res.status, json);
  }
  return json as T;
}

export type AsaasCustomer = { id: string };
export type AsaasSubscription = {
  id: string;
  customer?: string;
  billingType?: string;
  nextDueDate?: string;
  status?: string;
  dateCreated?: string;
  deleted?: boolean;
};
export type AsaasPayment = {
  id: string;
  customer: string;
  subscription?: string | null;
  value: number;
  netValue?: number;
  billingType?: string | null;
  status: string;
  dueDate: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  invoiceUrl?: string | null;
  externalReference?: string | null;
  deleted?: boolean;
};
export type AsaasPixQrCode = { encodedImage: string; payload: string; expirationDate?: string | null };

export function createCustomer(input: {
  name: string;
  cpfCnpj: string;
  email: string;
  mobilePhone?: string | null;
  externalReference: string;
}): Promise<AsaasCustomer> {
  return request("POST", "/customers", {
    ...input,
    // mantém os avisos por e-mail do próprio Asaas (nova cobrança,
    // vencimento) — somam com o aviso que o app mostra dentro dele
    notificationDisabled: false,
  });
}

export function createSubscription(input: {
  customer: string;
  value: number;
  nextDueDate: string;
  description: string;
  externalReference: string;
}): Promise<AsaasSubscription> {
  return request("POST", "/subscriptions", {
    ...input,
    billingType: "PIX",
    cycle: "MONTHLY",
  });
}

export async function listSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]> {
  const res = await request<{ data: AsaasPayment[] }>(
    "GET",
    `/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=100`
  );
  return res.data ?? [];
}

export function getPayment(paymentId: string): Promise<AsaasPayment> {
  return request("GET", `/payments/${encodeURIComponent(paymentId)}`);
}

export function getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
  return request("GET", `/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
}

export function deleteSubscription(subscriptionId: string): Promise<{ deleted: boolean; id: string }> {
  return request("DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

/** Assinaturas ativas de um cliente (usado para achar a de cartão criada pelo Checkout). */
export async function listCustomerSubscriptions(customerId: string): Promise<AsaasSubscription[]> {
  const res = await request<{ data: AsaasSubscription[] }>(
    "GET",
    `/subscriptions?customer=${encodeURIComponent(customerId)}&status=ACTIVE&limit=100`
  );
  return res.data ?? [];
}

export type AsaasCheckout = { id: string; link?: string | null; url?: string | null };

/**
 * Cria uma página de Checkout do Asaas para assinatura com cartão de crédito
 * recorrente. O cliente digita o cartão NA PÁGINA DO ASAAS (os dados do
 * cartão nunca passam pelo nosso servidor); ao concluir, o Asaas cria uma
 * assinatura nova (billingType CREDIT_CARD) para o mesmo cliente, e o app
 * adota essa assinatura (ver service.ts#syncCardSubscription).
 * Docs: "Checkout com Assinatura (recorrente)" — POST /v3/checkouts.
 */
export function createCardCheckout(input: {
  customer: string;
  value: number;
  /** primeira cobrança no cartão, "YYYY-MM-DD HH:mm:ss" (ver core.ts#checkoutDueDateTime) */
  nextDueDateTime: string;
  itemName: string;
  itemDescription: string;
  imageBase64: string;
  externalReference: string;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
}): Promise<AsaasCheckout> {
  return request("POST", "/checkouts", {
    billingTypes: ["CREDIT_CARD"],
    chargeTypes: ["RECURRENT"],
    minutesToExpire: 60,
    externalReference: input.externalReference,
    customer: input.customer,
    callback: {
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiredUrl: input.expiredUrl,
    },
    items: [
      {
        name: input.itemName,
        description: input.itemDescription,
        quantity: 1,
        value: input.value,
        imageBase64: input.imageBase64,
      },
    ],
    subscription: {
      cycle: "MONTHLY",
      nextDueDate: input.nextDueDateTime,
    },
  });
}

/** Endereço da página do Checkout para mandar o cliente. */
export function checkoutPageUrl(checkout: AsaasCheckout): string {
  if (checkout.link) return checkout.link;
  if (checkout.url) return checkout.url;
  const base =
    process.env.ASAAS_CHECKOUT_BASE_URL?.replace(/\/$/, "") ??
    ((process.env.ASAAS_API_KEY ?? "").startsWith("$aact_hmlg_") ? "https://sandbox.asaas.com" : "https://asaas.com");
  return `${base}/checkoutSession/show?id=${encodeURIComponent(checkout.id)}`;
}

export type AsaasBillingAddress = {
  postalCode: string; // só dígitos (8)
  address: string; // rua
  addressNumber: string;
  complement?: string | null;
  province: string; // bairro
};

/**
 * Grava o endereço de cobrança no cliente do Asaas. O Checkout de cartão
 * recusa cliente sem endereço ("O campo address deve existir para o customer
 * informado") — descoberto no 1º teste real no sandbox (28/09/2026).
 */
export function updateCustomerAddress(customerId: string, addr: AsaasBillingAddress): Promise<AsaasCustomer> {
  return request("POST", `/customers/${encodeURIComponent(customerId)}`, {
    postalCode: addr.postalCode,
    address: addr.address,
    addressNumber: addr.addressNumber,
    complement: addr.complement || undefined,
    province: addr.province,
  });
}
