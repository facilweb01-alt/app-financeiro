"use client";

import { useActionState } from "react";
import { closeMonth } from "@/app/actions/monthClosing";
import type { SimpleFormState } from "@/lib/form-state";
import { currentYearMonth } from "@/lib/business/dates";

export function CloseMonthForm() {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(closeMonth, undefined);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Mês a fechar</label>
        <input
          type="month"
          name="yearMonth"
          defaultValue={currentYearMonth()}
          required
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Fechando..." : "Fechar mês"}
      </button>
      {state && !state.ok && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.ok && <p className="text-sm text-blue-600 dark:text-blue-400">Mês fechado com sucesso.</p>}
    </form>
  );
}
