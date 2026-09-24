import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentUser, verifySession } from "@/lib/dal";
import { withRLS } from "@/db/client";
import { loadClosingInputsForUser } from "@/lib/queries/monthClosing";
import { listCardsForUser } from "@/lib/queries/cards";
import { computeMonthClosingSnapshot, computeFutureMonthsHorizon } from "@/lib/business/monthClosing";
import { computeSpendingStatus, spendingStatusSentence } from "@/lib/business/spendingStatus";
import { currentYearMonth, addMonthsToYearMonth } from "@/lib/business/dates";
import { formatYearMonthBR, formatBRL } from "@/lib/format";
import { Money } from "@/components/Money";
import { CategoryBarChart, FutureMonthsBarChart } from "@/components/DashboardCharts";
import { TiltCard } from "@/components/TiltCard";
import { CardPdfPicker } from "@/components/CardPdfPicker";
import { DashboardMonthSelect } from "@/components/DashboardMonthSelect";

// Quantos meses à frente do mês atual o seletor do painel deixa escolher —
// pedido explícito do Marcelo: "colocar no máximo 3 meses pra frente".
const MAX_MONTHS_AHEAD = 3;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const session = await verifySession();
  const [user, inputs, cards] = await Promise.all([
    getCurrentUser(),
    withRLS(session.userId, () => loadClosingInputsForUser(session.userId)),
    withRLS(session.userId, () => listCardsForUser(session.userId)),
  ]);

  const income = Number(user?.monthlyIncome ?? 0);
  const currentMonth = currentYearMonth();

  // Opções do seletor: mês atual + até 3 meses à frente. Se o parâmetro
  // "mes" da URL não bater com nenhuma opção válida (link velho, digitado à
  // mão, etc.), cai de volta pro mês atual em vez de quebrar a página.
  const monthOptions = Array.from({ length: MAX_MONTHS_AHEAD + 1 }, (_, i) => addMonthsToYearMonth(currentMonth, i));
  const requestedMonth = (await searchParams).mes;
  const yearMonth = monthOptions.includes(requestedMonth ?? "") ? (requestedMonth as string) : currentMonth;
  const nextYearMonth = addMonthsToYearMonth(yearMonth, 1);

  const snapshot = computeMonthClosingSnapshot({
    yearMonth,
    income,
    transactions: inputs.transactions,
    cardInstallments: inputs.cardInstallments,
    fixedAccountsTotal: inputs.fixedAccountsTotal,
    investmentsTotal: inputs.investmentsByYearMonth(yearMonth),
  });

  // Mesma conta do mês exibido, mas pro mês seguinte a ele — pedido do
  // Marcelo: "fazer um igual aparecendo os gastos do próximo mês também".
  // Acompanha o mês escolhido no seletor (ex: se o painel está mostrando
  // outubro, aqui aparece novembro), não fica travado no mês seguinte ao de
  // hoje.
  const nextMonthSnapshot = computeMonthClosingSnapshot({
    yearMonth: nextYearMonth,
    income,
    transactions: inputs.transactions,
    cardInstallments: inputs.cardInstallments,
    fixedAccountsTotal: inputs.fixedAccountsTotal,
    investmentsTotal: inputs.investmentsByYearMonth(nextYearMonth),
  });

  // Total comprometido do MÊS EXIBIDO (gasto variável + contas fixas do
  // próprio mês) — igual a `snapshot.totalCommitted`, é sobre esse número
  // que a % de renda logo abaixo é calculada.
  //
  // Bug real reportado pelo Lucas (cliente do Marcelo) em vídeo no
  // WhatsApp em 24/09/2026, um dia depois do PR #7 ir pro ar: esse total
  // (rotulado "comprometidos ESTE MÊS") estava somando também o gasto do
  // mês SEGUINTE, então trocar o seletor de mês inflava o número do mês
  // escolhido com uma fatia do mês de depois — em alguns casos estourando
  // a renda de um mês que, sozinho, nem chegava perto disso. Também batia
  // de frente com a % de renda mostrada bem abaixo, que sempre foi só do
  // mês exibido (nunca somou o mês seguinte) — os dois números não
  // conversavam entre si. "Gasto no mês que vem" continua visível no
  // painel (pedido antigo do Marcelo), mas agora como informação separada,
  // do mesmo jeito que "Investido no mês" já era — nunca dentro do total
  // do mês.
  const combinedTotal = snapshot.totalCommitted;

  // Horizonte de 10 meses pro filtro do gráfico de parcelas a vencer —
  // diferente do `snapshot.pendingByFutureMonth` (que só lista meses com
  // parcela de verdade), esse inclui todo mês do horizonte, mesmo zerado.
  // Também acompanha o mês escolhido no seletor, como base do horizonte.
  const futureMonthsHorizon = computeFutureMonthsHorizon({
    yearMonth,
    cardInstallments: inputs.cardInstallments,
    monthsAhead: 10,
  });

  // Resumo didático do mês (substitui o anel de % + 4 caixinhas) — pedido
  // do Marcelo depois de achar a % "complicada de entender": uma frase em
  // português simples, uma barra de progresso que nunca estoura visualmente
  // e uma barra de composição mostrando de onde vem o total. Ver
  // src/lib/business/spendingStatus.ts para a lógica (mesmas faixas de
  // cor/rótulo que já existiam).
  const spendingStatus = computeSpendingStatus(snapshot.totalPercentOfIncome);
  const spendingSentence = spendingStatusSentence(spendingStatus);
  const percentLine =
    spendingStatus.level === "sem-renda"
      ? null
      : spendingStatus.isExtreme
        ? `Isso é cerca de ${spendingStatus.multiplier}x a renda que você cadastrou.`
        : `${Math.round(snapshot.totalPercentOfIncome ?? 0)}% da sua renda de ${formatBRL(income)}.`;

  // Composição do total comprometido — usada na barra empilhada. Só o
  // gasto do MÊS EXIBIDO e as contas fixas (ver comentário do
  // `combinedTotal` acima); o mês que vem saiu daqui. Guarda contra
  // divisão por zero quando ainda não há nenhum gasto no mês.
  const mix =
    combinedTotal > 0
      ? {
          gastoMesPct: (snapshot.totalSpent / combinedTotal) * 100,
          contasPct: (snapshot.fixedAccountsTotal / combinedTotal) * 100,
        }
      : { gastoMesPct: 0, contasPct: 0 };

  return (
    <div className="relative">
      {/* Manchas de luz decorativas atrás do conteúdo — dão profundidade ao
          fundo sem pesar no carregamento (só cor + blur, nada de imagem). */}
      <div className="mesh-glow -top-16 right-0 h-64 w-64 bg-blue-600" aria-hidden />
      <div className="mesh-glow bottom-10 -left-10 h-56 w-56 bg-indigo-600" aria-hidden />

      <div className="relative flex flex-col gap-6">
        <div className="animate-rise-in flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-navy-100">
              Olá, {user?.name?.split(" ")[0] ?? ""}
            </h1>
            <p className="mt-1 text-sm text-navy-400">
              Resumo de {formatYearMonthBR(yearMonth)}
              {yearMonth === currentMonth ? "" : " (mês selecionado)"}.
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
          <DashboardMonthSelect
            selected={yearMonth}
            options={monthOptions.map((m, i) => ({
              value: m,
              label: i === 0 ? `${formatYearMonthBR(m)} (atual)` : formatYearMonthBR(m),
            }))}
          />
        </div>

        {/* Hero: resumo do mês em português simples — uma frase abrindo o
            card, uma barra de progresso que nunca estoura visualmente (cor
            muda pelas mesmas faixas de sempre) e uma barra de composição
            mostrando de onde vem o total, em vez de 4 caixinhas soltas do
            mesmo tamanho. O total é só do mês exibido (gasto + contas
            fixas); "Gasto no mês que vem" e "Investido" ficam fora dessa
            conta, cada um no seu próprio card informativo abaixo. */}
        <TiltCard className="glass-card animate-rise-in flex flex-col gap-6 rounded-2xl p-5 sm:p-7">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-navy-500">{formatYearMonthBR(yearMonth)}</span>
            <span className="text-2xl font-bold text-navy-100 sm:text-3xl">
              <Money value={combinedTotal} /> comprometidos este mês
            </span>
            <span className="text-sm leading-relaxed" style={{ color: spendingStatus.color }}>
              {spendingSentence}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-navy-500">% da renda comprometida</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${spendingStatus.badgeClass}`}>
                {spendingStatus.label}
              </span>
            </div>
            <div className="h-3.5 w-full overflow-hidden rounded-full bg-navy-800">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${spendingStatus.meterPercent}%`, background: spendingStatus.color }}
              />
            </div>
            {percentLine && <span className="text-xs text-navy-500">{percentLine}</span>}
          </div>

          <div className="border-t border-navy-800/70" />

          <div className="flex flex-col gap-2.5">
            <span className="text-xs text-navy-500">De onde vem esse total</span>
            <div className="flex h-5 gap-0.5 overflow-hidden rounded-lg">
              <div style={{ width: `${mix.gastoMesPct}%`, background: "#60a5fa" }} />
              <div style={{ width: `${mix.contasPct}%`, background: "#2dd4bf" }} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <CompositionLegendItem color="#60a5fa" label="Gasto no mês" value={<Money value={snapshot.totalSpent} />} />
              <CompositionLegendItem
                color="#2dd4bf"
                label="Contas fixas"
                value={<Money value={snapshot.fixedAccountsTotal} />}
              />
            </div>
          </div>

          <div className="border-t border-navy-800/70" />

          {/* Gasto do mês seguinte — informativo, fora da conta do total
              acima (ver comentário do `combinedTotal`). Mesmo tratamento
              visual do card "Investido no mês" logo abaixo, só que roxo
              (mesma cor que esse valor já usava na barra de composição). */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-900/50 bg-violet-950/20 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-400" aria-hidden />
              <span className="text-xs text-violet-200/90 sm:text-sm">
                Gasto no mês que vem ({formatYearMonthBR(nextYearMonth)}) — não entra na conta acima, é só um adiantamento do que já está previsto
              </span>
            </div>
            <span className="shrink-0 text-sm font-bold text-violet-100">
              <Money value={nextMonthSnapshot.totalSpent} />
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
              <span className="text-xs text-emerald-200/90 sm:text-sm">
                Investido no mês — não entra na conta acima, é dinheiro guardado, não gasto
              </span>
            </div>
            <span className="shrink-0 text-sm font-bold text-emerald-100">
              <Money value={snapshot.investmentsTotal} />
            </span>
          </div>
        </TiltCard>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TiltCard className="glass-card animate-rise-in stagger-1 rounded-2xl p-4">
            <h2 className="mb-2 text-sm font-semibold text-navy-300">Gastos por categoria</h2>
            <CategoryBarChart data={snapshot.categoryTotals} items={snapshot.categoryItems} />
          </TiltCard>
          <TiltCard className="glass-card animate-rise-in stagger-2 rounded-2xl p-4">
            <h2 className="mb-2 text-sm font-semibold text-navy-300">
              Parcelas e contas a vencer nos próximos meses
            </h2>
            <FutureMonthsBarChart data={futureMonthsHorizon} />
          </TiltCard>
        </div>

        <TiltCard className="glass-card animate-rise-in stagger-3 rounded-2xl p-4">
          <h2 className="mb-1 text-sm font-semibold text-navy-300">Relatório em PDF por cartão</h2>
          <p className="mb-3 text-xs text-navy-500">
            Escolha um cartão cadastrado para baixar o valor total e a lista de parcelas lançadas.
          </p>
          <CardPdfPicker cards={cards} />
        </TiltCard>

        <div className="animate-rise-in stagger-4 -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <QuickLink href="/lancamentos" label="Novo lançamento" icon="🧾" />
          <QuickLink href="/cartoes" label="Cartões" icon="💳" />
          <QuickLink href="/investimentos" label="Investimentos" icon="📈" />
          <QuickLink href="/contas-fixas" label="Contas fixas" icon="🏠" />
        </div>
      </div>
    </div>
  );
}

function CompositionLegendItem({ color, label, value }: { color: string; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />
      <span className="text-xs text-navy-400">{label}</span>
      <span className="text-xs font-semibold text-navy-100">{value}</span>
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
