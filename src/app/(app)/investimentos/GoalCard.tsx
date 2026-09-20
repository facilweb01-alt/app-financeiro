"use client";

import { useActionState, useEffect, useRef } from "react";
import { addGoalContribution, deleteInvestmentGoal } from "@/app/actions/investmentGoals";
import { Money } from "@/components/Money";
import { formatDateBR } from "@/lib/format";
import type { SimpleFormState } from "@/lib/form-state";

type Goal = {
  id: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string | null;
};

export function GoalCard({ goal }: { goal: Goal }) {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(addGoalContribution, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && state?.ok) {
      formRef.current?.reset();
    }
  }, [state, pending]);

  const target = Number(goal.targetAmount);
  const current = Number(goal.currentAmount);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const reached = current >= target;

  return (
    <div className="rounded-2xl border p-4 border-navy-800 bg-navy-900">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-navy-100">{goal.name}</h3>
          {goal.targetDate && (
            <p className="text-xs text-navy-400">Meta para {formatDateBR(goal.targetDate)}</p>
          )}
        </div>
        <form action={deleteInvestmentGoal}>
          <input type="hidden" name="id" value={goal.id} />
          <button type="submit" className="text-xs hover:underline text-red-400">
            excluir
          </button>
        </form>
      </div>

      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-navy-200">
          <Money value={current} /> <span className="text-navy-500">de</span> <Money value={target} />
        </span>
        <span className={`font-semibold ${reached ? "text-blue-400" : "text-navy-400"}`}>{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-navy-800">
        <div
          className={`h-full rounded-full transition-all ${reached ? "bg-blue-600" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {reached && <p className="mt-1 text-xs font-medium text-blue-400">🎉 Meta alcançada!</p>}

      <form ref={formRef} action={action} className="mt-3 flex items-center gap-2">
        <input type="hidden" name="id" value={goal.id} />
        <input
          type="number"
          name="amount"
          step="0.01"
          min="0.01"
          placeholder="Registrar aporte (R$)"
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-blue-900/40 hover:text-blue-300 disabled:opacity-60 bg-navy-800 text-navy-300"
        >
          {pending ? "..." : "Aportar"}
        </button>
      </form>
      {state && !state.ok && <p className="mt-1 text-xs text-red-400">{state.error}</p>}
    </div>
  );
}
