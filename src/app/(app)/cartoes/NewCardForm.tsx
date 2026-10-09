"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCard } from "@/app/actions/cards";
import type { SimpleFormState } from "@/lib/form-state";

export function NewCardForm() {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(createCard, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && state?.ok) {
      formRef.current?.reset();
    }
  }, [state, pending]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3" data-testid="new-card-form">
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">Novo cartão</label>
        <input
          type="text"
          name="name"
          placeholder="Ex: Nubank, Itaú..."
          required
          className="w-56 rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">Dia do fechamento</label>
        <input
          type="number"
          name="closingDay"
          min={1}
          max={31}
          placeholder="Ex: 3"
          className="w-28 rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">Dia do vencimento</label>
        <input
          type="number"
          name="dueDay"
          min={1}
          max={31}
          placeholder="Ex: 10"
          className="w-28 rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Adicionando..." : "Adicionar cartão"}
      </button>
      <p className="w-full text-xs text-navy-400">
        Os dias estão na fatura do cartão. Com eles, você lança a compra só com a data em que ela aconteceu e o Contay
        calcula o vencimento sozinho (compra a partir do dia do fechamento vai para a fatura seguinte). Sem os dias, o
        vencimento de cada compra é informado à mão.
      </p>
      {state && !state.ok && <p className="w-full text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
