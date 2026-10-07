"use client";

import { useActionState, useState } from "react";
import { createCardStatement } from "@/app/actions/cards";
import type { SimpleFormState } from "@/lib/form-state";

/**
 * Fechamento manual da fatura por período ("de tal data até tal data") —
 * pode atravessar meses. Os campos são controlados para o período digitado
 * não sumir quando o servidor devolve um erro.
 */
export function StatementForm({ cardId }: { cardId: string }) {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(async (prev, formData) => {
    const result = await createCardStatement(prev, formData);
    if (result?.ok) {
      setPeriodStart("");
      setPeriodEnd("");
    }
    return result;
  }, undefined);

  return (
    <form action={action} className="grid grid-cols-2 gap-2 rounded-xl border border-dashed p-3 md:grid-cols-3 border-navy-700">
      <input type="hidden" name="cardId" value={cardId} />
      <p className="col-span-2 text-xs text-navy-400 md:col-span-3">
        Ou feche por período: entram as parcelas em aberto que <strong>vencem</strong> entre as duas datas (pode pegar
        mais de um mês).
      </p>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">Vencimento de</label>
        <input
          type="date"
          name="periodStart"
          required
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">até</label>
        <input
          type="date"
          name="periodEnd"
          required
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <div className="col-span-2 flex items-end md:col-span-1">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {pending ? "Fechando..." : "Fechar fatura do período"}
        </button>
      </div>
      {state && !state.ok && <p className="col-span-2 text-sm md:col-span-3 text-red-400">{state.error}</p>}
      {state?.ok && state.notice && <p className="col-span-2 text-sm md:col-span-3 text-blue-300">{state.notice}</p>}
    </form>
  );
}
