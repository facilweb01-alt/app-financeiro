import { verifySession } from "@/lib/dal";
import { db, withRLS } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { loadClosingInputsForUser, listMonthClosingsForUser } from "@/lib/queries/monthClosing";
import { computeMonthClosingSnapshot, type MonthClosingSnapshot } from "@/lib/business/monthClosing";
import { currentYearMonth } from "@/lib/business/dates";
import { formatBRL, formatYearMonthBR } from "@/lib/format";
import { IncomeForm } from "./IncomeForm";
import { CloseMonthForm } from "./CloseMonthForm";
import { WhatsappPhoneForm } from "./WhatsappPhoneForm";
import { deleteMonthClosing } from "@/app/actions/monthClosing";

function SnapshotView({ snapshot }: { snapshot: MonthClosingSnapshot }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total gasto" value={formatBRL(snapshot.totalSpent)} />
        <Stat
          label="% da renda"
          value={snapshot.totalPercentOfIncome === null ? "—" : `${snapshot.totalPercentOfIncome}%`}
        />
        <Stat label="Contas fixas" value={formatBRL(snapshot.fixedAccountsTotal)} />
        <Stat label="Investido no mês" value={formatBRL(snapshot.investmentsTotal)} />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Por categoria</h3>
        {snapshot.categoryTotals.length === 0 ? (
          <p className="text-sm text-slate-400">Sem lançamentos nesse mês.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {snapshot.categoryTotals.map((c) => (
              <li key={c.categoryKey} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950/50">
                <span>{c.categoryLabel}</span>
                <span>
                  <span className="font-medium">{formatBRL(c.amount)}</span>
                  {c.percentOfIncome !== null && (
                    <span className="ml-2 text-xs text-slate-500">({c.percentOfIncome}% da renda)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Parcelas e valores a vencer nos próximos meses
        </h3>
        {snapshot.pendingByFutureMonth.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma parcela pendente para os próximos meses.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {snapshot.pendingByFutureMonth.map((bucket) => (
              <li key={bucket.yearMonth} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{formatYearMonthBR(bucket.yearMonth)}</span>
                  <span>{formatBRL(bucket.amount)}</span>
                </div>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-slate-500">
                  {bucket.items.map((item, idx) => (
                    <li key={idx}>
                      {item.cardName} · {item.purchaseDescription} ({item.installmentNumber}/{item.installmentsTotal}) —{" "}
                      {formatBRL(item.amount)}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

export default async function FechamentoPage() {
  const session = await verifySession();

  const [user, inputs, closings] = await withRLS(session.userId, () =>
    Promise.all([
      db
        .select({ monthlyIncome: users.monthlyIncome, whatsappPhone: users.whatsappPhone })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1),
      loadClosingInputsForUser(session.userId),
      listMonthClosingsForUser(session.userId),
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
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Fechamento mensal</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Veja o resumo do mês, feche quando quiser (fica salvo como histórico) e acompanhe o que ainda vai vencer.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <IncomeForm currentIncome={income} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
          Comando por WhatsApp <span className="font-normal text-slate-400">(em preparação)</span>
        </h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Vincule seu número para permitir lançar gastos por mensagem quando a integração estiver ativa.
        </p>
        <WhatsappPhoneForm currentPhone={user[0]?.whatsappPhone ?? null} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Prévia — {formatYearMonthBR(thisMonth)}
          </h2>
          {alreadyClosedThisMonth ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Este mês já foi fechado
            </span>
          ) : null}
        </div>
        <SnapshotView snapshot={livePreview} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">Fechar um mês</h2>
        <CloseMonthForm />
      </div>

      {closings.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Histórico de fechamentos</h2>
          {closings.map((c) => {
            const snapshot = JSON.parse(c.snapshot) as MonthClosingSnapshot;
            return (
              <details key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <summary className="flex cursor-pointer items-center justify-between">
                  <span className="font-medium">{formatYearMonthBR(c.yearMonth)}</span>
                  <span className="flex items-center gap-3 text-sm text-slate-500">
                    {formatBRL(snapshot.totalSpent)} gastos
                    <form action={deleteMonthClosing}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
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
