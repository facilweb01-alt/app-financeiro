"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCardPurchase } from "@/app/actions/cards";
import type { SimpleFormState } from "@/lib/form-state";

type Category = { id: string; label: string };

export function PurchaseForm({
  cardId,
  categories,
  today,
  defaultFirstDue,
}: {
  cardId: string;
  categories: Category[];
  today: string; // "YYYY-MM-DD" no fuso de São Paulo
  // Hoje, ou o mesmo dia do primeiro mês ainda aberto quando a fatura deste
  // mês já foi fechada (para a compra nova não cair na fatura fechada).
  defaultFirstDue: string;
}) {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(createCardPurchase, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && state?.ok) {
      formRef.current?.reset();
    }
  }, [state, pending]);

  return (
    <form ref={formRef} action={action} className="grid grid-cols-2 gap-2 rounded-xl p-3 md:grid-cols-6 bg-navy-950/50">
      <input type="hidden" name="cardId" value={cardId} />
      <div className="col-span-2 md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-navy-400">Descrição da compra</label>
        <input
          type="text"
          name="description"
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">Data da compra</label>
        <input
          type="date"
          name="purchaseDate"
          defaultValue={today}
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">1º vencimento</label>
        <input
          type="date"
          name="firstDueDate"
          defaultValue={defaultFirstDue}
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">Valor total (R$)</label>
        <input
          type="number"
          name="totalAmount"
          step="0.01"
          min="0.01"
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">Parcelas</label>
        <input
          type="number"
          name="installmentsTotal"
          min="1"
          max="48"
          defaultValue={1}
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
        />
      </div>
      <div className="col-span-2 md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-navy-400">Categoria (opcional)</label>
        <select
          name="categoryId"
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
        >
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {defaultFirstDue !== today && (
        <p className="col-span-2 text-xs text-navy-400 md:col-span-6">
          A fatura deste mês já foi fechada: o 1º vencimento já vem sugerido para o próximo mês em aberto.
        </p>
      )}
      {state && !state.ok && <p className="col-span-2 text-sm md:col-span-6 text-red-400">{state.error}</p>}
      {state?.ok && state.notice && (
        <p className="col-span-2 text-sm md:col-span-6 text-blue-300" data-testid="purchase-notice">
          {state.notice}
        </p>
      )}

      <div className="col-span-2 md:col-span-6">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 bg-navy-700 hover:bg-navy-600"
        >
          {pending ? "Salvando..." : "Adicionar compra"}
        </button>
      </div>
    </form>
  );
}
