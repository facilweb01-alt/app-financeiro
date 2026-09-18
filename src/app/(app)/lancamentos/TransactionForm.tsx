"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTransaction, type TransactionFormState } from "@/app/actions/transactions";

type Category = { id: string; key: string; label: string; color: string | null };

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function TransactionForm({ categories }: { categories: Category[] }) {
  const [state, action, pending] = useActionState<TransactionFormState, FormData>(createTransaction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // Sucesso (sem erro) depois de enviar: limpa os campos via API do DOM
  // (não é setState, então não dispara re-render em cascata).
  useEffect(() => {
    if (!pending && state?.ok) {
      formRef.current?.reset();
    }
  }, [state, pending]);

  return (
    <form
      ref={formRef}
      action={action}
      className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 md:grid-cols-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="md:col-span-1">
        <label className="mb-1 block text-xs font-medium text-slate-500">Data da compra</label>
        <input
          type="date"
          name="purchaseDate"
          defaultValue={todayStr()}
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <div className="md:col-span-1">
        <label className="mb-1 block text-xs font-medium text-slate-500">Vencimento</label>
        <input
          type="date"
          name="dueDate"
          defaultValue={todayStr()}
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <div className="sm:col-span-2 md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-500">Produto / serviço</label>
        <input
          type="text"
          name="description"
          placeholder="Ex: Supermercado, Consulta médica..."
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <div className="md:col-span-1">
        <label className="mb-1 block text-xs font-medium text-slate-500">Categoria</label>
        <select
          name="categoryId"
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-1">
        <label className="mb-1 block text-xs font-medium text-slate-500">Valor (R$)</label>
        <input
          type="number"
          name="amount"
          step="0.01"
          min="0.01"
          placeholder="0,00"
          required
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>

      {state && !state.ok && (
        <p className="text-sm text-red-600 sm:col-span-2 md:col-span-6 dark:text-red-400">{state.error}</p>
      )}

      <div className="sm:col-span-2 md:col-span-6">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Adicionar lançamento"}
        </button>
      </div>
    </form>
  );
}
