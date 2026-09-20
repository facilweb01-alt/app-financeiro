"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCardPurchase } from "@/app/actions/cards";
import type { SimpleFormState } from "@/lib/form-state";

type Category = { id: string; label: string };

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function PurchaseForm({ cardId, categories }: { cardId: string; categories: Category[] }) {
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
          defaultValue={todayStr()}
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">1º vencimento</label>
        <input
          type="date"
          name="firstDueDate"
          defaultValue={todayStr()}
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

      {state && !state.ok && <p className="col-span-2 text-sm md:col-span-6 text-red-400">{state.error}</p>}

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
