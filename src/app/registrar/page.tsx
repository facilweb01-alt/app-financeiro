"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signup } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { GUARANTEE_DAYS } from "@/lib/billing/core";
import { normalizeSignupSource } from "@/lib/business/signupSource";

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 border-navy-700 bg-navy-950";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="mt-1 text-xs text-red-400">{errors[0]}</p>;
}

export default function RegistrarPage() {
  const [state, action, pending] = useActionState(signup, undefined);
  // De qual anúncio a pessoa veio: a página de vendas manda os "utm_*" no
  // endereço desta página. Vai num campo escondido do formulário; nada fica
  // gravado no navegador.
  const [source, setSource] = useState("");
  useEffect(() => {
    // Lido depois de montar: o endereço só existe no navegador.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSource(normalizeSignupSource(window.location.search) ?? "");
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
          <h1 className="mb-1 text-xl font-semibold text-navy-100">Quero o Contay</h1>
          <p className="mb-3 text-sm text-navy-400">
            Preencha seus dados. No passo seguinte você paga <strong className="text-navy-200">R$ 29,90</strong> com
            cartão de crédito ou Pix — pagou, o acesso é liberado na hora.
          </p>
          <ul className="mb-5 flex flex-col gap-1.5 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-xs text-emerald-100" data-testid="registrar-garantias">
            <li>✅ <b>Garantia de {GUARANTEE_DAYS} dias:</b> não gostou, avise o suporte e devolvemos o valor.</li>
            <li>✅ Sem fidelidade: cancele quando quiser.</li>
            <li>✅ Não pedimos senha de banco nem acesso à sua conta.</li>
          </ul>

          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="source" value={source} readOnly />
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
              <p className="mt-1 text-xs text-navy-500">É por esse número que você vai lançar gastos pelo WhatsApp.</p>
              <FieldError errors={state?.errors?.whatsappPhone} />
            </div>

            <div>
              <label htmlFor="cpf" className="mb-1 block text-sm font-medium text-navy-300">
                CPF
              </label>
              <input
                id="cpf"
                name="cpf"
                type="text"
                required
                inputMode="numeric"
                placeholder="000.000.000-00"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-navy-500">O banco exige o CPF para emitir a cobrança. Não fazemos consulta de crédito.</p>
              <FieldError errors={state?.errors?.cpf} />
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
                  . Meus dados são de acesso restrito e só são compartilhados com o processador de pagamentos
                  (Asaas), para emitir a cobrança.
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
              {pending ? "Criando sua conta..." : "Continuar para o pagamento"}
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
