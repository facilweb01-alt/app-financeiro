import { verifySession } from "@/lib/dal";
import { withRLS } from "@/db/client";
import { listCardsWithDetailsForUser } from "@/lib/queries/cards";
import { listCategoriesForUser } from "@/lib/queries/categories";
import { formatBRL, formatDateBR } from "@/lib/format";
import { deleteCard, deleteCardPurchase } from "@/app/actions/cards";
import { NewCardForm } from "./NewCardForm";
import { PurchaseForm } from "./PurchaseForm";
import { StatementForm } from "./StatementForm";

export default async function CartoesPage() {
  const session = await verifySession();
  const [cards, categories] = await withRLS(session.userId, () =>
    Promise.all([listCardsWithDetailsForUser(session.userId), listCategoriesForUser(session.userId)])
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Cartões</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Compras, parcelas e fechamento manual de fatura por período.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <NewCardForm />
      </div>

      {cards.length === 0 && (
        <p className="text-sm text-slate-400">Nenhum cartão cadastrado ainda.</p>
      )}

      {cards.map((card) => (
        <div key={card.id} className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{card.name}</h2>
            <form action={deleteCard}>
              <input type="hidden" name="id" value={card.id} />
              <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
                excluir cartão
              </button>
            </form>
          </div>

          <div className="flex flex-col gap-4 p-4">
            <PurchaseForm cardId={card.id} categories={categories} />

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-3 py-2">Compra</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Parcelas</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {card.purchases.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                        Nenhuma compra neste cartão.
                      </td>
                    </tr>
                  )}
                  {card.purchases.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800/60">
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateBR(p.purchaseDate)}</td>
                      <td className="px-3 py-2">
                        {p.description}
                        {p.category && (
                          <span
                            className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: `${p.category.color ?? "#94a3b8"}22`,
                              color: p.category.color ?? "#475569",
                            }}
                          >
                            {p.category.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{formatBRL(p.totalAmount)}</td>
                      <td className="px-3 py-2">
                        <ul className="flex flex-col gap-0.5">
                          {p.installments.map((inst) => (
                            <li key={inst.id} className="flex items-center gap-2 text-xs">
                              <span className={inst.paid ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-300"}>
                                {inst.installmentNumber}/{p.installmentsTotal} · {formatDateBR(inst.dueDate)} · {formatBRL(inst.amount)}
                              </span>
                              {inst.paid && (
                                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                  na fatura
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <form action={deleteCardPurchase}>
                          <input type="hidden" name="id" value={p.id} />
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

            <StatementForm cardId={card.id} />

            {card.statements.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Faturas já fechadas
                </h3>
                <ul className="flex flex-col gap-1 text-sm">
                  {card.statements.map((s) => (
                    <li key={s.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950/50">
                      <span>
                        {formatDateBR(s.periodStart)} — {formatDateBR(s.periodEnd)} (fechada em{" "}
                        {formatDateBR(s.closingDate)})
                      </span>
                      <span className="font-medium">{formatBRL(s.totalAmount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
