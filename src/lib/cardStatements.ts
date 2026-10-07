import "server-only";
import { and, eq, gte, lte, isNull, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { creditCards, cardPurchases, cardInstallments, cardStatements, monthClosings } from "@/db/schema";
import { monthBounds, toYearMonth } from "@/lib/business/dates";
import { planSettlement, sumAmounts } from "@/lib/business/cardStatements";

// Operações de fatura do cartão que tocam o banco. TODAS precisam rodar
// dentro de withRLS(userId, ...) — quem chama é responsável por isso (e por
// já ter conferido que o cartão é do usuário, quando o id vem de fora).

/** Recalcula o total gravado de uma fatura a partir das parcelas que estão nela. */
async function recalcStatementTotal(statementId: string) {
  const rows = await db
    .select({ amount: cardInstallments.amount })
    .from(cardInstallments)
    .where(eq(cardInstallments.statementId, statementId));
  await db
    .update(cardStatements)
    .set({ totalAmount: sumAmounts(rows.map((r) => r.amount)).toFixed(2) })
    .where(eq(cardStatements.id, statementId));
}

/** Acha a fatura do cartão com exatamente esse período, ou cria. */
async function getOrCreateStatement(params: {
  cardId: string;
  periodStart: string;
  periodEnd: string;
  closingDate: string;
}): Promise<string> {
  const [existing] = await db
    .select({ id: cardStatements.id })
    .from(cardStatements)
    .where(
      and(
        eq(cardStatements.cardId, params.cardId),
        eq(cardStatements.periodStart, params.periodStart),
        eq(cardStatements.periodEnd, params.periodEnd)
      )
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(cardStatements)
    .values({
      cardId: params.cardId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      closingDate: params.closingDate,
      totalAmount: "0",
    })
    .returning({ id: cardStatements.id });
  return created.id;
}

export type ClosedStatementResult = { statementId: string; count: number; total: number };

/**
 * Fecha a fatura de um cartão para um período: dá baixa em toda parcela em
 * aberto com vencimento dentro dele. Se já existir fatura com exatamente o
 * mesmo período, as parcelas entram nela (em vez de dar erro). Devolve null
 * quando não há nenhuma parcela em aberto no período.
 */
export async function closeStatementForPeriod(params: {
  cardId: string;
  periodStart: string;
  periodEnd: string;
  closingDate: string;
}): Promise<ClosedStatementResult | null> {
  const pending = await db
    .select({ id: cardInstallments.id, amount: cardInstallments.amount })
    .from(cardInstallments)
    .innerJoin(cardPurchases, eq(cardInstallments.cardPurchaseId, cardPurchases.id))
    .where(
      and(
        eq(cardPurchases.cardId, params.cardId),
        gte(cardInstallments.dueDate, params.periodStart),
        lte(cardInstallments.dueDate, params.periodEnd),
        isNull(cardInstallments.statementId)
      )
    );
  if (pending.length === 0) return null;

  const statementId = await getOrCreateStatement(params);
  await db
    .update(cardInstallments)
    .set({ statementId, paid: true })
    .where(
      inArray(
        cardInstallments.id,
        pending.map((p) => p.id)
      )
    );
  await recalcStatementTotal(statementId);

  return { statementId, count: pending.length, total: sumAmounts(pending.map((p) => p.amount)) };
}

/** Datas (menor e maior vencimento) das parcelas em aberto de um cartão — para a mensagem de erro. */
export async function openInstallmentsRange(cardId: string): Promise<{ first: string; last: string; count: number } | null> {
  const rows = await db
    .select({ dueDate: cardInstallments.dueDate })
    .from(cardInstallments)
    .innerJoin(cardPurchases, eq(cardInstallments.cardPurchaseId, cardPurchases.id))
    .where(and(eq(cardPurchases.cardId, cardId), isNull(cardInstallments.statementId)));
  if (rows.length === 0) return null;
  const dates = rows.map((r) => r.dueDate).sort();
  return { first: dates[0], last: dates[dates.length - 1], count: rows.length };
}

/**
 * Encerrar o mês fecha junto a fatura daquele mês em cada cartão do usuário
 * (decisão do Marcelo em 07/10/2026).
 */
export async function closeMonthCardStatements(userId: string, yearMonth: string, closingDate: string) {
  const { start, end } = monthBounds(yearMonth);
  const cards = await db.select({ id: creditCards.id }).from(creditCards).where(eq(creditCards.userId, userId));
  for (const card of cards) {
    await closeStatementForPeriod({ cardId: card.id, periodStart: start, periodEnd: end, closingDate });
  }
}

export type SettledInstallment = { dueDate: string; amount: number; periodStart: string; periodEnd: string };

/**
 * Dá baixa, na hora, nas parcelas em aberto de um cartão que caem em
 * período já fechado (fatura do cartão ou mês encerrado). Chamada depois de
 * criar/editar uma compra. Com `purchaseId`, olha só as parcelas dessa
 * compra.
 */
export async function settleInstallmentsInClosedPeriods(params: {
  userId: string;
  cardId: string;
  purchaseId?: string;
  closingDate: string;
}): Promise<SettledInstallment[]> {
  const { userId, cardId, purchaseId, closingDate } = params;

  const [open, statements, closings] = await Promise.all([
    db
      .select({ id: cardInstallments.id, dueDate: cardInstallments.dueDate, amount: cardInstallments.amount })
      .from(cardInstallments)
      .innerJoin(cardPurchases, eq(cardInstallments.cardPurchaseId, cardPurchases.id))
      .where(
        and(
          eq(cardPurchases.cardId, cardId),
          isNull(cardInstallments.statementId),
          purchaseId ? eq(cardInstallments.cardPurchaseId, purchaseId) : undefined
        )
      ),
    db
      .select({ id: cardStatements.id, periodStart: cardStatements.periodStart, periodEnd: cardStatements.periodEnd })
      .from(cardStatements)
      .where(eq(cardStatements.cardId, cardId)),
    db.select({ yearMonth: monthClosings.yearMonth }).from(monthClosings).where(eq(monthClosings.userId, userId)),
  ]);
  if (open.length === 0) return [];

  const plan = planSettlement({
    openInstallments: open.map((i) => ({ id: i.id, dueDate: i.dueDate, amount: Number(i.amount) })),
    statements,
    closedMonths: closings.map((c) => c.yearMonth),
  });
  if (plan.length === 0) return [];

  const touched = new Set<string>();
  const settled: SettledInstallment[] = [];
  for (const item of plan) {
    const statementId =
      item.target.kind === "statement"
        ? item.target.statementId
        : await getOrCreateStatement({
            cardId,
            periodStart: item.target.periodStart,
            periodEnd: item.target.periodEnd,
            closingDate,
          });
    await db.update(cardInstallments).set({ statementId, paid: true }).where(eq(cardInstallments.id, item.installment.id));
    touched.add(statementId);
    settled.push({
      dueDate: item.installment.dueDate,
      amount: item.installment.amount,
      periodStart: item.target.periodStart,
      periodEnd: item.target.periodEnd,
    });
  }
  for (const statementId of touched) {
    await recalcStatementTotal(statementId);
  }
  return settled;
}

/** Aplica settleInstallmentsInClosedPeriods em todos os cartões do usuário. */
export async function settleAllCardsInClosedPeriods(userId: string, closingDate: string) {
  const cards = await db.select({ id: creditCards.id }).from(creditCards).where(eq(creditCards.userId, userId));
  for (const card of cards) {
    await settleInstallmentsInClosedPeriods({ userId, cardId: card.id, closingDate });
  }
}

/** Depois de apagar/editar uma compra: corrige o total das faturas do cartão e remove as que ficaram vazias. */
export async function refreshCardStatements(cardId: string) {
  const statements = await db.select({ id: cardStatements.id }).from(cardStatements).where(eq(cardStatements.cardId, cardId));
  for (const s of statements) {
    const rows = await db
      .select({ amount: cardInstallments.amount })
      .from(cardInstallments)
      .where(eq(cardInstallments.statementId, s.id));
    if (rows.length === 0) {
      await db.delete(cardStatements).where(eq(cardStatements.id, s.id));
    } else {
      await db
        .update(cardStatements)
        .set({ totalAmount: sumAmounts(rows.map((r) => r.amount)).toFixed(2) })
        .where(eq(cardStatements.id, s.id));
    }
  }
}

export type ReopenResult = { ok: true } | { ok: false; error: string };

/**
 * Reabre uma fatura fechada: as parcelas dela voltam para "em aberto".
 * Não deixa reabrir enquanto alguma parcela dela estiver em mês encerrado
 * no Fechamento — mês encerrado mantém a fatura fechada; primeiro reabre o
 * mês.
 */
export async function reopenStatement(userId: string, statementId: string): Promise<ReopenResult> {
  const [statement] = await db
    .select({ id: cardStatements.id })
    .from(cardStatements)
    .innerJoin(creditCards, eq(cardStatements.cardId, creditCards.id))
    .where(and(eq(cardStatements.id, statementId), eq(creditCards.userId, userId)))
    .limit(1);
  if (!statement) return { ok: false, error: "Fatura não encontrada." };

  const [installments, closings] = await Promise.all([
    db.select({ dueDate: cardInstallments.dueDate }).from(cardInstallments).where(eq(cardInstallments.statementId, statementId)),
    db.select({ yearMonth: monthClosings.yearMonth }).from(monthClosings).where(eq(monthClosings.userId, userId)),
  ]);
  const closed = new Set(closings.map((c) => c.yearMonth));
  const blockedMonth = installments.map((i) => toYearMonth(i.dueDate)).find((ym) => closed.has(ym));
  if (blockedMonth) {
    const [y, m] = blockedMonth.split("-");
    return {
      ok: false,
      error: `Esta fatura tem parcelas de ${m}/${y}, mês que está encerrado. Reabra o mês na aba Fechamento antes de reabrir a fatura.`,
    };
  }

  // A FK só zera o statement_id; o "paga" precisa voltar junto.
  await db.update(cardInstallments).set({ statementId: null, paid: false }).where(eq(cardInstallments.statementId, statementId));
  await db.delete(cardStatements).where(eq(cardStatements.id, statementId));
  return { ok: true };
}
