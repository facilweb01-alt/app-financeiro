"use client";

import { useActionState } from "react";
import { updateWhatsappPhone, unlinkWhatsappPhone } from "@/app/actions/settings";
import type { SimpleFormState } from "@/lib/form-state";

export function WhatsappPhoneForm({ currentPhone }: { currentPhone: string | null }) {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(updateWhatsappPhone, undefined);

  if (currentPhone) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-navy-300">
          WhatsApp vinculado: <span className="font-medium">+{currentPhone}</span>
        </p>
        <form action={unlinkWhatsappPhone}>
          <button type="submit" className="text-xs hover:underline text-red-400">
            desvincular
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">
          Vincular WhatsApp (com DDI e DDD, só números)
        </label>
        <input
          type="text"
          name="whatsappPhone"
          placeholder="Ex: 5583999998888"
          className="w-56 rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-950"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-600 disabled:opacity-60 bg-navy-700"
      >
        {pending ? "Vinculando..." : "Vincular número"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
