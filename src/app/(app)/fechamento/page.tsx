import type { ReactNode } from "react";
import { verifySession } from "@/lib/dal";
import { db, withRLS } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { loadClosingInputsForUser, listMonthClosingsForUser } from "@/lib/queries/monthClosing";
import { listSpendingLimitsForUser } from "@/lib/queries/spendingLimits";
import { listCategoriesForUser } from "@/lib/queries/categories";
import { resolveMonthSnapshot, monthTotalOf, type MonthClosingSnapshot } from "@/lib/business/monthClosing";
import { currentYearMonth } from "@/lib/business/dates";
import { formatYearMonthBR, formatPercentBR, formatDateBR } from "@/lib/format";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { Money } from "@/components/Money";
import { CollapsibleItems } from "@/components/CollapsibleList";
import { IncomeForm } from "./IncomeForm";
import { CloseMonthForm } from "./CloseMonthForm";
import { WhatsappPhoneForm } from "./WhatsappPhoneForm";
import { WhatsappLinkCode } from "./WhatsappLinkCode";
import { SpendingLimitForm } from "./SpendingLimitForm";
import { SpendingLimitRow } from "./SpendingLimitRow";
import { deleteMonthClosing } from "@/app/actions/monthClosing";

function SnapshotView({ snapshot }: { snapshot: MonthClosingSnapshot }) {
  return (
    <div className="flex flex-col gap-4">
      {/* O "Total do mês" é o mesmo número do painel ("comprometidos este
          mês"): gasto lançado + contas fixas. */}
      <div className="rounded-xl border p-3 border-blue-500/40 bg-blue-500/10" data-testid="month-total">
        <div className="text-xs text-navy-300">Total do mês (gasto lançado + contas fixas)</div>
        <div className="mt-1 text-2xl font-bold text-navy-50">
          <Money value={monthTotalOf(snapshot)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Gasto lançado" value={<Money value={snapshot.totalSpent} />} />
        <Stat label="Contas fixas" value={<Money value={snapshot.fixedAccountsTotal} />} />
        <Stat
          label="% da renda comprometida"
          value={snapshot.totalPercentOfIncome === null ? "—" : formatPercentBR(snapshot.totalPercentOfIncome)}
        />
        <Stat label="Investido no mês" value={<Money value={snapshot.investmentsTotal} />} />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">Por categoria</h3>
        {snapshot.categoryTotals.length === 0 ? (
          <p className="text-sm text-navy-500">Sem lançamentos nesse mês.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            <CollapsibleItems
              itemLabel="categoria"
              items={snapshot.categoryTotals.map((c) => (
                <li key={c.categoryKey} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm bg-navy-950/50">
                  <span>{c.categoryLabel}</span>
                  <span>
                    <span className="font-medium"><Money value={c.amount} /></span>
                    {c.percentOfIncome !== null && (
                      <span className="ml-2 text-xs text-navy-400">({formatPercentBR(c.percentOfIncome)} da renda)</span>
                    )}
                  </span>
                </li>
              ))}
            />
          </ul>
        )}
      </div>

      {snapshot.categoryItems && snapshot.categoryItems.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-navy-400">
            Lançamentos e parcelas do mês ({snapshot.categoryItems.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-navy-300">
            <CollapsibleItems
              itemLabel="item"
              initialCount={15}
              items={[...snapshot.categoryItems]
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                .map((item, idx) => (
                  <li key={idx} className="flex flex-wrap justify-between gap-x-3">
                    <span>
                      {formatDateBR(item.dueDate)} · {item.description}
                      <span className="text-navy-500">
                        {" "}
                        · {item.categoryLabel} · {item.origin === "cartao" ? "cartão" : "lançamento"}
                      </span>
                    </span>
                    <Money value={item.amount} />
                  </li>
                ))}
            />
          </ul>
        </details>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
          Parcelas e valores a vencer nos próximos meses
        </h3>
        {snapshot.pendingByFutureMonth.length === 0 ? (
          <p className="text-sm text-navy-500">Nenhuma parcela pendente para os próximos meses.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            <CollapsibleItems
              itemLabel="mês"
              items={snapshot.pendingByFutureMonth.map((bucket) => (
                <li key={bucket.yearMonth} className="rounded-lg border p-3 border-navy-800">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>{formatYearMonthBR(bucket.yearMonth)}</span>
                    <span><Money value={bucket.amount} /></span>
                  </div>
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-navy-400">
                    <CollapsibleItems
                      itemLabel="parcela"
                      initialCount={4}
                      items={bucket.items.map((item, idx) => (
                        <li key={idx}>
                          {item.cardName} · {item.purchaseDescription} ({item.installmentNumber}/
                          {item.installmentsTotal}) — <Money value={item.amount} />
                        </li>
                      ))}
                    />
                  </ul>
                </li>
              ))}
            />
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border p-3 border-navy-800">
      <div className="text-xs text-navy-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-navy-100">{value}</div>
    </div>
  );
}

export default async function FechamentoPage() {
  const session = await verifySession();

  const [user, inputs, closings, spendingLimits, categories] = await withRLS(session.userId, () =>
    Promise.all([
      db
        .select({ monthlyIncome: users.monthlyIncome, whatsappPhone: users.whatsappPhone, whatsappLid: users.whatsappLid })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1),
      loadClosingInputsForUser(session.userId),
      listMonthClosingsForUser(session.userId),
      listSpendingLimitsForUser(session.userId),
      listCategoriesForUser(session.userId),
    ])
  );

  const income = Number(user[0]?.monthlyIncome ?? 0);
  const thisMonth = currentYearMonth();

  // Mesma conta do painel (resolveMonthSnapshot é a fonte única): os
  // números do fechamento batem com os do painel, mês a mês.
  const snapshotFor = (yearMonth: string) =>
    resolveMonthSnapshot({
      yearMonth,
      liveIncome: income,
      transactions: inputs.transactions,
      cardInstallments: inputs.cardInstallments,
      liveFixedAccountsTotal: inputs.fixedAccountsTotal,
      investmentsTotal: inputs.investmentsByYearMonth(yearMonth),
      closing: closings.find((c) => c.yearMonth === yearMonth) ?? null,
    });

  const livePreview = snapshotFor(thisMonth);
  const alreadyClosedThisMonth = livePreview.closed;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-100">Fechamento mensal</h1>
        <p className="mt-1 text-sm text-navy-400">
          Veja o resumo do mês, feche quando quiser (fica salvo como histórico) e acompanhe o que ainda vai vencer.
        </p>
      </div>

      <div className="rounded-2xl border p-4 border-navy-800 bg-navy-900">
        <IncomeForm currentIncome={income} />
      </div>

      <div className="rounded-2xl border p-4 border-navy-800 bg-navy-900">
        <h2 className="mb-3 text-sm font-semibold text-navy-300">
          Comando por WhatsApp
        </h2>
        <p className="mb-3 text-sm text-navy-400">
          Mande seus gastos por mensagem para o WhatsApp do app — ex.: &quot;gastei 50 no mercado&quot; ou &quot;300 no cartão Nubank em 3x&quot;.
        </p>
        <WhatsappPhoneForm currentPhone={user[0]?.whatsappPhone ?? null} />
        <WhatsappLinkCode linkedByCode={Boolean(user[0]?.whatsappLid)} />
      </div>

      <div className="rounded-2xl border p-4 border-navy-800 bg-navy-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-navy-100">
            {alreadyClosedThisMonth ? "Mês atual" : "Prévia"} — {formatYearMonthBR(thisMonth)}
          </h2>
          <div className="flex items-center gap-2">
            {alreadyClosedThisMonth ? (
              <span className="rounded-full px-3 py-1 text-xs font-medium bg-blue-900/40 text-blue-300">
                Este mês já foi fechado
              </span>
            ) : null}
            <a
              href={`/api/fechamento/pdf?yearMonth=${thisMonth}`}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold border-navy-700 text-navy-300 hover:bg-navy-800"
            >
              Exportar PDF
            </a>
          </div>
        </div>
        <SnapshotView snapshot={livePreview} />
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-navy-100">Limites de gastos por categoria</h2>
        <SpendingLimitForm categories={categories} />
        {spendingLimits.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-navy-500 border-navy-800">
            Nenhum limite definido ainda.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {spendingLimits.map((limit) => {
              const spent = livePreview.categoryTotals.find((c) => c.categoryKey === limit.categoryKey)?.amount ?? 0;
              return <SpendingLimitRow key={limit.id} limit={limit} spent={spent} />;
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border p-4 border-navy-800 bg-navy-900">
        <h2 className="mb-1 text-lg font-semibold text-navy-100">Fechar um mês</h2>
        <p className="mb-3 text-sm text-navy-400">
          Ao fechar, o resumo fica guardado no histórico, os lançamentos do mês saem da lista do dia a dia e a fatura
          daquele mês é fechada em cada cartão. As parcelas que faltam continuam nos próximos meses.
        </p>
        <CloseMonthForm />
      </div>

      {closings.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-navy-100">Histórico de fechamentos</h2>
          {closings.map((c) => {
            const snapshot = snapshotFor(c.yearMonth);
            return (
              <details key={c.id} className="rounded-2xl border p-4 border-navy-800 bg-navy-900" data-testid="closing-history-item">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{formatYearMonthBR(c.yearMonth)}</span>
                  <span className="flex flex-wrap items-center gap-3 text-sm text-navy-400">
                    <span>
                      <Money value={monthTotalOf(snapshot)} /> no mês
                    </span>
                    <a
                      href={`/api/fechamento/pdf?yearMonth=${c.yearMonth}`}
                      className="text-xs hover:underline text-blue-400"
                    >
                      exportar PDF
                    </a>
                    <form action={deleteMonthClosing}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmSubmitButton
                        message={`Reabrir ${formatYearMonthBR(c.yearMonth)}? O mês sai do histórico e os lançamentos dele voltam para a lista do dia a dia. As faturas de cartão continuam fechadas (para reabrir uma fatura, use a aba Cartões).`}
                        className="text-xs hover:underline text-red-400"
                      >
                        reabrir mês
                      </ConfirmSubmitButton>
                    </form>
                  </span>
                </summary>
                <div className="mt-4">
                  <SnapshotView snapshot={snapshot} />
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
