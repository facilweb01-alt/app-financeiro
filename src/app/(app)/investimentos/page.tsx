import { verifySession } from "@/lib/dal";
import { withRLS } from "@/db/client";
import { listInvestmentsForUser } from "@/lib/queries/investments";
import { formatBRL, formatDateBR } from "@/lib/format";
import { deleteInvestment } from "@/app/actions/investments";
import { InvestmentForm } from "./InvestmentForm";

export default async function InvestimentosPage() {
  const session = await verifySession();
  const items = await withRLS(session.userId, () => listInvestmentsForUser(session.userId));
  const total = items.reduce((sum, i) => sum + Number(i.amount), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Investimentos</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Total investido: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatBRL(total)}</span>
        </p>
      </div>

      <InvestmentForm />

      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Nenhum investimento lançado ainda.
                  </td>
                </tr>
              )}
              {items.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateBR(i.date)}</td>
                  <td className="px-4 py-3">{i.description}</td>
                  <td className="px-4 py-3 text-slate-500">{i.type ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatBRL(i.amount)}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteInvestment}>
                      <input type="hidden" name="id" value={i.id} />
                      <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
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
