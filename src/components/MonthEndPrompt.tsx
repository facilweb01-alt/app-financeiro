"use client";

import { useActionState, useSyncExternalStore } from "react";
import { closeMonth } from "@/app/actions/monthClosing";
import type { SimpleFormState } from "@/lib/form-state";

// Aviso de virada de mês (pedido do Marcelo em 02/10/2026): quando o mês
// passado terminou e ainda não foi encerrado, o app pergunta se o cliente
// quer encerrar agora. Regra combinada com ele: pergunta em um dia; se a
// resposta for "Agora não", pergunta de novo só mais um dia; depois disso
// não insiste mais — os lançamentos seguem normais e a pergunta volta no
// próximo ciclo (quando o mês seguinte terminar). A resposta fica guardada
// neste aparelho como "<quantas vezes>|<último dia>".

const MAX_ASKS = 2;
const STORAGE_PREFIX = "contay:encerrar-mes:";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readStored(yearMonth: string): string {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + yearMonth) ?? "";
  } catch {
    return ""; // modo privado / storage bloqueado: o aviso só aparece de novo
  }
}

function parseStored(value: string): { count: number; lastDay: string } {
  const [count, lastDay] = value.split("|");
  return { count: Number(count) || 0, lastDay: lastDay ?? "" };
}

export function MonthEndPrompt({
  yearMonth,
  monthLabel,
  today,
}: {
  yearMonth: string;
  monthLabel: string;
  today: string;
}) {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(closeMonth, undefined);
  // No servidor (e na hidratação) o aviso começa escondido, para não piscar
  // na tela de quem já respondeu "agora não" hoje.
  const stored = useSyncExternalStore(
    subscribe,
    () => readStored(yearMonth),
    () => `${MAX_ASKS}|${today}`
  );
  const { count, lastDay } = parseStored(stored);

  if (lastDay === today || count >= MAX_ASKS || state?.ok) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + yearMonth, `${count + 1}|${today}`);
    } catch {
      // sem storage: some só até recarregar
    }
    listeners.forEach((l) => l());
  }

  return (
    <div
      className="mb-5 rounded-2xl border border-blue-500/40 bg-blue-500/10 p-4"
      role="status"
      data-testid="month-end-prompt"
    >
      <div className="font-semibold text-navy-50">{monthLabel} terminou. Quer encerrar o mês agora?</div>
      <p className="mt-1 text-sm text-navy-300">
        Ao encerrar, o resumo do mês fica guardado no Fechamento e os lançamentos dele saem da lista do dia a dia.
        As parcelas que faltam continuam nos próximos meses.
      </p>
      <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="yearMonth" value={yearMonth} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Encerrando..." : "Encerrar mês agora"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          disabled={pending}
          className="rounded-lg border border-navy-600 px-4 py-2 text-sm font-medium text-navy-200 hover:bg-navy-800 disabled:opacity-60"
        >
          Agora não
        </button>
        {state && !state.ok && <span className="text-sm text-red-400">{state.error}</span>}
      </form>
    </div>
  );
}
