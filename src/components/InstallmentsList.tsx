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

// Lista de parcelas de uma compra no cartão. Por padrão mostra só o
// essencial (nº da parcela + valor) pra não estourar a tabela em compras
// com muitas parcelas — um botão "ver detalhes" expande pra mostrar a data
// de vencimento e o selo "na fatura" de cada uma.
export function InstallmentsList({
  installments,
  installmentsTotal,
}: {
  installments: Installment[];
  installmentsTotal: number;
}) {
  const [expanded, setExpanded] = useState(false);

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
        <ul className="flex flex-wrap gap-x-2 gap-y-0.5">
          {installments.map((inst) => (
            <li
              key={inst.id}
              className={`text-xs ${inst.paid ? "text-navy-500 line-through" : "text-navy-300"}`}
            >
              {inst.installmentNumber}/{installmentsTotal} · <Money value={inst.amount} />
            </li>
          ))}
        </ul>
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
