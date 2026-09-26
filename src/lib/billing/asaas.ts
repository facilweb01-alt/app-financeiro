import "server-only";

// Cliente mínimo da API v3 do Asaas — só o que a cobrança mensal via Pix
// precisa. Documentação: https://docs.asaas.com
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

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
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
    signal: AbortSignal.timeout(20_000),
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
export type AsaasSubscription = { id: string; nextDueDate?: string; status?: string };
export type AsaasPayment = {
  id: string;
  customer: string;
  subscription?: string | null;
  value: number;
  netValue?: number;
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
