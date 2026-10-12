// Regras de negócio PURAS da cobrança mensal via Pix (sem banco, sem rede) —
// testadas em src/lib/business/__tests__/run-tests.ts.
//
// Modelo:
// - Quem se cadastra pela página de vendas nasce com billingEnabled = true e
//   status 'pending'. O primeiro Pix vence no próprio dia do cadastro; ao ser
//   pago (webhook do Asaas), a conta vira 'active'.
// - A cobrança se repete todo mês no mesmo dia do cadastro ("dia de
//   aniversário"). Em meses mais curtos o dia gruda no último dia do mês
//   (ex.: contratou dia 31 → vence 28/02 ou 29/02, e volta a 31/03).
// - users.subscriptionDueDate guarda o "próximo vencimento que importa": o
//   vencimento mais antigo ainda não pago; se tudo estiver pago, o próximo
//   ciclo previsto.
// - Passou do vencimento sem pagar → aviso. Passou GRACE_DAYS dias → acesso
//   bloqueado (só a tela de pagamento abre) até o Pix ser pago. Pagou →
//   libera na hora, sem ninguém precisar fazer nada.

import { addMonthsClamped } from "@/lib/business/dates";

export const PLAN_PRICE = 29.9;
export const PLAN_NAME = "Contay — plano mensal";

// Plano anual (pedido do Marcelo em 11/10/2026): 12 mensalidades com 15% de
// desconto, cobradas de uma vez, uma vez por ano. Os valores saem sempre de
// planInfo() para a tela, a cobrança e os textos nunca divergirem.
export const ANNUAL_DISCOUNT_PERCENT = 15;
export const PLAN_PRICE_YEARLY = Math.round(PLAN_PRICE * 12 * (100 - ANNUAL_DISCOUNT_PERCENT)) / 100; // 304,98
export const PLAN_NAME_YEARLY = "Contay — plano anual";

export type BillingPlan = "MONTHLY" | "YEARLY";

export function normalizeBillingPlan(value: string | null | undefined): BillingPlan {
  return value === "YEARLY" ? "YEARLY" : "MONTHLY";
}

export type PlanInfo = {
  plan: BillingPlan;
  /** valor de cada cobrança */
  price: number;
  /** ciclo no Asaas */
  cycle: "MONTHLY" | "YEARLY";
  /** meses entre uma cobrança e a seguinte */
  months: 1 | 12;
  name: string;
  /** "mensalidade" | "anuidade" */
  chargeName: string;
  /** "por mês" | "por ano" */
  per: string;
  /** "todo mês" | "todo ano" */
  every: string;
  /** quanto sai por mês (no anual, o valor dividido por 12) */
  monthlyEquivalent: number;
  /** economia em um ano em relação a 12 mensalidades (0 no mensal) */
  yearlySavings: number;
};

export function planInfo(plan: string | null | undefined): PlanInfo {
  if (normalizeBillingPlan(plan) === "YEARLY") {
    return {
      plan: "YEARLY",
      price: PLAN_PRICE_YEARLY,
      cycle: "YEARLY",
      months: 12,
      name: PLAN_NAME_YEARLY,
      chargeName: "anuidade",
      per: "por ano",
      every: "todo ano",
      monthlyEquivalent: Math.round((PLAN_PRICE_YEARLY / 12) * 100) / 100,
      yearlySavings: Math.round((PLAN_PRICE * 12 - PLAN_PRICE_YEARLY) * 100) / 100,
    };
  }
  return {
    plan: "MONTHLY",
    price: PLAN_PRICE,
    cycle: "MONTHLY",
    months: 1,
    name: PLAN_NAME,
    chargeName: "mensalidade",
    per: "por mês",
    every: "todo mês",
    monthlyEquivalent: PLAN_PRICE,
    yearlySavings: 0,
  };
}

/**
 * Plano de uma assinatura que veio do Asaas (ex.: a de cartão criada pelo
 * Checkout): vale o ciclo informado; sem ciclo, decide pelo valor.
 */
