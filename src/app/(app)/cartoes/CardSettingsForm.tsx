"use client";

import { useActionState, useState } from "react";
import { updateCard } from "@/app/actions/cards";
import type { SimpleFormState } from "@/lib/form-state";

// Editar nome, dia do fechamento e dia do vencimento de um cartão já
// cadastrado (cartões antigos e os criados pelo WhatsApp não têm os dias).
export function CardSettingsForm({
  card,
}: {
  card: { id: string; name: string; closingDay: number | null; dueDay: number | null };
}) {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(updateCard, undefined);
  const missing = card.closingDay === null || card.dueDay === null;
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2" data-testid="card-settings">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {missing ? (
          <span className="text-amber-300" data-testid="card-cycle-missing">
            Sem dia de fechamento e vencimento: informe para o Contay calcular o vencimento das compras.
          </span>
        ) : (
          <span className="text-navy-400" data-testid="card-cycle">
            Fecha dia {card.closingDay} · vence dia {card.dueDay}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-blue-300 hover:underline"
          data-testid="card-settings-toggle"
        >
          {open ? "fechar" : missing ? "informar dias" : "editar cartão"}
        </button>
      </div>

      {open && (
        <form action={action} className="flex flex-wrap items-end gap-2 rounded-xl p-3 bg-navy-950/50">
          <input type="hidden" name="id" value={card.id} />
          <div>
            <label className="mb-1 block text-xs font-medium text-navy-400">Nome</label>
            <input
              type="text"
              name="name"
              defaultValue={card.name}
              required
              className="w-44 rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-navy-400">Dia do fechamento</label>
            <input
              type="number"
              name="closingDay"
              min={1}
              max={31}
              defaultValue={card.closingDay ?? undefined}
              required
              className="w-28 rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-navy-400">Dia do vencimento</label>
            <input
              type="number"
              name="dueDay"
              min={1}
              max={31}
              defaultValue={card.dueDay ?? undefined}
              required
              className="w-28 rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 bg-navy-700 hover:bg-navy-600"
          >
            {pending ? "Salvando..." : "Salvar"}
          </button>
          {state && !state.ok && <p className="w-full text-sm text-red-400">{state.error}</p>}
          {state?.ok && state.notice && <p className="w-full text-sm text-blue-300">{state.notice}</p>}
        </form>
      )}
    </div>
  );
}
