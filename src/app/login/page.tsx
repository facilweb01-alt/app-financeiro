"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border p-6 shadow-sm border-navy-800 bg-navy-900">
        <h1 className="mb-1 text-xl font-semibold text-navy-100">Entrar</h1>
        <p className="mb-6 text-sm text-navy-400">
          Acesse seu app financeiro.
        </p>

        <form action={action} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-navy-300">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 border-navy-700 bg-navy-950"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-navy-300"
            >
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 border-navy-700 bg-navy-950"
            />
          </div>

          {state?.message && <p className="text-sm text-red-400">{state.message}</p>}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-navy-400">
          Ainda não tem conta?{" "}
          <Link href="/registrar" className="font-medium text-blue-400">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
