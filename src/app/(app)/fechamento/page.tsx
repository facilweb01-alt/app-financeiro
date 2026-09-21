import type { ReactNode } from "react";
import { verifySession } from "@/lib/dal";
import { db, withRLS } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { loadClosingInputsForUser, listMonthClosingsForUser } from "@/lib/queries/monthClosing";
import { listSpendingLimitsForUser } from "@/lib/queries/spendingLimits";
import { listCategoriesForUser } from "@/lib/queries/categories";
import { computeMonthClosingSnapshot, type MonthClosingSnapshot } from "@/lib/business/monthClosing";
import { currentYearMonth } from "@/lib/business/dates";
import { formatYearMonthBR, formatPercentBR } from "@/lib/format";
import { Money } from "@/components/Money";
import { IncomeForm } from "./IncomeForm";
import { CloseMonthForm } from "./CloseMonthForm";
import { WhatsappPhoneForm } from "./WhatsappPhoneForm";
import { SpendingLimitForm } from "./SpendingLimitForm";
import { SpendingLimitRow } from "./SpendingLimitRow";
import { deleteMonthClosing } from "@/app/actions/monthClosing";

function SnapshotView({ snapshot }: { snapshot: MonthClosingSnapshot }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total gasto" value={<Money value={snapshot.totalSpent} />} />
        <Stat
          label="% da renda comprometida"
          value={snapshot.totalPercentOfIncome === null ? "—" : formatPercentBR(snapshot.totalPercentOfIncome)}
        />
        <Stat label="Contas fixas" value={<Money value={snapshot.fixedAccountsTotal} />} />
        <Stat label="Investido no mês" value={<Money value={snapshot.investmentsTotal} />} />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">Por categoria</h3>
        {snapshot.categoryTotals.length === 0 ? (
          <p className="text-sm text-navy-500">Sem lançamentos nesse mês.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {snapshot.categoryTotals.map((c) => (
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
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
          Parcelas e valores a vencer nos próximos meses
        </h3>
        {snapshot.pendingByFutureMonth.length === 0 ? (
          <p className="text-sm text-navy-500">Nenhuma parcela pendente para os próximos meses.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {snapshot.pendingByFutureMonth.map((bucket) => (
              <li key={bucket.yearMonth} className="rounded-lg border p-3 border-navy-800">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{formatYearMonthBR(bucket.yearMonth)}</span>
                  <span><Money value={bucket.amount} /></span>
                </div>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-navy-400">
                  {bucket.items.map((item, idx) => (
                    <li key={idx}>
                      {item.cardName} · {item.purchaseDescription} ({item.installmentNumber}/{item.installmentsTotal}) —{" "}
                      <Money value={item.amount} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
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
        .select({ monthlyIncome: users.monthlyIncome, whatsappPhone: users.whatsappPhone })
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

  const livePreview = computeMonthClosingSnapshot({
    yearMonth: thisMonth,
    income,
    transactions: inputs.transactions,
    cardInstallments: inputs.cardInstallments,
    fixedAccountsTotal: inputs.fixedAccountsTotal,
    investmentsTotal: inputs.investmentsByYearMonth(thisMonth),
  });

  const alreadyClosedThisMonth = closings.some((c) => c.yearMonth === thisMonth);

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
          Comando por WhatsApp <span className="font-normal text-navy-500">(em preparação)</span>
        </h2>
        <p className="mb-3 text-sm text-navy-400">
          Vincule seu número para permitir lançar gastos por mensagem quando a integração estiver ativa.
        </p>
        <WhatsappPhoneForm currentPhone={user[0]?.whatsappPhone ?? null} />
      </div>

      <div className="rounded-2xl border p-4 border-navy-800 bg-navy-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-navy-100">
            Prévia — {formatYearMonthBR(thisMonth)}
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
        <h2 className="mb-3 text-lg font-semibold text-navy-100">Fechar um mês</h2>
        <CloseMonthForm />
      </div>

      {closings.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-navy-100">Histórico de fechamentos</h2>
          {closings.map((c) => {
            const snapshot = JSON.parse(c.snapshot) as MonthClosingSnapshot;
            return (
              <details key={c.id} className="rounded-2xl border p-4 border-navy-800 bg-navy-900">
                <summary className="flex cursor-pointer items-center justify-between">
                  <span className="font-medium">{formatYearMonthBR(c.yearMonth)}</span>
                  <span className="flex items-center gap-3 text-sm text-navy-400">
                    <Money value={snapshot.totalSpent} /> gastos
                    <a
                      href={`/api/fechamento/pdf?yearMonth=${c.yearMonth}`}
                      className="text-xs hover:underline text-blue-400"
                    >
                      exportar PDF
                    </a>
                    <form action={deleteMonthClosing}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="text-xs hover:underline text-red-400">
                        excluir
                      </button>
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
