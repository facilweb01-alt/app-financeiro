import Link from "next/link";
import { computeBillingState, planInfo, TRIAL_DAYS, todayInSaoPaulo } from "@/lib/billing/core";
import { formatBRL, formatDateBR } from "@/lib/format";

// Aviso de mensalidade no topo do app (só para contas com cobrança
// automática). Pix: aparece REMIND_DAYS dias antes do vencimento, no dia, e
// em vermelho depois de vencido (com a data em que o acesso será pausado).
// Cartão recorrente: não avisa antes (a cobrança é automática); só avisa se
// o cartão foi recusado (mensalidade vencida).

export function BillingBanner({
  billingEnabled,
  status,
  subscriptionDueDate,
  canceledAt = null,
  billingMethod = "PIX",
  trialEndsAt = null,
  billingPlan = "MONTHLY",
}: {
  billingEnabled: boolean;
  status: string;
  subscriptionDueDate: string | null;
  canceledAt?: Date | null;
  billingMethod?: string;
  /** último dia do teste grátis (nulo = conta sem teste) */
  trialEndsAt?: string | null;
  /** 'MONTHLY' ou 'YEARLY' (plano anual) */
  billingPlan?: string;
}) {
  const plan = planInfo(billingPlan);
  const card = billingMethod === "CREDIT_CARD";
  // Plano anual pago no cartão (à vista ou em até 12x): sem cobrança automática; perto do fim pede renovação.
  const installmentPaid = billingMethod === "CARD_INSTALLMENT";
  const state = computeBillingState({ billingEnabled, status, subscriptionDueDate, today: todayInSaoPaulo(), canceledAt, trialEndsAt, billingMethod });
  // Teste grátis em andamento: mostra quantos dias faltam e o caminho para
  // assinar. Nos 2 últimos dias fica em destaque (âmbar).
  if (state.kind === "trial" && trialEndsAt) {
    const left = state.daysUntilDue ?? 0;
    const ending = left <= 1;
    const when = left <= 0 ? "termina hoje" : left === 1 ? "termina amanhã" : `faltam ${left} dias`;
    return (
      <div
        className={`mb-5 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
          ending && !card ? "border-amber-400/40 bg-amber-400/10" : "border-emerald-400/30 bg-emerald-500/10"
        }`}
        role="status"
        data-testid="trial-banner"
      >
        <div className="text-sm">
          <div className={`font-semibold ${ending && !card ? "text-amber-200" : "text-emerald-200"}`}>
            🎁 Teste grátis de {TRIAL_DAYS} dias: {when} ({formatDateBR(trialEndsAt)})
          </div>
          <div className="mt-0.5 text-navy-300">
            {card
              ? `Cartão cadastrado: a 1ª ${plan.chargeName} de ${formatBRL(plan.price)} será cobrada em ${formatDateBR(trialEndsAt)} e o app continua liberado.`
              : `Para continuar depois disso, assine por ${formatBRL(plan.price)} ${plan.per}, no cartão ou no Pix${plan.plan === "MONTHLY" ? ", sem fidelidade" : ""}. Assinando antes você não perde nenhum dia do teste.`}
          </div>
        </div>
        {!card && (
          <Link
            href="/assinatura"
            className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Assinar o Contay
          </Link>
        )}
      </div>
    );
  }
  if (state.kind === "canceled_active" && state.dueDate) {
    return (
      <div className="mb-5 rounded-2xl border border-navy-600 bg-navy-800/60 p-4 text-sm" role="status">
        <div className="font-semibold text-navy-100">Sua assinatura foi cancelada</div>
        <div className="mt-0.5 text-navy-300">
          Você continua com acesso até {formatDateBR(state.dueDate)}. Para voltar a assinar, fale com o suporte.
        </div>
      </div>
    );
  }
  if (state.kind !== "due_soon" && state.kind !== "overdue") return null;
  if (card && state.kind === "due_soon") return null; // o cartão é cobrado sozinho
  if (!state.dueDate || state.daysUntilDue === null) return null;

  const overdue = state.kind === "overdue";
  if (installmentPaid) {
    const ends =
      state.daysUntilDue === 0 ? "termina hoje" : state.daysUntilDue === 1 ? "termina amanhã" : `termina em ${state.daysUntilDue} dias`;
    return (
      <div
        className={`mb-5 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
          overdue ? "border-red-500/40 bg-red-500/10" : "border-amber-400/40 bg-amber-400/10"
        }`}
        role="status"
        data-testid="renovar-anual"
      >
        <div className="text-sm">
          <div className={`font-semibold ${overdue ? "text-red-300" : "text-amber-200"}`}>
            {overdue
              ? `Seu plano anual terminou em ${formatDateBR(state.dueDate)}`
              : `Seu plano anual ${ends} (${formatDateBR(state.dueDate)})`}
          </div>
          <div className="mt-0.5 text-navy-300">
            {overdue && state.blockDate
              ? `Renove até ${formatDateBR(state.blockDate)} para não ter o acesso pausado: no cartão em até 12x ou no Pix.`
              : "Renove por mais um ano no cartão em até 12x ou no Pix e continue sem pausa."}
          </div>
        </div>
        <Link
          href="/assinatura"
          className={`shrink-0 rounded-xl px-4 py-2 text-center text-sm font-semibold text-white ${
            overdue ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          Renovar o plano
        </Link>
      </div>
    );
  }
  const when =
    state.daysUntilDue === 0 ? "vence hoje" : state.daysUntilDue === 1 ? "vence amanhã" : `vence em ${state.daysUntilDue} dias`;

  return (
    <div
      className={`mb-5 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
        overdue ? "border-red-500/40 bg-red-500/10" : "border-amber-400/40 bg-amber-400/10"
      }`}
      role="status"
    >
      <div className="text-sm">
        <div className={`font-semibold ${overdue ? "text-red-300" : "text-amber-200"}`}>
          {overdue && card
            ? `Não conseguimos cobrar a ${plan.chargeName} de ${formatDateBR(state.dueDate)} no seu cartão`
            : overdue
            ? `Sua ${plan.chargeName} venceu em ${formatDateBR(state.dueDate)}`
            : `Sua ${plan.chargeName} de ${formatBRL(plan.price)} ${when} (${formatDateBR(state.dueDate)})`}
        </div>
        <div className="mt-0.5 text-navy-300">
          {overdue && card && state.blockDate
            ? `Pague a fatura ou cadastre outro cartão até ${formatDateBR(state.blockDate)} para não ter o acesso pausado.`
            : overdue && state.blockDate
            ? `Pague o Pix até ${formatDateBR(state.blockDate)} para não ter o acesso pausado. A liberação é automática.`
            : "O Pix já está disponível — pague quando quiser, a confirmação é automática. Se preferir, passe a pagar no cartão."}
        </div>
      </div>
      <Link
        href="/assinatura"
        className={`shrink-0 rounded-xl px-4 py-2 text-center text-sm font-semibold text-white ${
          overdue ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        {card ? "Resolver pagamento" : "Pagar com Pix"}
      </Link>
    </div>
  );
}
