import { verifySession } from "@/lib/dal";
import { withRLS } from "@/db/client";
import { listFixedAccountsForUser } from "@/lib/queries/fixedAccounts";
import { formatBRL } from "@/lib/format";
import { deleteFixedAccount, toggleFixedAccountActive } from "@/app/actions/fixedAccounts";
import { FixedAccountForm } from "./FixedAccountForm";

export default async function ContasFixasPage() {
  const session = await verifySession();
  const items = await withRLS(session.userId, () => listFixedAccountsForUser(session.userId));
  const totalAtivas = items.filter((i) => i.active).reduce((sum, i) => sum + Number(i.amount), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Contas fixas</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Total mensal (contas ativas):{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">{formatBRL(totalAtivas)}</span>
        </p>
      </div>

      <FixedAccountForm />

      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {items.length === 0 && <li className="px-4 py-8 text-center text-slate-400">Nenhuma conta fixa cadastrada.</li>}
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <form action={toggleFixedAccountActive}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="active" value={String(item.active)} />
                  <button
                    type="submit"
                    title={item.active ? "Marcar como inativa" : "Marcar como ativa"}
                    className={`h-4 w-4 rounded-full border ${
                      item.active
                        ? "border-emerald-600 bg-emerald-500"
                        : "border-slate-300 bg-transparent dark:border-slate-600"
                    }`}
                  />
                </form>
                <span className={item.active ? "" : "text-slate-400 line-through"}>{item.description}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-medium">{formatBRL(item.amount)}</span>
                <form action={deleteFixedAccount}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
                    excluir
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
