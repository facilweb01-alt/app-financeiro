import Link from "next/link";
import { redirect } from "next/navigation";
import { getRawSession } from "@/lib/dal";
import { logout } from "@/app/actions/auth";
import { getBillingOverview } from "@/lib/billing/service";
import { computeBillingState, PLAN_PRICE, todayInSaoPaulo, isPaidStatus } from "@/lib/billing/core";
import { formatBRL, formatDateBR, formatDateTimeBR } from "@/lib/format";
import { Logo } from "@/components/Logo";
import { CopyPixButton, PaymentWatcher } from "./PixPayment";

// Tela de assinatura/pagamento. Abre para:
// - quem acabou de se cadastrar (aguardando o 1º Pix);
// - quem está com a mensalidade vencida há mais de 3 dias (acesso pausado —
//   verifySession() manda para cá);
// - qualquer cliente com cobrança automática que queira ver o próximo
//   vencimento, pagar adiantado ou ver o histórico.
// Usa getRawSession() (não verifySession()) pelo mesmo motivo de
// /conta-pendente: evitar loop de redirect para quem ainda está bloqueado.

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  OVERDUE: "Vencida",
  RECEIVED: "Paga",
  CONFIRMED: "Paga",
  RECEIVED_IN_CASH: "Paga",
  REFUNDED: "Estornada",
  DELETED: "Cancelada",
};

