"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createTransaction, type TransactionFormState } from "@/app/actions/transactions";
import { useActionState } from "react";
import { createCategory } from "@/app/actions/categories";

type Category = { id: string; key: string; label: string; color: string | null };

const NEW_CATEGORY_VALUE = "__nova__";

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function TransactionForm({ categories: initialCategories }: { categories: Category[] }) {
  const [state, action, pending] = useActionState<TransactionFormState, FormData>(createTransaction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const newCategoryInputRef = useRef<HTMLInputElement>(null);

  // Categoria criada agora mesmo, ainda não refletida em `initialCategories`
  // (que só atualiza quando o servidor revalida a página). Combinada com a
  // lista vinda do servidor no momento da renderização — sem duplicar
  // estado nem precisar de um efeito só para "copiar" a prop.
  const [optimisticCategory, setOptimisticCategory] = useState<Category | null>(null);
  const categories =
    optimisticCategory && !initialCategories.some((c) => c.id === optimisticCategory.id)
      ? [...initialCategories, optimisticCategory].sort((a, b) => a.label.localeCompare(b.label))
      : initialCategories;

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryPending, startCategoryTransition] = useTransition();
  // Escolher "+ Nova categoria..." no próprio <select> muda o valor nativo
  // dele por fora do fluxo controlado do React (é uma opção de verdade,
  // selecionável). Isso deixa o elemento nativo "fora de sincronia" com o
  // estado do React, e o React às vezes não força a resincronização de
  // volta depois (bug conhecido de <select> controlado quando o valor
  // nativo muda e a lista de opções muda no mesmo instante). Trocar a key
  // recria o <select> do zero, sempre com o valor certo.
  const [selectKey, setSelectKey] = useState(0);

  function handleSaveCategory(formData: FormData) {
    setCategoryError(null);
    startCategoryTransition(async () => {
      const result = await createCategory(undefined, formData);
      if (!result) return;
      if (result.ok) {
        setOptimisticCategory(result.category);
        setSelectedCategoryId(result.category.id);
        setShowNewCategory(false);
        setSelectKey((k) => k + 1);
        if (newCategoryInputRef.current) newCategoryInputRef.current.value = "";
      } else {
        setCategoryError(result.error);
      }
    });
  }

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
      className="grid grid-cols-1 gap-3 rounded-2xl border p-4 sm:grid-cols-2 md:grid-cols-6 border-navy-800 bg-navy-900"
    >
      <div className="md:col-span-1">
        <label className="mb-1 block text-xs font-medium text-navy-400">Data da compra</label>
        <input
          type="date"
          name="purchaseDate"
          defaultValue={todayStr()}
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <div className="md:col-span-1">
        <label className="mb-1 block text-xs font-medium text-navy-400">Vencimento</label>
        <input
          type="date"
          name="dueDate"
          defaultValue={todayStr()}
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <div className="sm:col-span-2 md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-navy-400">Produto / serviço</label>
        <input
          type="text"
          name="description"
          placeholder="Ex: Supermercado, Consulta médica..."
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <div className="md:col-span-1">
        <label className="mb-1 block text-xs font-medium text-navy-400">Categoria</label>
        {categories.length === 0 ? (
          <p className="rounded-lg border px-2 py-1.5 text-xs border-amber-800 bg-amber-950/40 text-amber-400">
            Nenhuma categoria ainda. Use &quot;+ Nova categoria&quot; abaixo.
          </p>
        ) : (
          <select
            key={selectKey}
            name="categoryId"
            required
            value={selectedCategoryId}
            onChange={(e) => {
              if (e.target.value === NEW_CATEGORY_VALUE) {
                setShowNewCategory(true);
                return;
              }
              setSelectedCategoryId(e.target.value);
            }}
            className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            <option value={NEW_CATEGORY_VALUE}>+ Nova categoria...</option>
          </select>
        )}
        {categories.length === 0 && !showNewCategory && (
          <button
            type="button"
            onClick={() => setShowNewCategory(true)}
            className="mt-1 text-xs font-medium hover:underline text-blue-400"
          >
            + Nova categoria
          </button>
        )}
        {showNewCategory && (
          // Mesmo <form> de fora (HTML não permite <form> aninhado): este
          // botão usa formAction para chamar uma função diferente da do
          // lançamento, e formNoValidate pra não exigir os campos
          // obrigatórios do lançamento nessa submissão.
          <div className="mt-2 flex items-center gap-1.5">
            <input
              ref={newCategoryInputRef}
              type="text"
              name="label"
              autoFocus
              placeholder="Nome da categoria"
              className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
            />
            <button
              type="submit"
              formAction={handleSaveCategory}
              formNoValidate
              disabled={categoryPending}
              className="rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {categoryPending ? "..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewCategory(false);
                setSelectKey((k) => k + 1);
              }}
              className="rounded-lg px-2 py-1.5 text-xs text-navy-400 hover:underline"
            >
              Cancelar
            </button>
          </div>
        )}
        {categoryError && <p className="mt-1 text-xs text-red-400">{categoryError}</p>}
      </div>
      <div className="md:col-span-1">
        <label className="mb-1 block text-xs font-medium text-navy-400">Valor (R$)</label>
        <input
          type="number"
          name="amount"
          step="0.01"
          min="0.01"
          placeholder="0,00"
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>

      {state && !state.ok && (
        <p className="text-sm sm:col-span-2 md:col-span-6 text-red-400">{state.error}</p>
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
