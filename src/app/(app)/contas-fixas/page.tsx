import { verifySession } from "@/lib/dal";
import { withRLS } from "@/db/client";
import { listFixedAccountsForUser } from "@/lib/queries/fixedAccounts";
import { Money } from "@/components/Money";
import { deleteFixedAccount, toggleFixedAccountActive } from "@/app/actions/fixedAccounts";
import { FixedAccountForm } from "./FixedAccountForm";

export default async function ContasFixasPage() {
  const session = await verifySession();
  const items = await withRLS(session.userId, () => listFixedAccountsForUser(session.userId));
  const totalAtivas = items.filter((i) => i.active).reduce((sum, i) => sum + Number(i.amount), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-100">Contas fixas</h1>
        <p className="mt-1 text-sm text-navy-400">
          Total mensal (contas ativas):{" "}
          <span className="font-semibold text-navy-200"><Money value={totalAtivas} /></span>
        </p>
      </div>

      <FixedAccountForm />

      <div className="rounded-2xl border border-navy-800 bg-navy-900">
        <ul className="divide-y divide-navy-800/60">
          {items.length === 0 && <li className="px-4 py-8 text-center text-navy-500">Nenhuma conta fixa cadastrada.</li>}
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
                      item.active ? "border-blue-600 bg-blue-500" : "border-navy-600 bg-transparent"
                    }`}
                  />
                </form>
                <span className={item.active ? "" : "text-navy-500 line-through"}>{item.description}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-medium"><Money value={item.amount} /></span>
                <form action={deleteFixedAccount}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="text-xs hover:underline text-red-400">
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