export function planFromSubscription(sub: { cycle?: string | null; value?: number | null }): BillingPlan {
  if (sub.cycle === "YEARLY") return "YEARLY";
  if (sub.cycle === "MONTHLY") return "MONTHLY";
  return typeof sub.value === "number" && sub.value > PLAN_PRICE * 6 ? "YEARLY" : "MONTHLY";
}
// Teste grátis (pedido do Marcelo em 11/10/2026): quem se cadastra pela
// página de vendas usa o app por TRIAL_DAYS dias sem pagar nada e sem
// informar cartão. O cadastro grava users.trial_ends_at = dia do cadastro +
// TRIAL_DAYS; a conta continua 'pending' ("nunca pagou") e o acesso vale até
// o fim desse dia. Pagou em qualquer momento → vira 'active', como sempre.
// Não pagou → no dia seguinte só a tela de pagamento abre (nenhum dado é
// apagado). Contas sem trial_ends_at (cadastros anteriores) seguem a regra
// antiga: só entram depois do 1º pagamento.
export const TRIAL_DAYS = 7;
export const GRACE_DAYS = 3; // dias de tolerância depois do vencimento
export const REMIND_DAYS = 5; // começa a avisar no app X dias antes de vencer

/** Status de cobrança do Asaas que contam como "pago". */
const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
/** Status que ainda esperam pagamento. */
const OPEN_STATUSES = new Set(["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"]);

export function isPaidStatus(status: string): boolean {
  return PAID_STATUSES.has(status);
}

export function isOpenStatus(status: string): boolean {
  return OPEN_STATUSES.has(status);
}

/** Data de hoje ("YYYY-MM-DD") no fuso de São Paulo — o servidor roda em UTC. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Diferença em dias inteiros entre duas datas "YYYY-MM-DD" (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Próximo vencimento depois de um ciclo pago, respeitando o dia do contrato
 * (anchorDay). Ex.: pago o de 28/02 de um contrato do dia 31 → 31/03. No
 * plano anual (months = 12): pago o de 18/10/2026 → 18/10/2027.
 */
