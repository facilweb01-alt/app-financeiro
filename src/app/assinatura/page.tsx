import Link from "next/link";
import { after } from "next/server";
import { processPendingWelcomesSafely } from "@/lib/whatsapp/welcome";
import { redirect } from "next/navigation";
import { getRawSession } from "@/lib/dal";
import { logout } from "@/app/actions/auth";
import { getBillingOverview } from "@/lib/billing/service";
import { ANNUAL_DISCOUNT_PERCENT, cardFirstDueDate, computeBillingState, planInfo, TRIAL_DAYS, todayInSaoPaulo, isPaidStatus } from "@/lib/billing/core";
import { formatBRL, formatDateBR, formatDateTimeBR } from "@/lib/format";
import { Logo } from "@/components/Logo";
import { CardCheckoutButton, CopyPixButton, CpfForm, PaymentWatcher, PlanChooser } from "./PixPayment";
import { MetaPixel, type MetaEventSpec } from "@/components/tracking/MetaPixel";
import { metaPixelId } from "@/lib/metaPixelId";
import { WHATSAPP_BOT_DISPLAY, whatsappSupportLink } from "@/lib/whatsappBot";

// Nome de quem recebe o Pix, para a pessoa reconhecer no app do banco.
// Só aparece com a variável COBRANCA_RECEBEDOR (ex.: "M.F Martins Sistema · Contay"),
// ligada depois que a conta do Asaas passar para o CNPJ.
function pixReceiver(): string | null {
  const v = process.env.COBRANCA_RECEBEDOR?.trim();
  return v ? v.slice(0, 120) : null;
}

// Tela de assinatura/pagamento. Abre para:
// - quem está no teste grátis de 7 dias e quer assinar (o link chega pelo
//   WhatsApp na véspera e no último dia do teste);
// - quem terminou o teste sem pagar, ou se cadastrou antes de existir teste
//   (aguardando a 1ª mensalidade);
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

const CARD_RETURN: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: {
    tone: "ok",
    text: "Cartão recebido! Estamos confirmando com a operadora — em alguns segundos ele aparece aqui como sua forma de pagamento. Se demorar, atualize a página.",
  },
  cancelado: { tone: "warn", text: "Você saiu da página do cartão sem concluir. Nada foi cobrado." },
  expirado: { tone: "warn", text: "A página do cartão expirou. Clique de novo em pagar com cartão para abrir outra." },
};

