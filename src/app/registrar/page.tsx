"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 border-navy-700 bg-navy-950";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="mt-1 text-xs text-red-400">{errors[0]}</p>;
}

export default function RegistrarPage() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="mesh-glow -left-24 -top-24 h-72 w-72 bg-blue-600" aria-hidden />
      <div className="mesh-glow -bottom-24 -right-24 h-72 w-72 bg-emerald-500" aria-hidden />

      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-5 flex justify-center">
          <Logo size={34} />
        </Link>

        <div className="rounded-2xl border p-6 shadow-sm border-navy-800 bg-navy-900">
          <h1 className="mb-1 text-xl font-semibold text-navy-100">Quero o App Financeiro</h1>
          <p className="mb-5 text-sm text-navy-400">
            Preencha seus dados. No passo seguinte aparece o Pix de <strong className="text-navy-200">R$ 29,90</strong>{" "}
            — pagou, o acesso é liberado na hora.
          </p>

          <form action={action} className="flex flex-col gap-4">
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
              <p className="mt-1 text-xs text-navy-500">Necessário para emitir a cobrança Pix.</p>
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