export function nextCycleDate(paidDueDate: string, anchorDay: number, months: number = 1): string {
  const next = addMonthsClamped(paidDueDate.slice(0, 8) + "01", months); // 1º dia do mês do próximo ciclo
  const [y, m] = next.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDay);
  return `${next.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

export type PaymentLike = { dueDate: string; status: string };

/**
 * Calcula o "próximo vencimento que importa" a partir das cobranças
 * conhecidas: o mais antigo em aberto; se não houver nenhum em aberto, o
 * ciclo seguinte ao último pago; sem nenhuma cobrança, null.
 */
export function computeSubscriptionDueDate(
  payments: PaymentLike[],
  opts: {
    /**
     * 1º vencimento da assinatura ATUAL (ex.: a de cartão depois de trocar de
     * Pix para cartão) — define o "dia do contrato" dos próximos ciclos.
     * Sem ele, vale o vencimento mais antigo de todos.
     */
    anchorDate?: string | null;
    /** Meses entre uma cobrança e a seguinte: 1 no plano mensal (padrão), 12 no anual. */
    cycleMonths?: number;
  } = {}
): string | null {
  if (payments.length === 0) return null;
  const open = payments.filter((p) => isOpenStatus(p.status)).map((p) => p.dueDate).sort();
  if (open.length > 0) return open[0];
  const all = payments.map((p) => p.dueDate).sort();
  const anchorDay = Number((opts.anchorDate ?? all[0]).slice(8, 10));
  const paid = payments.filter((p) => isPaidStatus(p.status)).map((p) => p.dueDate).sort();
  if (paid.length === 0) return null; // só cobranças canceladas/estornadas
  return nextCycleDate(paid[paid.length - 1], anchorDay, opts.cycleMonths ?? 1);
}

export type BillingStateKind =
  | "exempt" // conta sem cobrança automática (clientes antigos, admin)
  | "trial" // teste grátis em andamento: usa o app sem ter pago
  | "awaiting_first_payment" // sem teste (ou teste encerrado) e 1ª mensalidade ainda não paga
  | "ok" // em dia, vencimento longe
  | "due_soon" // vence em até REMIND_DAYS dias
  | "overdue" // venceu, dentro da tolerância — ainda usa o app, com aviso
  | "blocked" // venceu há mais de GRACE_DAYS dias — só a tela de pagamento abre
  | "canceled_active" // assinatura cancelada, mas ainda dentro do período já pago
  | "canceled"; // assinatura cancelada e período pago encerrado — acesso encerrado

export type BillingState = {
  kind: BillingStateKind;
  dueDate: string | null;
  /** positivo = faltam N dias; negativo = venceu há N dias */
  daysUntilDue: number | null;
  /** a partir de quando o acesso é bloqueado (só faz sentido se houver vencimento) */
  blockDate: string | null;
  /** true quando a conta teve teste grátis e ele já terminou sem pagamento */
  trialEnded?: boolean;
};

/** Último dia do teste grátis de quem se cadastra em `signupDate` ("YYYY-MM-DD"). */
export function trialEndDate(signupDate: string): string {
  return addDays(signupDate, TRIAL_DAYS);
}

/**
 * Até que dia (inclusive) a conta em teste entra no app. Normalmente é o
 * último dia do teste. Quem já deixou o cartão cadastrado durante o teste
 * (a 1ª cobrança cai no último dia) ganha a mesma tolerância de GRACE_DAYS
 * de qualquer mensalidade, para não ficar de fora enquanto a operadora
 * confirma a cobrança.
 */
export function trialAccessLimit(trialEndsAt: string, billingMethod?: string | null): string {
  return normalizeBillingMethod(billingMethod) === "CREDIT_CARD" ? addDays(trialEndsAt, GRACE_DAYS) : trialEndsAt;
}

/** Vencimento da 1ª cobrança Pix: no fim do teste se ele ainda está valendo; senão, hoje. */
export function firstPixDueDate(input: { trialEndsAt?: string | null; today: string }): string {
  return input.trialEndsAt && input.trialEndsAt >= input.today ? input.trialEndsAt : input.today;
}

export function computeBillingState(input: {
  billingEnabled: boolean;
  status: string;
  subscriptionDueDate: string | null;
  today: string;
  /** assinatura cancelada pelo admin (users.billing_canceled_at) */
  canceledAt?: Date | string | null;
  /** último dia do teste grátis (users.trial_ends_at); nulo = conta sem teste */
  trialEndsAt?: string | null;
  /** 'PIX' ou 'CREDIT_CARD' (users.billing_method) */
  billingMethod?: string | null;
}): BillingState {
  const { billingEnabled, status, subscriptionDueDate, today } = input;
  if (!billingEnabled) {
    return { kind: "exempt", dueDate: subscriptionDueDate, daysUntilDue: null, blockDate: null };
  }
  if (input.canceledAt) {
    // Cancelada: usa até o fim do período já pago (o vencimento seguinte) e
    // o acesso termina NESSE dia. Sem nenhum pagamento, termina na hora.
    const daysUntilDue = subscriptionDueDate ? daysBetween(today, subscriptionDueDate) : null;
    const active = status === "active" && daysUntilDue !== null && daysUntilDue > 0;
    return {
      kind: active ? "canceled_active" : "canceled",
      dueDate: subscriptionDueDate,
      daysUntilDue,
      blockDate: subscriptionDueDate,
    };
  }
  if (status === "pending" && input.trialEndsAt) {
    const limit = trialAccessLimit(input.trialEndsAt, input.billingMethod);
    const daysUntilDue = daysBetween(today, input.trialEndsAt);
    if (today <= limit) {
      return { kind: "trial", dueDate: input.trialEndsAt, daysUntilDue, blockDate: addDays(limit, 1) };
    }
    return { kind: "awaiting_first_payment", dueDate: subscriptionDueDate, daysUntilDue, blockDate: null, trialEnded: true };
  }
  if (status === "pending") {
    return {
      kind: "awaiting_first_payment",
      dueDate: subscriptionDueDate,
      daysUntilDue: subscriptionDueDate ? daysBetween(today, subscriptionDueDate) : null,
      blockDate: null,
    };
  }
  if (!subscriptionDueDate) {
    return { kind: "ok", dueDate: null, daysUntilDue: null, blockDate: null };
  }
  const daysUntilDue = daysBetween(today, subscriptionDueDate);
  const blockDate = addDays(subscriptionDueDate, GRACE_DAYS + 1);
  let kind: BillingStateKind;
  if (daysUntilDue < -GRACE_DAYS) kind = "blocked";
  else if (daysUntilDue < 0) kind = "overdue";
  else if (daysUntilDue <= REMIND_DAYS) kind = "due_soon";
  else kind = "ok";
  return { kind, dueDate: subscriptionDueDate, daysUntilDue, blockDate };
}

// --- Cartão de crédito recorrente (Checkout do Asaas) ----------------------

export type BillingMethod = "PIX" | "CREDIT_CARD";

export function normalizeBillingMethod(value: string | null | undefined): BillingMethod {
  return value === "CREDIT_CARD" ? "CREDIT_CARD" : "PIX";
}

/**
 * Data da 1ª cobrança no cartão quando o cliente troca (ou começa) pelo
 * cartão. Regra: ninguém paga duas vezes pelo mesmo mês e ninguém ganha mês
 * de graça.
 * - Ainda não pagou nada (conta 'pending'): cobra hoje; se o teste grátis
 *   ainda está valendo, cobra no último dia do teste.
 * - Já tem um vencimento futuro (em dia, pago até lá, ou com a mensalidade
 *   do mês gerada mas ainda não vencida): a 1ª cobrança do cartão é nesse
 *   mesmo dia — a assinatura Pix antiga é apagada junto com a cobrança
 *   em aberto.
 * - Vencido (ou sem vencimento): cobra hoje.
 */
export function cardFirstDueDate(input: {
  status: string;
  subscriptionDueDate: string | null;
  today: string;
  /** último dia do teste grátis, se a conta tem teste */
  trialEndsAt?: string | null;
}): string {
  const { status, subscriptionDueDate, today } = input;
  // Em teste grátis: o cartão fica cadastrado e a 1ª cobrança só acontece no
  // último dia do teste (ninguém perde dia de teste por cadastrar o cartão antes).
  if (status === "pending") return firstPixDueDate({ trialEndsAt: input.trialEndsAt, today });
  if (!subscriptionDueDate) return today;
  return subscriptionDueDate > today ? subscriptionDueDate : today;
}

/**
 * Converte a data da 1ª cobrança para o formato que o Checkout do Asaas pede
 * ("YYYY-MM-DD HH:mm:ss", horário de Brasília). Para hoje, usa o horário
 * atual + 10 min (uma data/hora no passado seria recusada); para dias
 * futuros, meio-dia.
 */
export function checkoutDueDateTime(date: string, now: Date = new Date()): string {
  if (date !== todayInSaoPaulo(now)) return `${date} 12:00:00`;
  const later = new Date(now.getTime() + 10 * 60_000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(later);
  // passou da meia-noite com os 10 min? fica no último segundo do dia
  if (todayInSaoPaulo(later) !== date) return `${date} 23:59:59`;
  return `${date} ${parts}`;
}

/**
 * Escolhe, entre as assinaturas ATIVAS do cliente no Asaas, a de cartão que
 * o app deve adotar: a mais recente com billingType CREDIT_CARD que ainda
 * não é a atual. Null quando não há nada para trocar.
 */
export function pickCardSubscription<T extends { id: string; billingType?: string; dateCreated?: string; deleted?: boolean; status?: string }>(
  subscriptions: T[],
  currentSubscriptionId: string | null
): T | null {
  const cards = subscriptions
    .filter((s) => s.billingType === "CREDIT_CARD" && !s.deleted && (s.status ?? "ACTIVE") === "ACTIVE")
    // o Asaas informa só a DATA de criação: no empate (mesmo dia), a que não
    // é a atual é a mais nova (a atual já existia antes do novo Checkout)
    .sort(
      (a, b) =>
        (b.dateCreated ?? "").localeCompare(a.dateCreated ?? "") ||
        (a.id === currentSubscriptionId ? 1 : 0) - (b.id === currentSubscriptionId ? 1 : 0)
    );
  const newest = cards[0];
  if (!newest || newest.id === currentSubscriptionId) return null;
  return newest;
}

/**
 * Valida o endereço de cobrança pedido antes do Checkout do cartão (o Asaas
 * exige endereço no cliente para cobrar no cartão). Devolve os campos limpos
 * ou a mensagem de erro para mostrar ao cliente.
 */
export function validateBillingAddress(input: {
  postalCode?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  province?: string | null;
}):
  | { ok: true; data: { postalCode: string; address: string; addressNumber: string; complement: string | null; province: string } }
  | { ok: false; error: string } {
  const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
  const postalCode = onlyDigits(input.postalCode ?? "");
  const address = clean(input.address);
  const addressNumber = clean(input.addressNumber);
  const complement = clean(input.complement);
  const province = clean(input.province);
  if (postalCode.length !== 8) return { ok: false, error: "Informe o CEP com 8 números." };
  if (address.length < 3) return { ok: false, error: "Informe a rua do endereço de cobrança." };
  if (!addressNumber) return { ok: false, error: "Informe o número (ou S/N)." };
  if (province.length < 2) return { ok: false, error: "Informe o bairro." };
  if (address.length > 120 || addressNumber.length > 20 || complement.length > 60 || province.length > 80) {
    return { ok: false, error: "Endereço muito longo — confira os campos." };
  }
  return { ok: true, data: { postalCode, address, addressNumber, complement: complement || null, province } };
}

/** Só dígitos. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Valida CPF pelos dígitos verificadores (o Asaas exige CPF válido para emitir o Pix). */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

/**
 * Normaliza o WhatsApp informado no cadastro para o formato guardado em
 * users.whatsappPhone: só dígitos, com DDD, sem o 55 do país (o webhook do
 * WhatsApp já compara todas as variações — ver
 * src/app/api/whatsapp/lancamento/route.ts#phoneCandidates). Aceita o
 * número digitado com ou sem +55, parênteses, espaços e traço.
 */
export function normalizeSignupPhone(value: string): string | null {
  let d = onlyDigits(value);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d;
  return null;
}

/**
 * Todas as formas plausíveis de um mesmo celular brasileiro: com/sem o 55
 * (DDI) e com/sem o "9" do celular. Usado para achar o dono de uma mensagem
 * de WhatsApp (o Z-API manda "55"+DDD+8 dígitos) e para impedir que o mesmo
 * número fique em duas contas, seja qual for o formato em que foi salvo.
 */
export function whatsappPhoneVariants(value: string): string[] {
  const raw = onlyDigits(value);
  const out = new Set<string>();
  if (!raw) return [];
  out.add(raw);
  let d = raw;
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  const local = new Set<string>([d]);
  if (d.length === 10) local.add(d.slice(0, 2) + "9" + d.slice(2));
  else if (d.length === 11 && d[2] === "9") local.add(d.slice(0, 2) + d.slice(3));
  for (const l of local) {
    out.add(l);
    out.add("55" + l);
  }
  return Array.from(out);
}

/**
 * A conta pode usar o app agora? Regra única para as páginas, as Server
 * Actions (src/lib/dal.ts) e o lançamento pelo WhatsApp: conta ativa e não
 * bloqueada por atraso/cancelamento, ou conta em teste grátis ainda valendo.
 */
export function hasAppAccess(input: {
  billingEnabled: boolean;
  status: string;
  subscriptionDueDate: string | null;
  today: string;
  canceledAt?: Date | string | null;
  trialEndsAt?: string | null;
  billingMethod?: string | null;
}): boolean {
  if (input.status === "suspended") return false;
  const kind = computeBillingState(input).kind;
  if (kind === "trial") return true;
  if (input.status !== "active") return false;
  return kind !== "blocked" && kind !== "canceled";
}
