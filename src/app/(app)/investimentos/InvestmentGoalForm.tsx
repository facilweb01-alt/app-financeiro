"use client";

import { useActionState, useEffect, useRef } from "react";
import { createInvestmentGoal } from "@/app/actions/investmentGoals";
import type { SimpleFormState } from "@/lib/form-state";

export function InvestmentGoalForm() {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(createInvestmentGoal, undefined);
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
      className="grid grid-cols-1 gap-3 rounded-2xl border p-4 sm:grid-cols-2 md:grid-cols-4 border-navy-800 bg-navy-900"
    >
      <div className="sm:col-span-1 md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-navy-400">Nome da meta</label>
        <input
          type="text"
          name="name"
          placeholder="Ex: Reserva de emergência, viagem..."
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">Valor alvo (R$)</label>
        <input
          type="number"
          name="targetAmount"
          step="0.01"
          min="0.01"
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">Data alvo (opcional)</label>
        <input
          type="date"
          name="targetDate"
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>

      {state && !state.ok && <p className="text-sm sm:col-span-2 md:col-span-4 text-red-400">{state.error}</p>}

      <div className="sm:col-span-2 md:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Criar meta"}
        </button>
      </div>
    </form>
  );
}
