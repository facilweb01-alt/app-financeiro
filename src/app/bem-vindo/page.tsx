import Link from "next/link";
import { redirect } from "next/navigation";
import { getRawSession, sessionInTrial } from "@/lib/dal";
import { PLAN_PRICE, TRIAL_DAYS } from "@/lib/billing/core";
import { formatBRL, formatDateBR } from "@/lib/format";
import { Logo } from "@/components/Logo";
import { MetaPixel, type MetaEventSpec } from "@/components/tracking/MetaPixel";
import { metaPixelId } from "@/lib/metaPixelId";
import { WHATSAPP_BOT_DISPLAY, whatsappSupportLink } from "@/lib/whatsappBot";

// Tela que abre logo depois do cadastro: avisa que o teste grátis de 7 dias
// está liberado e leva a pessoa a fazer o 1º lançamento pelo WhatsApp (é o
// passo que faz o teste valer a pena) ou a abrir o app.
//
// Fica fora da área do app de propósito: é aqui que a medição de anúncios
// conta o "cadastro concluído" (só de quem aceitou os cookies na página de
// vendas). Dentro do app o pixel não existe. Usa getRawSession() (não
// verifySession()) para não entrar em redirecionamento de termos/cobrança.

export const dynamic = "force-dynamic";

export default async function BemVindoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const session = await getRawSession();
  if (!session) redirect("/login");
  if (!sessionInTrial(session) || !session.trialEndsAt) {
    // conta já paga, sem teste ou com o teste encerrado: cada uma no seu lugar
    redirect(session.status === "active" ? "/dashboard" : session.billingEnabled ? "/assinatura" : "/conta-pendente");
  }
  const pixelId = metaPixelId();
  // Cartão obrigatório (20/10/2026): chegou aqui vindo do cadastro do cartão.
  // É o "cadastro concluído" (e o início do teste) para a medição de anúncios,
  // uma vez por navegador. No fluxo antigo, conta pelo sinal deixado no cadastro.
  const cardOnly = session.cardRequired;
  const events: MetaEventSpec[] =
    cardOnly
      ? params.cartao === "1"
        ? [
            { name: "CompleteRegistration", onceKey: "cadastro" },
            { name: "StartTrial", params: { value: PLAN_PRICE, currency: "BRL" }, onceKey: "teste" },
          ]
        : []
      : [{ name: "CompleteRegistration", cookieFlag: "contay_reg" }];
  // A conversa abre com um "oi" (não com um gasto de exemplo, que viraria um
  // lançamento falso na conta); o Contay responde explicando como lançar.
  const firstMessage = "Oi! Acabei de me cadastrar no Contay.";
  const example = "gastei 45 no mercado";

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8">
      <MetaPixel pixelId={pixelId} events={events} />
      <div className="mesh-glow -left-24 -top-24 h-72 w-72 bg-blue-600" aria-hidden />
      <div className="mesh-glow -bottom-24 -right-24 h-72 w-72 bg-emerald-500" aria-hidden />

      <div className="relative mx-auto flex w-full max-w-md flex-col gap-5">
        <Logo size={32} textClassName="text-base" />

        <div>
          <h1 className="text-2xl font-bold text-navy-50">Seu teste grátis de {TRIAL_DAYS} dias está liberado 🎉</h1>
          <p className="mt-1.5 text-sm text-navy-300" data-testid="bem-vindo-prazo">
            Use tudo à vontade até <b className="text-navy-100">{formatDateBR(session.trialEndsAt)}</b>.{" "}
            {cardOnly ? (
              <>
                Seu cartão está cadastrado e nada foi cobrado. Depois do teste, a assinatura mensal de {formatBRL(PLAN_PRICE)} é
                cobrada automaticamente no cartão, sem fidelidade.
              </>
            ) : (
              <>
                Você não pagou nada e não informou cartão. Se gostar, assina por {formatBRL(PLAN_PRICE)} por mês; se não gostar, é só
                não assinar.
              </>
            )}
          </p>
        </div>

        <div className="glass-card flex flex-col gap-3 rounded-2xl p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Passo 1 · leva 10 segundos</div>
          <div className="font-semibold text-navy-50">Mande seu primeiro gasto pelo WhatsApp</div>
          <p className="text-sm text-navy-300">
            Abra a conversa com o Contay, número {WHATSAPP_BOT_DISPLAY}, diga oi e escreva um gasto de verdade, do seu jeito, por
            exemplo: <b className="text-navy-100">“{example}”</b>. Ele responde confirmando e o gasto já aparece no app.
          </p>
          <a
            href={whatsappSupportLink(firstMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            data-testid="bem-vindo-whatsapp"
          >
            Abrir o WhatsApp do Contay
          </a>
          <p className="text-center text-xs text-navy-500">
            Mande pelo mesmo número de WhatsApp que você informou no cadastro. O manual chega por lá em instantes.
          </p>
        </div>

        <div className="glass-card flex flex-col gap-3 rounded-2xl p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-300">Passo 2</div>
          <div className="font-semibold text-navy-50">Conheça o app</div>
          <p className="text-sm text-navy-300">
            Cadastre seus cartões e contas fixas e informe sua renda: o painel mostra quanto do mês já está comprometido e quanto
            ainda sobra.
          </p>
          <Link
            href="/dashboard"
            className="w-full rounded-xl border border-navy-600 px-4 py-3 text-center text-sm font-semibold text-navy-100 transition-colors hover:bg-navy-800"
            data-testid="bem-vindo-app"
          >
            Abrir o app
          </Link>
        </div>

        <p className="text-center text-xs text-navy-500">
          {cardOnly
            ? "Quer cancelar antes da 1ª cobrança? Fale com o suporte na mesma conversa do WhatsApp. Dúvidas? É só perguntar por lá."
            : "Um dia antes de o teste terminar avisamos pelo WhatsApp, com o link para continuar. Dúvidas? É só perguntar na mesma conversa."}
        </p>
      </div>
    </div>
  );
}
