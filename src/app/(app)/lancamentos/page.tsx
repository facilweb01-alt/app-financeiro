import { verifySession } from "@/lib/dal";
import { withRLS } from "@/db/client";
import { listCategoriesForUser } from "@/lib/queries/categories";
import { listTransactionsForUser } from "@/lib/queries/transactions";
import { formatDateBR } from "@/lib/format";
import { Money } from "@/components/Money";
import { TransactionForm } from "./TransactionForm";
import { deleteTransaction } from "@/app/actions/transactions";

export default async function LancamentosPage() {
  const session = await verifySession();
  const [categories, txs] = await withRLS(session.userId, () =>
    Promise.all([listCategoriesForUser(session.userId), listTransactionsForUser(session.userId)])
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-100">Lançamentos</h1>
        <p className="mt-1 text-sm text-navy-400">
          Gastos do dia a dia: produto, serviço, lazer, saúde, alimentação, compras pessoais, viagem, gasolina...
        </p>
      </div>

      <TransactionForm categories={categories} />

      <div className="rounded-2xl border border-navy-800 bg-navy-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide border-navy-800 text-navy-400">
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Compra</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-navy-500">
                    Nenhum lançamento ainda.
                  </td>
                </tr>
              )}
              {txs.map((tx) => (
                <tr key={tx.id} className="border-b last:border-0 border-navy-800/60">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateBR(tx.dueDate)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-navy-400">{formatDateBR(tx.purchaseDate)}</td>
                  <td className="px-4 py-3">{tx.description}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: `${tx.categoryColor ?? "#94a3b8"}22`,
                        color: tx.categoryColor ?? "#475569",
                      }}
                    >
                      {tx.categoryLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap"><Money value={tx.amount} /></td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteTransaction}>
                      <input type="hidden" name="id" value={tx.id} />
                      <button type="submit" className="text-xs hover:underline text-red-400">
                        excluir
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