export default async function AssinaturaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const cartaoParam = typeof params.cartao === "string" ? params.cartao : undefined;
  const cardReturn = cartaoParam ? CARD_RETURN[cartaoParam] : undefined;
  const session = await getRawSession();
  if (!session) redirect("/login");
  if (!session.billingEnabled) {
    redirect(session.status === "active" ? "/dashboard" : "/conta-pendente");
  }
  if (session.status === "suspended") redirect("/conta-pendente");

  // Voltou do Checkout do cartão: confere direto no Asaas (o webhook pode atrasar).
  const overview = await getBillingOverview(session.userId, { refresh: cartaoParam === "ok" });
  // Se o cartão acabou de liberar a conta, manda as boas-vindas pelo WhatsApp.
  if (cartaoParam === "ok") after(processPendingWelcomesSafely);
  const { user, openPayment, history, error, configured, needsCpf } = overview;
  // Plano escolhido (mensal ou anual): define valor, nome da cobrança e ciclo em todos os textos.
  const plan = planInfo(user.billingPlan);
  const yearly = planInfo("YEARLY");
  const monthly = planInfo("MONTHLY");
  const state = computeBillingState({
    billingEnabled: true,
    status: user.status,
    subscriptionDueDate: user.subscriptionDueDate,
    today: todayInSaoPaulo(),
    canceledAt: user.billingCanceledAt,
    trialEndsAt: user.trialEndsAt,
    billingMethod: user.billingMethod,
  });
  // Teste grátis: em andamento (usa o app sem ter pago) ou já encerrado.
  const inTrial = state.kind === "trial";
  const trialEnded = state.kind === "awaiting_first_payment" && Boolean(state.trialEnded);
  const trialEnd = user.trialEndsAt;
  const canceled = state.kind === "canceled" || state.kind === "canceled_active";
  const card = user.billingMethod === "CREDIT_CARD";
  const cardDeclined = card && openPayment?.billingType === "CREDIT_CARD" && openPayment.status === "OVERDUE";
  const today = todayInSaoPaulo();
  const cardFirstDue = cardFirstDueDate({ status: user.status, subscriptionDueDate: user.subscriptionDueDate, today, trialEndsAt: user.trialEndsAt });

  const waiting = !canceled && (user.status === "pending" || state.kind === "blocked");
  const canUseApp = inTrial || (user.status === "active" && state.kind !== "blocked" && state.kind !== "canceled");

  // Medição de anúncios (só para quem aceitou os cookies na página de
  // vendas): cadastro concluído e 1ª assinatura paga. Sem dado da pessoa.
  const pixelId = metaPixelId();
  const receiver = pixReceiver();
  const purchase = { value: plan.price, currency: "BRL" };
  const firstPayment = history.filter((h) => isPaidStatus(h.status)).length <= 1;
  const pixelEvents: MetaEventSpec[] = [{ name: "CompleteRegistration", cookieFlag: "contay_reg" }];
  // "Começou a pagar" (copiou o Pix ou seguiu para o cartão): só enquanto a
  // pessoa ainda espera a 1ª mensalidade.
  const checkoutPixel = pixelId && user.status === "pending" ? { pixelId, ...purchase } : null;
  const firstPaymentPending = user.status === "pending" && !canceled;
  const showPixBlock = Boolean(openPayment && openPayment.billingType !== "CREDIT_CARD");
  const showCardBlock = configured && !card && !canceled && !error && !needsCpf;
  // Voltou do Checkout do cartão já com a conta liberada (no Pix, quem avisa
  // é o PaymentWatcher, na hora em que o pagamento cai).
  if (cartaoParam === "ok" && user.status === "active" && firstPayment) {
    pixelEvents.push({ name: "Purchase", params: purchase, onceKey: "compra" });
  }

  let title: string;
  let subtitle: string;
  if (state.kind === "canceled") {
    title = "Assinatura cancelada";
    subtitle = state.dueDate
      ? `Seu acesso ao Contay terminou em ${formatDateBR(state.dueDate)}. Seus dados continuam guardados — para voltar a usar, fale com o suporte.`
      : "Sua assinatura foi cancelada. Seus dados continuam guardados — para voltar a usar, fale com o suporte.";
  } else if (state.kind === "canceled_active") {
    title = "Assinatura cancelada";
    subtitle = `Não haverá novas cobranças. Você continua com acesso até ${formatDateBR(state.dueDate!)}.`;
  } else if (inTrial && trialEnd) {
    title = `Seu teste grátis vai até ${formatDateBR(trialEnd)}`;
    subtitle = card
      ? `Cartão cadastrado: a 1ª ${plan.chargeName} de ${formatBRL(plan.price)} será cobrada em ${formatDateBR(trialEnd)} e o app continua liberado, sem interrupção.`
      : `Para continuar depois do teste, assine por ${formatBRL(plan.price)} ${plan.per}. Assinando agora você não perde nenhum dia: a ${plan.chargeName} só começa a contar em ${formatDateBR(trialEnd)}.`;
  } else if (trialEnded) {
    title = "Seu teste grátis terminou";
    subtitle = card
      ? "Estamos aguardando a confirmação da cobrança no cartão. A liberação é automática."
      : "Seus lançamentos, cartões e contas estão guardados. Assine com cartão de crédito ou Pix e tudo volta a funcionar na hora.";
  } else if (state.kind === "awaiting_first_payment") {
    title = "Falta só o pagamento para liberar seu acesso";
    subtitle = card
      ? "Estamos aguardando a confirmação do cartão. A liberação é automática, em poucos segundos."
      : "Pague com cartão de crédito ou com Pix. A liberação é automática, em poucos segundos.";
  } else if (state.kind === "blocked") {
    title = "Seu acesso está pausado";
    subtitle = cardDeclined
      ? `Não conseguimos cobrar no seu cartão a ${plan.chargeName} que venceu em ${formatDateBR(state.dueDate!)}. Pague a fatura ou use outro cartão — tudo volta a funcionar na hora, nenhum dado seu foi perdido.`
      : `A ${plan.chargeName} que venceu em ${formatDateBR(state.dueDate!)} ainda está em aberto. Assim que for paga, tudo volta a funcionar na hora — nenhum dado seu foi perdido.`;
  } else if (state.kind === "overdue") {
    title = cardDeclined ? "Não conseguimos cobrar no seu cartão" : `Sua ${plan.chargeName} venceu`;
    subtitle = `Venceu em ${formatDateBR(state.dueDate!)}. Pague até ${formatDateBR(state.blockDate!)} para não ter o acesso pausado.`;
  } else {
    title = "Minha assinatura";
    subtitle = state.dueDate
      ? card
        ? `Próxima cobrança no cartão: ${formatDateBR(state.dueDate)}. É automática — você não precisa fazer nada.`
        : `Próximo vencimento: ${formatDateBR(state.dueDate)}. O Pix de cada mês aparece aqui e no aviso dentro do app.`
      : "Sua assinatura está em dia.";
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8">
      <MetaPixel pixelId={pixelId} events={pixelEvents} />
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
              <div className="font-semibold text-navy-50">Contay — {plan.plan === "YEARLY" ? "anual" : "mensal"}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold text-navy-50">{formatBRL(plan.price)}</div>
              <div className="text-xs text-navy-400">{plan.per} · cartão ou Pix</div>
            </div>
          </div>
          <div className="mt-3 border-t border-navy-700/60 pt-3 text-sm text-navy-300">
            Forma de pagamento:{" "}
            <span className="font-semibold text-navy-100">
              {card
                ? "cartão de crédito (cobrança automática)"
                : user.status === "pending"
                  ? "cartão de crédito ou Pix (escolha abaixo)"
                  : "Pix"}
            </span>
          </div>
          {user.subscriptionDueDate && user.status === "active" && !canceled && (
            <div className="mt-3 border-t border-navy-700/60 pt-3 text-sm text-navy-300">
              {state.kind === "ok" || state.kind === "due_soon"
                ? `Próximo vencimento: ${formatDateBR(user.subscriptionDueDate)}`
                : `Vencimento em aberto: ${formatDateBR(user.subscriptionDueDate)}`}
            </div>
          )}
        </div>

        {inTrial && trialEnd && !card && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100" data-testid="assinatura-teste">
            <b>🎁 Teste grátis de {TRIAL_DAYS} dias liberado.</b>{" "}
            {state.daysUntilDue === 0
              ? "Hoje é o último dia."
              : state.daysUntilDue === 1
                ? "Falta 1 dia."
                : `Faltam ${state.daysUntilDue} dias.`}{" "}
            Você não precisa pagar agora: continue usando o app e assine quando quiser, até {formatDateBR(trialEnd)}. Sem fidelidade.
          </div>
        )}

        {inTrial && card && trialEnd && (
          <div className="glass-card flex flex-col gap-3 rounded-2xl p-5" data-testid="assinatura-cartao-no-teste">
            <div className="font-semibold text-navy-50">💳 Cartão cadastrado</div>
            <p className="text-sm text-navy-300">
              Nada foi cobrado ainda. A 1ª {plan.chargeName} de {formatBRL(plan.price)} será cobrada em {formatDateBR(trialEnd)}, no fim do
              teste grátis, e depois {plan.every}, sozinha. Para desistir antes da cobrança, fale com o suporte.
            </p>
            <CardCheckoutButton label="Trocar de cartão" variant="secondary" />
          </div>
        )}

        {/* Escolha do plano: só para quem ainda não pagou e ainda não cadastrou cartão. */}
        {configured && user.status === "pending" && !canceled && !card && (
          <PlanChooser
            current={plan.plan}
            monthlyLabel={`${formatBRL(monthly.price)} por mês`}
            yearlyLabel={`${formatBRL(yearly.price)} por ano`}
            yearlyDetail={`${ANNUAL_DISCOUNT_PERCENT}% de desconto: sai por ${formatBRL(yearly.monthlyEquivalent)} por mês e você economiza ${formatBRL(yearly.yearlySavings)} no ano.`}
          />
        )}

        {user.status === "active" && !canceled && plan.plan === "MONTHLY" && (
          <p className="-mt-2 text-center text-xs text-navy-400" data-testid="oferta-anual">
            Plano anual com {ANNUAL_DISCOUNT_PERCENT}% de desconto ({formatBRL(yearly.price)} por ano): para trocar, fale com o suporte
            pelo WhatsApp.
          </p>
        )}

        {needsCpf && !canceled && (
          <div className="glass-card flex flex-col gap-3 rounded-2xl p-5" data-testid="assinatura-cpf">
            <div className="font-semibold text-navy-50">Para assinar, informe seu CPF</div>
            <p className="text-sm text-navy-300">
              O banco exige o CPF de quem paga para emitir a cobrança, no cartão ou no Pix. Não fazemos consulta de crédito. Depois
              disso aparecem as formas de pagamento.
            </p>
            <CpfForm />
          </div>
        )}

        {firstPaymentPending && showCardBlock && showPixBlock && (
          <p className="-mt-2 text-center text-sm text-navy-300">
            Prefere pagar com Pix?{" "}
            <a href="#pagar-pix" className="font-semibold text-emerald-400 underline hover:text-emerald-300" data-testid="ir-para-pix">
              Ir para o Pix ↓
            </a>
          </p>
        )}

        {!configured && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200">
            A cobrança automática está sendo configurada. Seu cadastro foi recebido — em breve o Pix aparece aqui.
          </div>
        )}

        {cartaoParam === "ok" && card && !canceled && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-200" role="status">
            ✅ Pronto! Sua {plan.chargeName} agora é cobrada automaticamente no cartão.
          </div>
        )}

        {cardReturn && !canceled && !(cartaoParam === "ok" && card) && (
          <div
            className={`rounded-2xl border p-4 text-sm ${
              cardReturn.tone === "ok"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border-amber-400/40 bg-amber-400/10 text-amber-200"
            }`}
            role="status"
          >
            {cardReturn.text}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
        )}

        {/* Cartão recusado: pagar a fatura no Asaas ou cadastrar outro cartão */}
        {cardDeclined && openPayment && (
          <div className="glass-card flex flex-col gap-3 rounded-2xl p-5">
            <div className="flex items-baseline justify-between">
              <div className="font-semibold text-navy-50">Mensalidade em aberto</div>
              <div className="text-sm text-navy-300">
                {formatBRL(openPayment.value)} · venceu {formatDateBR(openPayment.dueDate)}
              </div>
            </div>
            <p className="text-sm text-navy-300">
              A operadora recusou a cobrança (limite, cartão vencido ou bloqueado). Escolha como resolver:
            </p>
            {openPayment.invoiceUrl && (
              <a
                href={openPayment.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-500"
              >
                Pagar esta {plan.chargeName}
              </a>
            )}
            <CardCheckoutButton label="Cadastrar outro cartão" variant="secondary" />
          </div>
        )}

        {/* Cartão em dia: a próxima cobrança é automática */}
        {card && !cardDeclined && !canceled && user.status === "active" && (
          <div className="glass-card flex flex-col gap-3 rounded-2xl p-5">
            <div className="font-semibold text-navy-50">💳 Cobrança automática no cartão</div>
            <p className="text-sm text-navy-300">
              {user.subscriptionDueDate
                ? `A ${plan.chargeName} de ${formatBRL(plan.price)} é cobrada sozinha no seu cartão. Próxima cobrança: ${formatDateBR(user.subscriptionDueDate)}.`
                : `A ${plan.chargeName} de ${formatBRL(plan.price)} é cobrada sozinha no seu cartão ${plan.every}.`}
            </p>
            <CardCheckoutButton label="Trocar de cartão" variant="secondary" />
          </div>
        )}

        {/* Cartão de crédito em 1º lugar (pedido do Marcelo, 09/10), já aberto;
            o Pix vem logo abaixo como segunda opção. */}
        {showCardBlock && (
          <div className="glass-card flex flex-col gap-3 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-navy-50">💳 {user.status === "pending" ? "1ª opção: cartão de crédito" : "Pagar com cartão de crédito"}</div>
              {user.status === "pending" && (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">Recomendado</span>
              )}
            </div>
            <p className="text-sm text-navy-300">
              {inTrial && trialEnd
                ? `Cadastre o cartão agora e esqueça: nada é cobrado hoje. A 1ª ${plan.chargeName} de ${formatBRL(plan.price)} só é cobrada em ${formatDateBR(trialEnd)}, no fim do teste, e depois ${plan.every}, sozinha.`
                : user.status === "pending"
                ? `Pague com cartão e esqueça: os ${formatBRL(plan.price)} são cobrados sozinhos ${plan.every}, sem precisar pagar Pix.`
                : cardFirstDue === today
                  ? `Passe a pagar no cartão: a cobrança de ${formatBRL(plan.price)} é feita hoje e depois ${plan.every}, sozinha. O Pix em aberto é cancelado.`
                  : `Passe a pagar no cartão: a primeira cobrança será em ${formatDateBR(cardFirstDue)} (no lugar do Pix) e depois ${plan.every}, sozinha.`}
            </p>
            <CardCheckoutButton
              label={inTrial ? "Assinar com cartão de crédito" : user.status === "pending" ? "Pagar com cartão de crédito" : "Usar cartão de crédito"}
              defaultOpen
              pixel={checkoutPixel}
            />
            <p className="text-center text-xs text-navy-500">
              🔒 Você digita o cartão na página segura do Asaas. O Contay não vê nem guarda os dados do cartão.
            </p>
          </div>
        )}

        {openPayment && openPayment.billingType !== "CREDIT_CARD" && (
          <div id="pagar-pix" className="glass-card flex scroll-mt-4 flex-col gap-4 rounded-2xl p-5">
            <div className="flex items-baseline justify-between">
              <div className="font-semibold text-navy-50">
                {configured && !card && !canceled && !error && user.status === "pending" ? "2ª opção: Pix" : "Pagar com Pix"}
              </div>
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
                <CopyPixButton payload={openPayment.pixPayload} pixel={checkoutPixel} />
              </>
            )}
            {inTrial && trialEnd && (
              <p className="text-center text-xs text-navy-300" data-testid="pix-no-teste">
                Pagando o Pix agora, sua assinatura já fica garantida e o mês pago só começa a contar em {formatDateBR(trialEnd)}.
              </p>
            )}
            {receiver && (
              <p className="text-center text-xs text-navy-300" data-testid="pix-receiver">
                🏢 Recebedor do Pix: <b className="text-navy-100">{receiver}</b>
              </p>
            )}
          </div>
        )}

        {/* Fora dos blocos condicionais de propósito: precisa continuar
            montado quando o Pix some da tela (pago), para detectar a
            mudança "esperando -> pago" e levar a pessoa para o app. */}
        {configured && !canceled && !needsCpf && <PaymentWatcher
            waiting={waiting}
            justPaidRedirect="/dashboard"
            pixel={pixelId && user.status === "pending" ? { pixelId, ...purchase } : null}
          />}

        {!openPayment && !waiting && !canceled && !card && user.status === "active" && !error && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            ✅ Nenhuma {plan.chargeName} em aberto. O Pix {plan.plan === "YEARLY" ? "do próximo ano" : "do próximo mês"} aparece aqui alguns dias antes do vencimento.
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

        <p className="text-center text-xs text-navy-500" data-testid="assinatura-support">
          Pagamento processado pelo Asaas. Dúvidas? Fale com o suporte no WhatsApp{" "}
          <a
            href={whatsappSupportLink("Olá! Tenho uma dúvida sobre o pagamento do Contay.")}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-emerald-400 hover:text-emerald-300"
          >
            {WHATSAPP_BOT_DISPLAY}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
