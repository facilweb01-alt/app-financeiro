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
      className="grid grid-cols-1 gap-3 rounded-2xl border p-4 sm:grid-cols-3 border-navy-800 bg-navy-900"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">Categoria</label>
        <select
          name="categoryId"
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">Limite mensal (R$)</label>
        <input
          type="number"
          name="monthlyLimit"
          step="0.01"
          min="0.01"
          placeholder="0,00"
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
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

      {state && !state.ok && <p className="text-sm sm:col-span-3 text-red-400">{state.error}</p>}
    </form>
  );
}
