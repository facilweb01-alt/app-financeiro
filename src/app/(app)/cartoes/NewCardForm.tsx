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
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3">
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
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Adicionando..." : "Adicionar cartão"}
      </button>
      {state && !state.ok && <p className="text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
