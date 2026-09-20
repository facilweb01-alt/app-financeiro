"use client";

import { useActionState, useEffect, useRef } from "react";
import { createFixedAccount } from "@/app/actions/fixedAccounts";
import type { SimpleFormState } from "@/lib/form-state";

export function FixedAccountForm() {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(createFixedAccount, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && state?.ok) {
      formRef.current?.reset();
    }
  }, [state, pending]);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-2xl border p-4 border-navy-800 bg-navy-900"
    >
      <div className="flex-1 min-w-[12rem]">
        <label className="mb-1 block text-xs font-medium text-navy-400">Descrição</label>
        <input
          type="text"
          name="description"
          placeholder="Ex: Aluguel, internet, plano de saúde..."
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">Valor (R$)</label>
        <input
          type="number"
          name="amount"
          step="0.01"
          min="0.01"
          required
          className="w-40 rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Adicionando..." : "+ Adicionar conta fixa"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
