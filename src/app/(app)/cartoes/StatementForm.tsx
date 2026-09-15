"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCardStatement } from "@/app/actions/cards";
import type { SimpleFormState } from "@/lib/form-state";

export function StatementForm({ cardId }: { cardId: string }) {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(createCardStatement, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && state?.ok) {
      formRef.current?.reset();
    }
  }, [state, pending]);

  return (
    <form ref={formRef} action={action} className="grid grid-cols-2 gap-2 rounded-xl border border-dashed border-slate-300 p-3 md:grid-cols-4 dark:border-slate-700">
      <input type="hidden" name="cardId" value={cardId} />
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Fatura: de</label>
        <input
          type="date"
          name="periodStart"
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">até</label>
        <input
          type="date"
          name="periodEnd"
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Data do fechamento</label>
        <input
          type="date"
          name="closingDate"
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {pending ? "Fechando..." : "Fechar fatura do período"}
        </button>
      </div>
      {state && !state.ok && <p className="col-span-2 text-sm text-red-600 md:col-span-4 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
