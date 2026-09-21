import { verifySession } from "@/lib/dal";
import { withRLS } from "@/db/client";
import { listCardsWithDetailsForUser } from "@/lib/queries/cards";
import { listCategoriesForUser } from "@/lib/queries/categories";
import { formatDateBR } from "@/lib/format";
import { Money } from "@/components/Money";
import { CardPurchaseRow } from "@/components/CardPurchaseRow";
import { deleteCard } from "@/app/actions/cards";
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
        <h1 className="text-2xl font-semibold text-navy-100">Cartões</h1>
        <p className="mt-1 text-sm text-navy-400">
          Compras, parcelas e fechamento manual de fatura por período.
        </p>
      </div>

      <div className="rounded-2xl border p-4 border-navy-800 bg-navy-900">
        <NewCardForm />
      </div>

      {cards.length === 0 && (
        <p className="text-sm text-navy-500">Nenhum cartão cadastrado ainda.</p>
      )}

      {cards.map((card) => (
        <div key={card.id} className="rounded-2xl border border-navy-800 bg-navy-900">
          <div className="flex items-center justify-between border-b px-4 py-3 border-navy-800">
            <h2 className="text-lg font-semibold text-navy-100">{card.name}</h2>
            <form action={deleteCard}>
              <input type="hidden" name="id" value={card.id} />
              <button type="submit" className="text-xs hover:underline text-red-400">
                excluir cartão
              </button>
            </form>
          </div>

          <div className="flex flex-col gap-4 p-4">
            <PurchaseForm cardId={card.id} categories={categories} />

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide border-navy-800 text-navy-400">
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
                      <td colSpan={5} className="px-3 py-6 text-center text-navy-500">
                        Nenhuma compra neste cartão.
                      </td>
                    </tr>
                  )}
                  {card.purchases.map((p) => (
                    <CardPurchaseRow key={p.id} purchase={p} categories={categories} />
                  ))}
                </tbody>
              </table>
            </div>

            <StatementForm cardId={card.id} />

            {card.statements.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
                  Faturas já fechadas
                </h3>
                <ul className="flex flex-col gap-1 text-sm">
                  {card.statements.map((s) => (
                    <li key={s.id} className="flex justify-between rounded-lg px-3 py-2 bg-navy-950/50">
                      <span>
                        {formatDateBR(s.periodStart)} — {formatDateBR(s.periodEnd)} (fechada em{" "}
                        {formatDateBR(s.closingDate)})
                      </span>
                      <span className="font-medium"><Money value={s.totalAmount} /></span>
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
