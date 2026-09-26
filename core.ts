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
export const PLAN_NAME = "App Financeiro — plano mensal";
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
 * (anchorDay). Ex.: pago o de 28/02 de um contrato do dia 31 → 31/03.
 */
export function nextCycleDate(paidDueDate: string, anchorDay: number): string {
  const next = addMonthsClamped(paidDueDate.slice(0, 8) + "01", 1); // 1º dia do mês seguinte
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
export function computeSubscriptionDueDate(payments: PaymentLike[]): string | null {
  if (payments.length === 0) return null;
  const open = payments.filter((p) => isOpenStatus(p.status)).map((p) => p.dueDate).sort();
  if (open.length > 0) return open[0];
  const all = payments.map((p) => p.dueDate).sort();
  const anchorDay = Number(all[0].slice(8, 10));
  const paid = payments.filter((p) => isPaidStatus(p.status)).map((p) => p.dueDate).sort();
  if (paid.length === 0) return null; // só cobranças canceladas/estornadas
  return nextCycleDate(paid[paid.length - 1], anchorDay);
}

export type BillingStateKind =
  | "exempt" // conta sem cobrança automática (clientes antigos, admin)
  | "awaiting_first_payment" // cadastro feito, primeiro Pix ainda não pago
  | "ok" // em dia, vencimento longe
  | "due_soon" // vence em até REMIND_DAYS dias
  | "overdue" // venceu, dentro da tolerância — ainda usa o app, com aviso
  | "blocked"; // venceu há mais de GRACE_DAYS dias — só a tela de pagamento abre

export type BillingState = {
  kind: BillingStateKind;
  dueDate: string | null;
  /** positivo = faltam N dias; negativo = venceu há N dias */
  daysUntilDue: number | null;
  /** a partir de quando o acesso é bloqueado (só faz sentido se houver vencimento) */
  blockDate: string | null;
};

export function computeBillingState(input: {
  billingEnabled: boolean;
  status: string;
  subscriptionDueDate: string | null;
  today: string;
}): BillingState {
  const { billingEnabled, status, subscriptionDueDate, today } = input;
  if (!billingEnabled) {
    return { kind: "exempt", dueDate: subscriptionDueDate, daysUntilDue: null, blockDate: null };
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
