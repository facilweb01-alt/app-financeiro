"use client";

import { useActionState } from "react";
import { reopenCardStatement } from "@/app/actions/cards";
import type { SimpleFormState } from "@/lib/form-state";
import { formatDateBR } from "@/lib/format";
import { Money } from "@/components/Money";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export type StatementItem = {
  id: string;
  description: string;
  categoryLabel: string | null;
  installmentNumber: number;
  installmentsTotal: number;
  dueDate: string;
  amount: string;
};

/**
 * Uma fatura já fechada, que funciona como relatório: abre para mostrar
 * cada parcela que entrou nela, exporta em PDF e pode ser reaberta (as
 * parcelas voltam para "em aberto").
 */
export function ClosedStatement({
  id,
  periodStart,
  periodEnd,
  closingDate,
  totalAmount,
  items,
}: {
  id: string;
  periodStart: string;
  periodEnd: string;
  closingDate: string;
  totalAmount: string;
  items: StatementItem[];
}) {
  const [state, action] = useActionState<SimpleFormState, FormData>(reopenCardStatement, undefined);

  return (
    <li className="rounded-lg bg-navy-950/50" data-testid="closed-statement">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
          <span>
            {formatDateBR(periodStart)} a {formatDateBR(periodEnd)}
            <span className="ml-2 text-xs text-navy-400">
              {items.length} {items.length === 1 ? "parcela" : "parcelas"} · fechada em {formatDateBR(closingDate)}
            </span>
          </span>
          <span className="font-semibold text-navy-100">
            <Money value={totalAmount} />
          </span>
        </summary>
        <div className="border-t px-3 py-2 border-navy-800/60">
          <ul className="flex flex-col gap-1 text-xs text-navy-300">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-x-3">
                <span>
                  {formatDateBR(item.dueDate)} · {item.description} ({item.installmentNumber}/{item.installmentsTotal})
                  {item.categoryLabel && <span className="text-navy-500"> · {item.categoryLabel}</span>}
                </span>
                <Money value={item.amount} />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <a
              href={`/api/cartoes/fatura/pdf?statementId=${encodeURIComponent(id)}`}
              className="text-xs font-medium text-blue-400 hover:underline"
            >
              exportar PDF da fatura
            </a>
            <form action={action}>
              <input type="hidden" name="id" value={id} />
              <ConfirmSubmitButton
                message="Reabrir esta fatura? As parcelas dela voltam para a lista de parcelas em aberto."
                className="text-xs hover:underline text-red-400"
              >
                reabrir fatura
              </ConfirmSubmitButton>
            </form>
          </div>
          {state && !state.ok && <p className="mt-2 text-xs text-red-400">{state.error}</p>}
        </div>
      </details>
    </li>
  );
}
