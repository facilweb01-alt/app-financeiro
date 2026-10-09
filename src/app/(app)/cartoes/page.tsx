import { verifySession } from "@/lib/dal";
import { withRLS } from "@/db/client";
import { listCardsWithDetailsForUser } from "@/lib/queries/cards";
import { listCategoriesForUser } from "@/lib/queries/categories";
import { listClosedYearMonths } from "@/lib/queries/monthClosing";
import { settleAllCardsInClosedPeriods } from "@/lib/cardStatements";
import { groupOpenInstallmentsByMonth, suggestFirstDueDate } from "@/lib/business/cardStatements";
import { addMonthsClamped, todaySaoPaulo } from "@/lib/business/dates";
import { formatYearMonthBR } from "@/lib/format";
import { CardPurchaseRow } from "@/components/CardPurchaseRow";
import { CollapsibleRows, CollapsibleItems } from "@/components/CollapsibleList";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { deleteCard } from "@/app/actions/cards";
import { NewCardForm } from "./NewCardForm";
import { CardSettingsForm } from "./CardSettingsForm";
import { hasCardCycle } from "@/lib/business/cardCycle";
import { PurchaseForm } from "./PurchaseForm";
import { StatementForm } from "./StatementForm";
import { OpenMonthsPanel } from "./OpenMonthsPanel";
import { ClosedStatement } from "./ClosedStatement";

export default async function CartoesPage() {
  const session = await verifySession();
  const today = todaySaoPaulo();
  const [cards, categories, closedMonths] = await withRLS(session.userId, async () => {
    // Acerto automático: parcela em aberto que cai em período já fechado
    // (mês encerrado ou fatura fechada) recebe baixa antes de montar a
    // tela. Cobre os meses encerrados ANTES de o fechamento do mês passar a
    // fechar a fatura junto (07/10/2026) — sem isso, essas parcelas
    // continuariam aparecendo como "em aberto". Não faz nada quando já está
    // tudo certo.
    await settleAllCardsInClosedPeriods(session.userId, today);
    return Promise.all([
      listCardsWithDetailsForUser(session.userId),
      listCategoriesForUser(session.userId),
      listClosedYearMonths(session.userId),
    ]);
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-100">Cartões</h1>
        <p className="mt-1 text-sm text-navy-400">
          Compras e parcelas em aberto. Ao fechar a fatura, as parcelas dela saem desta lista e ficam guardadas no
          relatório da fatura.
        </p>
      </div>

      <div className="rounded-2xl border p-4 border-navy-800 bg-navy-900">
        <NewCardForm />
      </div>

      {cards.length === 0 && (
        <p className="text-sm text-navy-500">Nenhum cartão cadastrado ainda.</p>
      )}

      {cards.map((card) => {
        // Só o que está EM ABERTO fica na lista do dia a dia: compra com
        // todas as parcelas já faturadas sai daqui e fica no relatório da
        // fatura fechada.
        const openPurchases = card.purchases.filter((p) => p.installments.some((i) => i.statementId === null));
        const invoicedPurchasesCount = card.purchases.length - openPurchases.length;
        const openMonths = groupOpenInstallmentsByMonth(
          card.purchases.flatMap((p) =>
            p.installments
              .filter((i) => i.statementId === null)
              .map((i) => ({ id: i.id, dueDate: i.dueDate, amount: Number(i.amount) }))
          )
        ).map((m) => ({ ...m, label: formatYearMonthBR(m.yearMonth) }));
        const defaultFirstDue = suggestFirstDueDate({
          today,
          statements: card.statements,
          closedMonths,
          addMonths: addMonthsClamped,
        });

        return (
          <div key={card.id} className="rounded-2xl border border-navy-800 bg-navy-900" data-testid="card-block">
            <div className="flex items-center justify-between border-b px-4 py-3 border-navy-800">
              <h2 className="text-lg font-semibold text-navy-100">{card.name}</h2>
              <form action={deleteCard}>
                <input type="hidden" name="id" value={card.id} />
                <ConfirmSubmitButton
                  message={`Excluir o cartão "${card.name}" com TODAS as compras e faturas dele? Isso não pode ser desfeito.`}
                  className="text-xs hover:underline text-red-400"
                >
                  excluir cartão
                </ConfirmSubmitButton>
              </form>
            </div>

            <div className="flex flex-col gap-4 p-4">
              <CardSettingsForm card={{ id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay }} />

              <PurchaseForm
                cardId={card.id}
                categories={categories}
                today={today}
                defaultFirstDue={defaultFirstDue}
                cycle={hasCardCycle(card) ? { closingDay: card.closingDay, dueDay: card.dueDay } : null}
              />

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide border-navy-800 text-navy-400">
                      <th className="px-3 py-2">Compra</th>
                      <th className="px-3 py-2">Descrição</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2">Parcelas em aberto</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {openPurchases.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-navy-500">
                          {card.purchases.length === 0
                            ? "Nenhuma compra neste cartão."
                            : "Nenhuma compra em aberto: tudo já está em fatura fechada."}
                        </td>
                      </tr>
                    )}
                    <CollapsibleRows
                      colSpan={5}
                      itemLabel="compra"
                      items={openPurchases.map((p) => (
                        <CardPurchaseRow key={p.id} purchase={p} categories={categories} />
                      ))}
                    />
                  </tbody>
                </table>
              </div>

              {invoicedPurchasesCount > 0 && (
                <p className="text-xs text-navy-400" data-testid="invoiced-note">
                  {invoicedPurchasesCount === 1
                    ? "1 compra já totalmente faturada não aparece acima."
                    : `${invoicedPurchasesCount} compras já totalmente faturadas não aparecem acima.`}{" "}
                  Elas estão em &quot;Faturas fechadas&quot;, logo abaixo.
                </p>
              )}

              <OpenMonthsPanel cardId={card.id} months={openMonths} />

              <StatementForm cardId={card.id} />

              {card.statements.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
                    Faturas fechadas (toque para ver o relatório)
                  </h3>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    <CollapsibleItems
                      itemLabel="fatura"
                      items={card.statements.map((s) => (
                        <ClosedStatement
                          key={s.id}
                          id={s.id}
                          periodStart={s.periodStart}
                          periodEnd={s.periodEnd}
                          closingDate={s.closingDate}
                          totalAmount={s.totalAmount}
                          items={s.installments.map((i) => ({
                            id: i.id,
                            description: i.purchase.description,
                            categoryLabel: i.purchase.category?.label ?? null,
                            installmentNumber: i.installmentNumber,
                            installmentsTotal: i.purchase.installmentsTotal,
                            dueDate: i.dueDate,
                            amount: i.amount,
                          }))}
                        />
                      ))}
                    />
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
