"use client";

import { useActionState, useEffect, useRef } from "react";
import { createInvestment } from "@/app/actions/investments";
import type { SimpleFormState } from "@/lib/form-state";

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function InvestmentForm() {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(createInvestment, undefined);
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
      className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 md:grid-cols-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Data</label>
        <input
          type="date"
          name="date"
          defaultValue={todayStr()}
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <div className="sm:col-span-1 md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-500">Descrição</label>
        <input
          type="text"
          name="description"
          placeholder="Ex: Tesouro Selic, CDB, ações..."
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Tipo (opcional)</label>
        <input
          type="text"
          name="type"
          placeholder="Renda fixa, ações..."
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Valor (R$)</label>
        <input
          type="number"
          name="amount"
          step="0.01"
          min="0.01"
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>

      {state && !state.ok && <p className="text-sm text-red-600 sm:col-span-2 md:col-span-5 dark:text-red-400">{state.error}</p>}

      <div className="sm:col-span-2 md:col-span-5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Adicionar investimento"}
        </button>
      </div>
    </form>
  );
}
