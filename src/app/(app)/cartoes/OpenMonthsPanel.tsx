"use client";

import { useActionState } from "react";
import { closeCardMonthStatement } from "@/app/actions/cards";
import type { SimpleFormState } from "@/lib/form-state";
import { Money } from "@/components/Money";

export type OpenMonth = { yearMonth: string; label: string; amount: number; count: number };

/**
 * "Em aberto por mês": o total das parcelas ainda não faturadas de cada mês
 * de vencimento, com o botão que fecha a fatura daquele mês em um clique.
 */
export function OpenMonthsPanel({ cardId, months }: { cardId: string; months: OpenMonth[] }) {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(closeCardMonthStatement, undefined);

  return (
    <div data-testid="open-months">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">Em aberto por mês de vencimento</h3>
      {months.length === 0 ? (
        <p className="text-sm text-navy-500">Nenhuma parcela em aberto neste cartão.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {months.map((m) => (
            <li
              key={m.yearMonth}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm bg-navy-950/50"
            >
              <span>
                <span className="font-medium text-navy-100">{m.label}</span>
                <span className="ml-2 text-xs text-navy-400">
                  {m.count} {m.count === 1 ? "parcela" : "parcelas"}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="font-semibold text-navy-100">
                  <Money value={m.amount} />
                </span>
                <form action={action}>
                  <input type="hidden" name="cardId" value={cardId} />
                  <input type="hidden" name="yearMonth" value={m.yearMonth} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                  >
                    Fechar fatura de {m.label.split(" ")[0].toLowerCase()}
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
      {state && !state.ok && <p className="mt-2 text-sm text-red-400">{state.error}</p>}
      {state?.ok && state.notice && <p className="mt-2 text-sm text-blue-300">{state.notice}</p>}
    </div>
  );
}
