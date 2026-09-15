"use client";

import { useActionState } from "react";
import { updateSubscriptionDueDate } from "@/app/actions/admin";
import type { SimpleFormState } from "@/lib/form-state";

export function DueDateForm({ userId, currentValue }: { userId: string; currentValue: string | null }) {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(updateSubscriptionDueDate, undefined);

  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={userId} />
      <input
        type="date"
        name="subscriptionDueDate"
        defaultValue={currentValue ?? ""}
        className="w-[9.5rem] rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        {pending ? "..." : "Salvar"}
      </button>
      {state && !state.ok && <p className="w-full text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