export default async function AssinaturaPage() {
  const session = await getRawSession();
  if (!session) redirect("/login");
  if (!session.billingEnabled) {
    redirect(session.status === "active" ? "/dashboard" : "/conta-pendente");
  }
  if (session.status === "suspended") redirect("/conta-pendente");

  const overview = await getBillingOverview(session.userId);
  const { user, openPayment, history, error, configured } = overview;
  const state = computeBillingState({
    billingEnabled: true,
    status: user.status,
    subscriptionDueDate: user.subscriptionDueDate,
    today: todayInSaoPaulo(),
  });

  const waiting = user.status === "pending" || state.kind === "blocked";
  const canUseApp = user.status === "active" && state.kind !== "blocked";

  let title: string;
  let subtitle: string;
  if (state.kind === "awaiting_first_payment") {
    title = "Falta só o Pix para liberar seu acesso";
    subtitle = "Pague com o QR Code ou o código copia-e-cola abaixo. A liberação é automática, em poucos segundos.";
  } else if (state.kind === "blocked") {
    title = "Seu acesso está pausado";
    subtitle = `A mensalidade que venceu em ${formatDateBR(state.dueDate!)} ainda está em aberto. Assim que o Pix for pago, tudo volta a funcionar na hora — nenhum dado seu foi perdido.`;
  } else if (state.kind === "overdue") {
    title = "Sua mensalidade venceu";
    subtitle = `Venceu em ${formatDateBR(state.dueDate!)}. Pague até ${formatDateBR(state.blockDate!)} para não ter o acesso pausado.`;
  } else {
    title = "Minha assinatura";
    subtitle = state.dueDate
      ? `Próximo vencimento: ${formatDateBR(state.dueDate)}. O Pix de cada mês aparece aqui e no aviso dentro do app.`
      : "Sua assinatura está em dia.";
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8">
      <div className="mesh-glow -left-24 -top-24 h-72 w-72 bg-blue-600" aria-hidden />
      <div className="mesh-glow -bottom-24 -right-24 h-72 w-72 bg-emerald-500" aria-hidden />

      <div className="relative mx-auto flex w-full max-w-md flex-col gap-5">
        <div className="flex items-center justify-between">
          <Logo size={32} textClassName="text-base" />
          {canUseApp ? (
            <Link href="/dashboard" className="text-sm font-medium text-blue-400 hover:text-blue-300">
              Voltar ao app →
            </Link>
          ) : (
            <form action={logout}>
              <button type="submit" className="text-sm font-medium text-navy-400 hover:text-navy-200">
                Sair
              </button>
            </form>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold text-navy-50">{title}</h1>
          <p className="mt-1.5 text-sm text-navy-300">{subtitle}</p>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-navy-400">Plano</div>
              <div className="font-semibold text-navy-50">App Financeiro — mensal</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold text-navy-50">{formatBRL(PLAN_PRICE)}</div>
              <div className="text-xs text-navy-400">por mês, via Pix</div>
            </div>
          </div>
          {user.subscriptionDueDate && user.status === "active" && (
            <div className="mt-3 border-t border-navy-700/60 pt-3 text-sm text-navy-300">
              {state.kind === "ok" || state.kind === "due_soon"
                ? `Próximo vencimento: ${formatDateBR(user.subscriptionDueDate)}`
                : `Vencimento em aberto: ${formatDateBR(user.subscriptionDueDate)}`}
            </div>
          )}
        </div>

        {!configured && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200">
            A cobrança automática está sendo configurada. Seu cadastro foi recebido — em breve o Pix aparece aqui.
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
        )}

        {openPayment && (
          <div className="glass-card flex flex-col gap-4 rounded-2xl p-5">
            <div className="flex items-baseline justify-between">
              <div className="font-semibold text-navy-50">Pagar com Pix</div>
              <div className="text-sm text-navy-300">
                {formatBRL(openPayment.value)} · vence {formatDateBR(openPayment.dueDate)}
              </div>
            </div>
            {openPayment.pixQrImage && (
              <div className="mx-auto rounded-2xl bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${openPayment.pixQrImage}`}
                  alt="QR Code do Pix"
                  width={220}
                  height={220}
                  className="h-[220px] w-[220px]"
                />
              </div>
            )}
            {openPayment.pixPayload && (
              <>
                <label htmlFor="pix-payload" className="text-xs text-navy-400">
                  Ou copie o código e cole na área Pix do app do seu banco (&quot;Pix copia e cola&quot;):
                </label>
                <textarea
                  id="pix-payload"
                  readOnly
                  value={openPayment.pixPayload}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-navy-700 bg-navy-950 p-3 font-mono text-[11px] text-navy-200"
                />
                <CopyPixButton payload={openPayment.pixPayload} />
              </>
            )}
          </div>
        )}

        {/* Fora dos blocos condicionais de propósito: precisa continuar
            montado quando o Pix some da tela (pago), para detectar a
            mudança "esperando -> pago" e levar a pessoa para o app. */}
        {configured && <PaymentWatcher waiting={waiting} justPaidRedirect="/dashboard" />}

        {!openPayment && !waiting && user.status === "active" && !error && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            ✅ Nenhuma mensalidade em aberto. O Pix do próximo mês aparece aqui alguns dias antes do vencimento.
          </div>
        )}

        {history.length > 0 && (
          <div className="glass-card rounded-2xl p-5">
            <div className="mb-3 font-semibold text-navy-50">Histórico de pagamentos</div>
            <ul className="divide-y divide-navy-800/70 text-sm">
              {history.map((h) => (
                <li key={`${h.dueDate}-${h.status}`} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-navy-100">Vencimento {formatDateBR(h.dueDate)}</div>
                    {h.paidAt && isPaidStatus(h.status) && (
                      <div className="text-xs text-navy-400">Pago em {formatDateTimeBR(h.paidAt)}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-navy-100">{formatBRL(h.value)}</div>
                    <div
                      className={`text-xs ${
                        isPaidStatus(h.status) ? "text-emerald-400" : h.status === "OVERDUE" ? "text-red-400" : "text-navy-400"
                      }`}
                    >
                      {STATUS_LABEL[h.status] ?? h.status}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-center text-xs text-navy-500">
          Pagamento processado pelo Asaas. Dúvidas? Fale com o suporte pelo WhatsApp do app.
        </p>
      </div>
    </div>
  );
}
