"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup } from "@/app/actions/auth";

export default function RegistrarPage() {
    const [state, action, pending] = useActionState(signup, undefined);

  return (
        <div className="flex min-h-screen items-center justify-center px-4">
                <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h1 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Criar conta</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Cada pessoa tem seus próprios lançamentos, cartões e investimentos.
    </p>

            <form action={action} className="flex flex-col gap-4">
              <div>
                <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Nome
    </label>
              <input
                  id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
              />
                {state?.errors?.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.errors.name[0]}</p>}
  </div>
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  E-mail
    </label>
              <input
                  id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
              />
                {state?.errors?.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.errors.email[0]}</p>}
  </div>
              <div>
                <label
                                htmlFor="password"
                                className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                  Senha
    </label>
              <input
                  id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
              />
                              <p className="mt-1 text-xs text-slate-400">Pelo menos 8 caracteres, com letra e número.</p>
                {state?.errors?.password && (
                                <ul className="mt-1 list-inside list-disc text-xs text-red-600 dark:text-red-400">
                                  {state.errors.password.map((err) => (
                                    <li key={err}>{err}</li>
                                                      ))}
  </ul>
                                                                         )}
</div>

              <div>
              <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <input
                  id="terms"
                  name="terms"
                  type="checkbox"
                required
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-700"
                />
                                  <span>
                                    Li e aceito os{" "}
                  <Link href="/termos" target="_blank" className="font-medium text-emerald-700 underline dark:text-emerald-400">
                                      Termos de Uso e a Política de Privacidade
                    </Link>
                  . Meus dados são de acesso restrito, não compartilhados com terceiros.
                    </span>
                    </label>
                  {state?.errors?.terms && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.errors.terms[0]}</p>}
</div>

{state?.message && <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>}

            <button
                          type="submit"
                          disabled={pending}
            className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? "Criando conta..." : "Criar conta"}
</button>
  </form>

          <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
                      Já tem conta?{" "}
            <Link href="/login" className="font-medium text-emerald-700 dark:text-emerald-400">
              Entrar
  </Link>
  </p>
  </div>
  </div>
  );
}
