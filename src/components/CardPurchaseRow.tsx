"use client";

import { useActionState, useRef, useState } from "react";
import { formatDateBR } from "@/lib/format";
import { Money } from "@/components/Money";
import { InstallmentsList } from "@/components/InstallmentsList";
import { deleteCardPurchase, updateCardPurchase } from "@/app/actions/cards";
import type { SimpleFormState } from "@/lib/form-state";

type Category = { id: string; label: string; color: string | null };

type Installment = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: string;
  paid: boolean;
  statementId: string | null;
};

type Purchase = {
  id: string;
  purchaseDate: string;
  description: string;
  categoryId: string | null;
  totalAmount: string;
  installmentsTotal: number;
  category: { id: string; label: string; color: string | null } | null;
  installments: Installment[];
};

/**
 * Uma linha da tabela de compras do cartão, com botão "editar" — pedido do
 * Marcelo: "precisa ter um botão de editar caso erre e precisa fazer
 * novamente". Ao clicar, abre um formulário pré-preenchido logo abaixo. Se
 * a compra já tem alguma parcela paga ou incluída numa fatura fechada, os
 * campos de valor/parcelas/1º vencimento ficam desabilitados (a mesma trava
 * é aplicada de novo no servidor, então isso é só pra não deixar o usuário
 * preencher algo que vai ser rejeitado).
 */
export function CardPurchaseRow({ purchase, categories }: { purchase: Purchase; categories: Category[] }) {
  const [editing, setEditing] = useState(false);
  // Fecha o formulário de edição assim que a ação retorna sucesso — feito
  // dentro do wrapper da própria action (que já roda numa transição), em
  // vez de um useEffect observando o resultado, pra não disparar um
  // segundo ciclo de render desnecessário a cada submit.
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(async (prevState, formData) => {
    const result = await updateCardPurchase(prevState, formData);
    if (result?.ok) {
      setEditing(false);
    }
    return result;
  }, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  const hasLockedInstallment = purchase.installments.some((i) => i.paid || i.statementId !== null);
  const firstDueDate =
    purchase.installments.find((i) => i.installmentNumber === 1)?.dueDate ?? purchase.purchaseDate;

  return (
    <>
      <tr className="border-b align-top last:border-0 border-navy-800/60">
        <td className="px-3 py-2 whitespace-nowrap">{formatDateBR(purchase.purchaseDate)}</td>
        <td className="px-3 py-2">
          {purchase.description}
          {purchase.category && (
            <span
              className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `${purchase.category.color ?? "#94a3b8"}22`,
                color: purchase.category.color ?? "#475569",
              }}
            >
              {purchase.category.label}
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
          <Money value={purchase.totalAmount} />
        </td>
        <td className="px-3 py-2">
          <InstallmentsList installments={purchase.installments} installmentsTotal={purchase.installmentsTotal} />
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-xs hover:underline text-blue-400"
            >
              {editing ? "cancelar" : "editar"}
            </button>
            <form action={deleteCardPurchase}>
              <input type="hidden" name="id" value={purchase.id} />
              <button type="submit" className="text-xs hover:underline text-red-400">
                excluir
              </button>
            </form>
          </div>
        </td>
      </tr>

      {editing && (
        <tr className="border-b border-navy-800/60">
          <td colSpan={5} className="px-3 pb-3">
            <form
              ref={formRef}
              action={action}
              className="grid grid-cols-2 gap-2 rounded-xl p-3 md:grid-cols-6 bg-navy-950/50"
            >
              <input type="hidden" name="id" value={purchase.id} />

              {hasLockedInstallment && (
                <p className="col-span-2 text-xs text-amber-400 md:col-span-6">
                  Essa compra já tem parcela paga ou em fatura fechada — só descrição, categoria e data podem ser
                  editadas.
                </p>
              )}

              <div className="col-span-2 md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-navy-400">Descrição da compra</label>
                <input
                  type="text"
                  name="description"
                  required
                  defaultValue={purchase.description}
                  className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-navy-400">Data da compra</label>
                <input
                  type="date"
                  name="purchaseDate"
                  required
                  defaultValue={purchase.purchaseDate}
                  className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-navy-400">1º vencimento</label>
                <input
                  type="date"
                  name="firstDueDate"
                  required
                  defaultValue={firstDueDate}
                  disabled={hasLockedInstallment}
                  className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900 disabled:opacity-50"
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
                  defaultValue={purchase.totalAmount}
                  disabled={hasLockedInstallment}
                  className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-navy-400">Parcelas</label>
                <input
                  type="number"
                  name="installmentsTotal"
                  min="1"
                  max="48"
                  required
                  defaultValue={purchase.installmentsTotal}
                  disabled={hasLockedInstallment}
                  className="w-full rounded-lg border px-2 py-1.5 text-sm border-navy-700 bg-navy-900 disabled:opacity-50"
                />
              </div>
              <div className="col-span-2 md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-navy-400">Categoria (opcional)</label>
                <select
                  name="categoryId"
                  defaultValue={purchase.categoryId ?? ""}
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

              {state && !state.ok && <p className="col-span-2 text-sm md:col-span-6 text-red-400">{state.error}</p>}

              <div className="col-span-2 flex gap-2 md:col-span-6">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 bg-blue-600 hover:bg-blue-500"
                >
                  {pending ? "Salvando..." : "Salvar alterações"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium border border-navy-700 text-navy-300 hover:bg-navy-800"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
