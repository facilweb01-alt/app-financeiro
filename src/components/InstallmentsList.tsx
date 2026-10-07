"use client";

import { useState } from "react";
import { formatDateBR } from "@/lib/format";
import { Money } from "@/components/Money";

type Installment = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: number | string;
  paid: boolean;
};

// Lista de parcelas de uma compra no cartão. Recolhida, mostra só as
// parcelas EM ABERTO (nº + valor) — as que já entraram em fatura fechada
// saem daqui e viram uma nota ("2 já em fatura fechada"). "Ver detalhes"
// expande para todas, com vencimento e o selo "na fatura".
export function InstallmentsList({
  installments,
  installmentsTotal,
}: {
  installments: Installment[];
  installmentsTotal: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = installments.filter((i) => !i.paid);
  const invoicedCount = installments.length - open.length;

  return (
    <div className="flex flex-col gap-1">
      {expanded ? (
        <ul className="flex flex-col gap-0.5">
          {installments.map((inst) => (
            <li key={inst.id} className="flex items-center gap-2 text-xs">
              <span className={inst.paid ? "text-navy-500 line-through" : "text-navy-300"}>
                {inst.installmentNumber}/{installmentsTotal} · {formatDateBR(inst.dueDate)} ·{" "}
                <Money value={inst.amount} />
              </span>
              {inst.paid && (
                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-blue-900/40 text-blue-300">
                  na fatura
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <ul className="flex flex-wrap gap-x-2 gap-y-0.5">
            {open.map((inst) => (
              <li key={inst.id} className="text-xs text-navy-300">
                {inst.installmentNumber}/{installmentsTotal} · <Money value={inst.amount} />
              </li>
            ))}
          </ul>
          {invoicedCount > 0 && (
            <span className="text-[11px] text-navy-500">{invoicedCount} já em fatura fechada</span>
          )}
        </>
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="self-start text-[11px] font-medium text-blue-400 hover:underline"
      >
        {expanded ? "Ocultar detalhes" : "Ver detalhes"}
      </button>
    </div>
  );
}
