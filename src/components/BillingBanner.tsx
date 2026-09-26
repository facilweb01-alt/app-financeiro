import Link from "next/link";
import { computeBillingState, PLAN_PRICE, todayInSaoPaulo } from "@/lib/billing/core";
import { formatBRL, formatDateBR } from "@/lib/format";

// Aviso de mensalidade no topo do app (só para contas com cobrança
// automática). Aparece REMIND_DAYS dias antes do vencimento, no dia, e em
// vermelho depois de vencido (com a data em que o acesso será pausado).

export function BillingBanner({
  billingEnabled,
  status,
  subscriptionDueDate,
}: {
  billingEnabled: boolean;
  status: string;
  subscriptionDueDate: string | null;
}) {
  const state = computeBillingState({ billingEnabled, status, subscriptionDueDate, today: todayInSaoPaulo() });
  if (state.kind !== "due_soon" && state.kind !== "overdue") return null;
  if (!state.dueDate || state.daysUntilDue === null) return null;

  const overdue = state.kind === "overdue";
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
          {overdue
            ? `Sua mensalidade venceu em ${formatDateBR(state.dueDate)}`
            : `Sua mensalidade de ${formatBRL(PLAN_PRICE)} ${when} (${formatDateBR(state.dueDate)})`}
        </div>
        <div className="mt-0.5 text-navy-300">
          {overdue && state.blockDate
            ? `Pague o Pix até ${formatDateBR(state.blockDate)} para não ter o acesso pausado. A liberação é automática.`
            : "O Pix já está disponível — pague quando quiser, a confirmação é automática."}
        </div>
      </div>
      <Link
        href="/assinatura"
        className={`shrink-0 rounded-xl px-4 py-2 text-center text-sm font-semibold text-white ${
          overdue ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        Pagar com Pix
      </Link>
    </div>
  );
}
