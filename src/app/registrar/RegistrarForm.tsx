"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signup } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { GUARANTEE_DAYS, MAX_INSTALLMENTS, PLAN_PRICE, PLAN_PRICE_YEARLY, TRIAL_DAYS } from "@/lib/billing/core";
import { formatBRL } from "@/lib/format";
import { normalizeSignupSource, sourceFromReferrer } from "@/lib/business/signupSource";
import { readConsent } from "@/components/tracking/metaPixel";

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 border-navy-700 bg-navy-950";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="mt-1 text-xs text-red-400">{errors[0]}</p>;
}

export function RegistrarForm({ cardRequired }: { cardRequired: boolean }) {
  const [state, action, pending] = useActionState(signup, undefined);
  // De qual anúncio ou site a pessoa veio: a página de vendas manda os "utm_*"
  // no endereço desta página. Vai num campo escondido do formulário; nada fica
  // gravado no navegador.
  const [source, setSource] = useState("");
  // Aceitou os cookies da Meta na página de vendas? Então vão junto os
  // identificadores dos cookies da própria Meta (_fbp/_fbc), para o servidor
  // avisar a Meta do 1º registro e da assinatura (ver src/lib/metaCapi.ts).
  // Recusou ou não escolheu: campos vazios, nada é enviado.
  const [ads, setAds] = useState({ consent: "", fbp: "", fbc: "" });
  useEffect(() => {
    // Lido depois de montar: o endereço só existe no navegador.
    // Sem "utm_*" (ex.: link da bio sem UTM, Google, link no WhatsApp): vale o
    // nome do site de onde a pessoa veio (sourceFromReferrer).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSource(normalizeSignupSource(window.location.search) ?? sourceFromReferrer(document.referrer, window.location.host) ?? "");
    if (readConsent() === "aceito") {
      const cookie = (name: string) =>
        document.cookie
          .split("; ")
          .find((c) => c.startsWith(`${name}=`))
          ?.slice(name.length + 1) ?? "";
      setAds({ consent: "1", fbp: cookie("_fbp"), fbc: cookie("_fbc") });
    }
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="mesh-glow -left-24 -top-24 h-72 w-72 bg-blue-600" aria-hidden />
      <div className="mesh-glow -bottom-24 -right-24 h-72 w-72 bg-emerald-500" aria-hidden />

      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-5 flex justify-center">
          <Logo size={34} />
        </Link>

        <div className="rounded-2xl border p-6 shadow-sm border-navy-800 bg-navy-900">
          <h1 className="mb-1 text-xl font-semibold text-navy-100">Teste o Contay grátis por {TRIAL_DAYS} dias</h1>
          {cardRequired ? (
            <p className="mb-3 text-sm text-navy-400">
              Preencha seus dados e, em seguida, cadastre seu cartão de crédito para liberar o teste. Você{" "}
              <strong className="text-navy-200">não paga nada agora</strong>.
            </p>
          ) : (
            <p className="mb-3 text-sm text-navy-400">
              Só nome, e-mail, WhatsApp e senha. <strong className="text-navy-200">Sem cartão e sem pagar nada</strong>: em
              seguida você já manda o seu 1º gasto pelo WhatsApp.
            </p>
          )}
          <ul className="mb-5 flex flex-col gap-1.5 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-xs text-emerald-100" data-testid="registrar-garantias">
            <li>✅ <b>{TRIAL_DAYS} dias grátis</b>, com tudo liberado, inclusive o WhatsApp.</li>
            {cardRequired ? (
              <li>✅ Depois do teste, {formatBRL(PLAN_PRICE)} por mês no cartão. Sem fidelidade: cancele antes do fim do teste e não paga nada.</li>
            ) : (
              <li>
                ✅ Gostou? Plano anual de {formatBRL(PLAN_PRICE_YEARLY)} (em até {MAX_INSTALLMENTS}x no cartão ou Pix) ou{" "}
                {formatBRL(PLAN_PRICE)} por mês. Não gostou? Não paga nada.
              </li>
            )}
            <li>✅ Garantia de {GUARANTEE_DAYS} dias depois de assinar: devolvemos 100%.</li>
            <li>✅ Não pedimos senha de banco nem acesso à sua conta.</li>
          </ul>

          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="source" value={source} readOnly />
            <input type="hidden" name="adsConsent" value={ads.consent} readOnly />
            <input type="hidden" name="fbp" value={ads.fbp} readOnly />
            <input type="hidden" name="fbc" value={ads.fbc} readOnly />
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-navy-300">
                Nome completo
              </label>
              <input id="name" name="name" type="text" required autoComplete="name" className={inputClass} />
              <FieldError errors={state?.errors?.name} />
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-navy-300">
                E-mail
              </label>
              <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
              <FieldError errors={state?.errors?.email} />
            </div>

            <div>
              <label htmlFor="whatsappPhone" className="mb-1 block text-sm font-medium text-navy-300">
                WhatsApp (com DDD)
              </label>
              <input
                id="whatsappPhone"
                name="whatsappPhone"
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(83) 99999-8888"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-navy-500">
                É por esse número que você vai lançar gastos pelo WhatsApp, por texto, áudio ou foto do cupom.
              </p>
              <FieldError errors={state?.errors?.whatsappPhone} />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-navy-300">
                Crie uma senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-navy-500">Pelo menos 8 caracteres, com letra e número.</p>
              {state?.errors?.password && (
                <ul className="mt-1 list-inside list-disc text-xs text-red-400">
                  {state.errors.password.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="flex items-start gap-2 text-xs text-navy-300">
                <input
                  id="terms"
                  name="terms"
                  type="checkbox"
                  required
                  className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-navy-700"
                />
                <span>
                  Li e aceito os{" "}
                  <Link href="/termos" target="_blank" className="font-medium underline text-blue-400">
                    Termos de Uso e a Política de Privacidade
                  </Link>
                  . Meus dados são de acesso restrito. Se eu assinar depois do teste, os dados de cobrança vão para o
                  processador de pagamentos (Asaas). Aceito receber mensagens do Contay no WhatsApp que informei, e
                  posso parar as ofertas respondendo SAIR.
                </span>
              </label>
              <FieldError errors={state?.errors?.terms} />
            </div>

            {state?.message && <p className="text-sm text-red-400">{state.message}</p>}

            <button
              type="submit"
              disabled={pending}
              className="mt-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {pending ? "Criando sua conta..." : "Começar meu teste grátis"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-navy-400">
            Já tem conta?{" "}
            <Link href="/login" className="font-medium text-blue-400">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
