"use client";

import { useActionState, useEffect, useRef } from "react";
import { setSpendingLimit } from "@/app/actions/spendingLimits";
import type { SimpleFormState } from "@/lib/form-state";

type Category = { id: string; key: string; label: string; color: string | null };

export function SpendingLimitForm({ categories }: { categories: Category[] }) {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(setSpendingLimit, undefined);
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
      className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Categoria</label>
        <select
          name="categoryId"
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Limite mensal (R$)</label>
        <input
          type="number"
          name="monthlyLimit"
          step="0.01"
          min="0.01"
          placeholder="0,00"
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Definir limite"}
        </button>
      </div>

      {state && !state.ok && <p className="text-sm text-red-600 sm:col-span-3 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
