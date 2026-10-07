// Regras puras (sem banco) do fechamento de fatura do cartão — testadas em
// src/lib/business/__tests__/run-tests.ts.
//
// Modelo (combinado com o Marcelo em 07/10/2026):
// - Fatura fechada = um período "de tal data até tal data" de um cartão.
//   Toda parcela desse cartão com VENCIMENTO dentro do período recebe baixa
//   e sai da lista de parcelas em aberto; a fatura vira relatório.
// - Encerrar o mês no Fechamento fecha junto a fatura daquele mês em cada
//   cartão.
// - Compra lançada depois, com parcela vencendo num período que já foi
//   fechado (fatura ou mês), recebe baixa na hora nesse mesmo período: não
//   vai para o mês seguinte nem soma no mês atual.

import { monthBounds, toYearMonth } from "./dates";
import { toCents, fromCents } from "./money";

export type OpenInstallmentLike = {
  id: string;
  dueDate: string; // "YYYY-MM-DD"
  amount: number;
};

export type StatementPeriodLike = {
  id: string;
  periodStart: string;
  periodEnd: string;
};

export type OpenMonthGroup = {
  yearMonth: string;
  amount: number;
  count: number;
};

/** Soma em centavos, para o total da fatura nunca sair com erro de ponto flutuante. */
export function sumAmounts(amounts: (number | string)[]): number {
  return fromCents(amounts.reduce<number>((sum, a) => sum + toCents(Number(a)), 0));
}

/** Parcelas em aberto agrupadas pelo mês de vencimento, do mais antigo ao mais novo. */
export function groupOpenInstallmentsByMonth(installments: OpenInstallmentLike[]): OpenMonthGroup[] {
  const map = new Map<string, { cents: number; count: number }>();
  for (const inst of installments) {
    const ym = toYearMonth(inst.dueDate);
    const entry = map.get(ym) ?? { cents: 0, count: 0 };
    entry.cents += toCents(inst.amount);
    entry.count += 1;
    map.set(ym, entry);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([yearMonth, v]) => ({ yearMonth, amount: fromCents(v.cents), count: v.count }));
}

/**
 * Fatura fechada que cobre uma data. Se mais de uma cobrir (períodos
 * sobrepostos), vale a que começou por último — a mais específica/recente.
 */
export function findStatementCovering<T extends StatementPeriodLike>(statements: T[], date: string): T | null {
  let best: T | null = null;
  for (const s of statements) {
    if (s.periodStart <= date && date <= s.periodEnd) {
      if (!best || s.periodStart > best.periodStart) best = s;
    }
  }
  return best;
}

export type SettlementTarget =
  | { kind: "statement"; statementId: string; periodStart: string; periodEnd: string }
  | { kind: "closed-month"; yearMonth: string; periodStart: string; periodEnd: string };

export type SettlementPlanItem = { installment: OpenInstallmentLike; target: SettlementTarget };

/**
 * Decide, para cada parcela em aberto, se ela cai num período que já foi
 * fechado — e portanto deve receber baixa na hora:
 * 1. dentro do período de uma fatura já fechada do cartão → entra nela;
 * 2. num mês já encerrado no Fechamento → entra na fatura daquele mês
 *    (criada se ainda não existir).
 * Parcela fora de qualquer período fechado continua em aberto (não aparece
 * no plano).
 */
export function planSettlement(params: {
  openInstallments: OpenInstallmentLike[];
  statements: StatementPeriodLike[];
  closedMonths: string[];
}): SettlementPlanItem[] {
  const closed = new Set(params.closedMonths);
  const plan: SettlementPlanItem[] = [];
  for (const installment of params.openInstallments) {
    const statement = findStatementCovering(params.statements, installment.dueDate);
    if (statement) {
      plan.push({
        installment,
        target: {
          kind: "statement",
          statementId: statement.id,
          periodStart: statement.periodStart,
          periodEnd: statement.periodEnd,
        },
      });
      continue;
    }
    const ym = toYearMonth(installment.dueDate);
    if (closed.has(ym)) {
      const { start, end } = monthBounds(ym);
      plan.push({ installment, target: { kind: "closed-month", yearMonth: ym, periodStart: start, periodEnd: end } });
    }
  }
  return plan;
}

/**
 * Sugestão de 1º vencimento para uma compra nova: hoje — a não ser que hoje
 * já esteja dentro de um período fechado (fatura do cartão ou mês
 * encerrado). Nesse caso sugere o mesmo dia do primeiro mês ainda aberto,
 * para a compra nova não cair, sem querer, numa fatura que já fechou.
 */
export function suggestFirstDueDate(params: {
  today: string;
  statements: StatementPeriodLike[];
  closedMonths: string[];
  addMonths: (date: string, months: number) => string;
}): string {
  const closed = new Set(params.closedMonths);
  for (let i = 0; i <= 12; i++) {
    const candidate = params.addMonths(params.today, i);
    const covered = findStatementCovering(params.statements, candidate) || closed.has(toYearMonth(candidate));
    if (!covered) return candidate;
  }
  return params.today;
}
