"use client";

import { useActionState } from "react";
import { updateMonthlyIncome } from "@/app/actions/monthClosing";
import type { SimpleFormState } from "@/lib/form-state";

export function IncomeForm({ currentIncome }: { currentIncome: number }) {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(updateMonthlyIncome, undefined);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Sua renda mensal (R$)</label>
        <input
          type="number"
          name="monthlyIncome"
          step="0.01"
          min="0"
          defaultValue={currentIncome || undefined}
          placeholder="0,00"
          className="w-48 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60 dark:bg-slate-700"
      >
        {pending ? "Salvando..." : "Salvar renda"}
      </button>
      {state && !state.ok && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.ok && <p className="text-sm text-blue-600 dark:text-blue-400">Renda atualizada.</p>}
    </form>
  );
}
