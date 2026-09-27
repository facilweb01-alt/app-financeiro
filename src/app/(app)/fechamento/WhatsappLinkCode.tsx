"use client";

import { useState, useTransition } from "react";
import { generateWhatsappLinkCode, unlinkWhatsappLid, type LinkCodeState } from "@/app/actions/settings";
import { WHATSAPP_BOT_DISPLAY } from "@/lib/whatsappBot";

// Vincular pelo próprio WhatsApp: o app mostra um código e a pessoa manda
// "VINCULAR <código>" para o número do app. Resolve o caso em que o WhatsApp
// esconde o telefone de quem manda a mensagem (o número cadastrado não bate).
export function WhatsappLinkCode({ linkedByCode }: { linkedByCode: boolean }) {
  const [state, setState] = useState<LinkCodeState>(undefined);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-4 border-t border-navy-800 pt-4">
      {linkedByCode ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-emerald-300">
          ✅ WhatsApp vinculado pelo código.
          <form action={unlinkWhatsappLid}>
            <button type="submit" className="text-xs text-red-400 hover:underline">
              desvincular
            </button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-navy-400">
          Mandou mensagem e o app disse que o número não está vinculado? Gere um código e envie pelo WhatsApp.
        </p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await generateWhatsappLinkCode()))}
        className="mt-3 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? "Gerando..." : linkedByCode ? "Vincular outro WhatsApp" : "Vincular pelo WhatsApp"}
      </button>

      {state?.ok && (
        <div id="whatsapp-link-code" className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          Envie esta mensagem para o WhatsApp do app{WHATSAPP_BOT_DISPLAY ? ` (${WHATSAPP_BOT_DISPLAY})` : ""}:
          <div className="mt-2 select-all font-mono text-lg font-bold tracking-wider text-white">
            VINCULAR {state.code}
          </div>
          <div className="mt-1 text-xs text-emerald-300/80">O código vale por 30 minutos.</div>
        </div>
      )}
      {state && !state.ok && <p className="mt-2 text-sm text-red-400">{state.error}</p>}
    </div>
  );
}
