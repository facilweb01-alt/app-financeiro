import Link from "next/link";
import { getCurrentUser, verifySession } from "@/lib/dal";
import { withRLS } from "@/db/client";
import { loadClosingInputsForUser } from "@/lib/queries/monthClosing";
import { computeMonthClosingSnapshot } from "@/lib/business/monthClosing";
import { currentYearMonth } from "@/lib/business/dates";
import { formatBRL, formatYearMonthBR } from "@/lib/format";
import { CategoryPieChart, FutureMonthsBarChart } from "@/components/DashboardCharts";

export default async function DashboardPage() {
  const session = await verifySession();
  const [user, inputs] = await Promise.all([
    getCurrentUser(),
    withRLS(session.userId, () => loadClosingInputsForUser(session.userId)),
  ]);

  const income = Number(user?.monthlyIncome ?? 0);
  const yearMonth = currentYearMonth();

  const snapshot = computeMonthClosingSnapshot({
    yearMonth,
    income,
    transactions: inputs.transactions,
    cardInstallments: inputs.cardInstallments,
    fixedAccountsTotal: inputs.fixedAccountsTotal,
    investmentsTotal: inputs.investmentsByYearMonth(yearMonth),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Olá, {user?.name?.split(" ")[0] ?? ""}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Resumo de {formatYearMonthBR(yearMonth)}.
          {income === 0 && (
            <>
              {" "}
              Defina sua renda mensal na aba{" "}
              <Link href="/fechamento" className="font-medium text-emerald-700 dark:text-emerald-400">
                Fechamento
              </Link>{" "}
              para ver os percentuais.
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Gasto no mês" value={formatBRL(snapshot.totalSpent)} />
        <StatCard label="% da renda" value={snapshot.totalPercentOfIncome === null ? "—" : `${snapshot.totalPercentOfIncome}%`} />
        <StatCard label="Contas fixas" value={formatBRL(snapshot.fixedAccountsTotal)} />
        <StatCard label="Investido no mês" value={formatBRL(snapshot.investmentsTotal)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Gastos por categoria</h2>
          <CategoryPieChart data={snapshot.categoryTotals} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Parcelas e contas a vencer nos próximos meses
          </h2>
          <FutureMonthsBarChart data={snapshot.pendingByFutureMonth} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <QuickLink href="/lancamentos" label="Novo lançamento" icon="🧾" />
        <QuickLink href="/cartoes" label="Cartões" icon="💳" />
        <QuickLink href="/investimentos" label="Investimentos" icon="📈" />
        <QuickLink href="/contas-fixas" label="Contas fixas" icon="🏠" />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
    >
      <span aria-hidden>{icon}</span>
      {label}
    </Link>
  );
}
