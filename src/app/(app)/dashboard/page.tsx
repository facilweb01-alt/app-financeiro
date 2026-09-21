import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentUser, verifySession } from "@/lib/dal";
import { withRLS } from "@/db/client";
import { loadClosingInputsForUser } from "@/lib/queries/monthClosing";
import { computeMonthClosingSnapshot } from "@/lib/business/monthClosing";
import { currentYearMonth } from "@/lib/business/dates";
import { formatYearMonthBR } from "@/lib/format";
import { Money } from "@/components/Money";
import { CategoryBarChart, FutureMonthsBarChart } from "@/components/DashboardCharts";
import { CircularProgress } from "@/components/CircularProgress";
import { TiltCard } from "@/components/TiltCard";

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
    <div className="relative">
      {/* Manchas de luz decorativas atrás do conteúdo — dão profundidade ao
          fundo sem pesar no carregamento (só cor + blur, nada de imagem). */}
      <div className="mesh-glow -top-16 right-0 h-64 w-64 bg-blue-600" aria-hidden />
      <div className="mesh-glow bottom-10 -left-10 h-56 w-56 bg-indigo-600" aria-hidden />

      <div className="relative flex flex-col gap-6">
        <div className="animate-rise-in">
          <h1 className="text-2xl font-semibold text-navy-100">
            Olá, {user?.name?.split(" ")[0] ?? ""}
          </h1>
          <p className="mt-1 text-sm text-navy-400">
            Resumo de {formatYearMonthBR(yearMonth)}.
            {income === 0 && (
              <>
                {" "}
                Defina sua renda mensal na aba{" "}
                <Link href="/fechamento" className="font-medium text-blue-400">
                  Fechamento
                </Link>{" "}
                para ver os percentuais.
              </>
            )}
          </p>
        </div>

        {/* Hero: o indicador mais importante do mês (% da renda comprometida)
            ganha destaque visual em anel, com as demais métricas ao lado —
            em vez de 4 caixinhas do mesmo tamanho competindo por atenção. */}
        <TiltCard className="glass-card animate-rise-in flex flex-col items-center gap-6 rounded-2xl p-5 sm:flex-row sm:items-stretch sm:gap-8">
          <div className="flex flex-col items-center justify-center gap-1 sm:border-r sm:border-navy-800/70 sm:pr-8">
            <CircularProgress percent={snapshot.totalPercentOfIncome} label="da renda" />
            <span className="text-xs text-navy-500">Gastos + contas fixas</span>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat label="Gasto no mês" value={<Money value={snapshot.totalSpent} />} icon="💸" />
            <MiniStat label="Contas fixas" value={<Money value={snapshot.fixedAccountsTotal} />} icon="🏠" />
            <MiniStat label="Investido no mês" value={<Money value={snapshot.investmentsTotal} />} icon="📈" />
          </div>
        </TiltCard>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TiltCard className="glass-card animate-rise-in stagger-1 rounded-2xl p-4">
            <h2 className="mb-2 text-sm font-semibold text-navy-300">Gastos por categoria</h2>
            <CategoryBarChart data={snapshot.categoryTotals} />
          </TiltCard>
          <TiltCard className="glass-card animate-rise-in stagger-2 rounded-2xl p-4">
            <h2 className="mb-2 text-sm font-semibold text-navy-300">
              Parcelas e contas a vencer nos próximos meses
            </h2>
            <FutureMonthsBarChart data={snapshot.pendingByFutureMonth} />
          </TiltCard>
        </div>

        <div className="animate-rise-in stagger-3 -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <QuickLink href="/lancamentos" label="Novo lançamento" icon="🧾" />
          <QuickLink href="/cartoes" label="Cartões" icon="💳" />
          <QuickLink href="/investimentos" label="Investimentos" icon="📈" />
          <QuickLink href="/contas-fixas" label="Contas fixas" icon="🏠" />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col justify-center rounded-xl px-3 py-2.5 transition-transform duration-200 bg-navy-800/60 hover:-translate-y-0.5">
      <div className="flex items-center gap-1.5 text-xs text-navy-400">
        {icon && <span aria-hidden>{icon}</span>}
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold text-navy-100">{value}</div>
    </div>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:text-blue-400 hover:shadow-lg hover:shadow-blue-950/40 border-navy-800 bg-navy-900/80 text-navy-300"
    >
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-full text-sm bg-blue-950/40"
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}
