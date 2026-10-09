"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createCardPurchase } from "@/app/actions/cards";
import type { SimpleFormState } from "@/lib/form-state";
import { describeCardCycle, firstDueDateForPurchase, type CardCycle } from "@/lib/business/cardCycle";

type Category = { id: string; label: string };

export function PurchaseForm({
  cardId,
  categories,
  today,
  defaultFirstDue,
  cycle,
}: {
  cardId: string;
  categories: Category[];
  today: string; // "YYYY-MM-DD" no fuso de São Paulo
  // Cartão SEM dia de fechamento/vencimento: hoje, ou o mesmo dia do
  // primeiro mês ainda aberto quando a fatura deste mês já foi fechada.
  defaultFirstDue: string;
  // Dia do fechamento e do vencimento do cartão (null = cartão sem os dias).
  cycle: CardCycle | null;
}) {
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(createCardPurchase, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // Com o ciclo do cartão, o 1º vencimento acompanha a data da compra até a
  // pessoa mudar o vencimento à mão. Sem ciclo, vale a sugestão do servidor
  // (que muda sozinha quando a fatura do mês é fechada).
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [manualDue, setManualDue] = useState<string | null>(null);
  const autoDue = cycle && /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ? firstDueDateForPurchase(purchaseDate, cycle) : defaultFirstDue;
  const firstDue = manualDue ?? autoDue;

  // Compra salva: volta para "hoje" e para o vencimento automático.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) {
      setPurchaseDate(today);
      setManualDue(null);
    }
  }

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
          value={purchaseDate}
          onChange={(e) => setPurchaseDate(e.target.value)}
          required
          className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-navy-400">1º vencimento</label>
        <input
          type="date"
          name="firstDueDate"
          value={firstDue}
          onChange={(e) => setManualDue(e.target.value)}
          data-testid="purchase-first-due"
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

      {cycle ? (
        <p className="col-span-2 text-xs text-navy-400 md:col-span-6" data-testid="purchase-cycle-hint">
          Lance com a data em que a compra aconteceu: o 1º vencimento é calculado pelo cartão ({describeCardCycle(cycle)}).
          Se precisar, altere o vencimento.
        </p>
      ) : (
        defaultFirstDue !== today && (
          <p className="col-span-2 text-xs text-navy-400 md:col-span-6">
            A fatura deste mês já foi fechada: o 1º vencimento já vem sugerido para o próximo mês em aberto.
          </p>
        )
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
