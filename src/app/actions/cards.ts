"use server";

import * as z from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withRLS } from "@/db/client";
import { creditCards, cardPurchases, cardInstallments } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import { generateInstallments } from "@/lib/business/installments";
import {
  closeStatementForPeriod,
  openInstallmentsRange,
  refreshCardStatements,
  reopenStatement,
  settleInstallmentsInClosedPeriods,
  type SettledInstallment,
} from "@/lib/cardStatements";
import { monthBounds, todaySaoPaulo } from "@/lib/business/dates";
import { sumAmounts } from "@/lib/business/cardStatements";
import { firstDueDateForPurchase, hasCardCycle } from "@/lib/business/cardCycle";
import { formatBRL, formatDateBR, formatYearMonthBR } from "@/lib/format";
import type { SimpleFormState } from "@/lib/form-state";

function revalidateCardViews() {
  revalidatePath("/cartoes");
  revalidatePath("/dashboard");
  revalidatePath("/fechamento");
}

/** Aviso de que parte da compra já recebeu baixa por cair em período fechado. */
function settledNotice(settled: SettledInstallment[], installmentsTotal: number): string | undefined {
  if (settled.length === 0) return undefined;
  const total = formatBRL(sumAmounts(settled.map((s) => s.amount)));
  const periods = Array.from(new Set(settled.map((s) => `${formatDateBR(s.periodStart)} a ${formatDateBR(s.periodEnd)}`))).join("; ");
  const what =
    settled.length === installmentsTotal
      ? installmentsTotal === 1
        ? "A compra vence"
        : "Todas as parcelas vencem"
      : `${settled.length} de ${installmentsTotal} parcelas (${total}) vencem`;
  return `${what} em período de fatura já fechada (${periods}) e entrou direto nela, sem somar em outro mês. Veja em "Faturas fechadas".`;
}

// ---------------------------------------------------------------------------
// Cartão
// ---------------------------------------------------------------------------
// Dia do fechamento e do vencimento: os dois juntos (1–31) ou nenhum.
const cycleDay = z.preprocess(
  (v) => (v === null || v === undefined || String(v).trim() === "" ? null : Number(v)),
  z.number().int("Dia inválido.").min(1, "O dia vai de 1 a 31.").max(31, "O dia vai de 1 a 31.").nullable()
);

const CardSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome do cartão."),
    closingDay: cycleDay,
    dueDay: cycleDay,
  })
  .refine((d) => (d.closingDay === null) === (d.dueDay === null), {
    message: "Informe o dia do fechamento e o dia do vencimento (os dois).",
  });

function parseCardForm(formData: FormData) {
  return CardSchema.safeParse({
    name: formData.get("name"),
    closingDay: formData.get("closingDay"),
    dueDay: formData.get("dueDay"),
  });
}

export async function createCard(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();
  const parsed = parseCardForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { name, closingDay, dueDay } = parsed.data;
  await withRLS(session.userId, () => db.insert(creditCards).values({ userId: session.userId, name, closingDay, dueDay }));
  revalidatePath("/cartoes");
  return { ok: true };
}

/** Editar nome, dia do fechamento e dia do vencimento de um cartão. Não mexe em compras já lançadas. */
export async function updateCard(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  const parsed = parseCardForm(formData);
  if (!id) return { ok: false, error: "Cartão não encontrado." };
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { name, closingDay, dueDay } = parsed.data;
  const updated = await withRLS(session.userId, () =>
    db
      .update(creditCards)
      .set({ name, closingDay, dueDay })
      .where(and(eq(creditCards.id, id), eq(creditCards.userId, session.userId)))
      .returning({ id: creditCards.id })
  );
  if (updated.length === 0) return { ok: false, error: "Cartão não encontrado." };
  revalidateCardViews();
  return { ok: true, notice: "Cartão atualizado. Vale para as próximas compras; as já lançadas não mudam." };
}

export async function deleteCard(formData: FormData) {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await withRLS(session.userId, () =>
    db.delete(creditCards).where(and(eq(creditCards.id, id), eq(creditCards.userId, session.userId)))
  );
  revalidateCardViews();
}

// ---------------------------------------------------------------------------
// Compra no cartão (gera as parcelas automaticamente)
// ---------------------------------------------------------------------------
const CardPurchaseSchema = z.object({
  cardId: z.string().min(1),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data da compra inválida."),
  // Vazio = calcular pelo dia de fechamento/vencimento do cartão.
  firstDueDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento inválida.")]),
  description: z.string().trim().min(1, "Informe a descrição da compra."),
  categoryId: z.string().optional(),
  totalAmount: z.coerce.number().positive("Valor precisa ser maior que zero."),
  installmentsTotal: z.coerce.number().int().min(1).max(48, "Máximo de 48 parcelas."),
});

export async function createCardPurchase(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();

  const parsed = CardPurchaseSchema.safeParse({
    cardId: formData.get("cardId"),
    purchaseDate: formData.get("purchaseDate"),
    firstDueDate: formData.get("firstDueDate") ?? "",
    description: formData.get("description"),
    categoryId: formData.get("categoryId") || undefined,
    totalAmount: formData.get("totalAmount"),
    installmentsTotal: formData.get("installmentsTotal"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const result = await withRLS(session.userId, async (): Promise<{ ok: true; notice?: string } | { ok: false; error: string }> => {
    // Garante que o cartão pertence ao usuário logado.
    const [card] = await db
      .select({ id: creditCards.id, closingDay: creditCards.closingDay, dueDay: creditCards.dueDay })
      .from(creditCards)
      .where(and(eq(creditCards.id, data.cardId), eq(creditCards.userId, session.userId)))
      .limit(1);
    if (!card) {
      return { ok: false, error: "Cartão não encontrado." };
    }

    // 1º vencimento: o informado; vazio = calculado pelo fechamento/vencimento do cartão.
    let firstDueDate = data.firstDueDate;
    if (!firstDueDate) {
      if (!hasCardCycle(card)) {
        return {
          ok: false,
          error: "Informe o 1º vencimento (ou cadastre o dia do fechamento e do vencimento do cartão para o app calcular sozinho).",
        };
      }
      firstDueDate = firstDueDateForPurchase(data.purchaseDate, card);
    }

    let generated;
    try {
      generated = generateInstallments({
        totalAmount: data.totalAmount,
        installmentsTotal: data.installmentsTotal,
        firstDueDate,
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Não foi possível gerar as parcelas." };
    }

    const [purchase] = await db
      .insert(cardPurchases)
      .values({
        cardId: data.cardId,
        purchaseDate: data.purchaseDate,
        description: data.description,
        categoryId: data.categoryId || null,
        totalAmount: data.totalAmount.toString(),
        installmentsTotal: data.installmentsTotal,
      })
      .returning({ id: cardPurchases.id });

    await db.insert(cardInstallments).values(
      generated.map((inst) => ({
        cardPurchaseId: purchase.id,
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDate,
        amount: inst.amount.toString(),
      }))
    );

    // Parcela que vence em período já fechado (fatura do cartão ou mês
    // encerrado) recebe baixa na hora nesse mesmo período.
    const settled = await settleInstallmentsInClosedPeriods({
      userId: session.userId,
      cardId: data.cardId,
      purchaseId: purchase.id,
      closingDate: todaySaoPaulo(),
    });

    return { ok: true, notice: settledNotice(settled, data.installmentsTotal) };
  });

  if (result.ok) {
    revalidateCardViews();
  }
  return result;
}

// ---------------------------------------------------------------------------
// Editar compra já lançada (corrigir erro de digitação sem apagar e
// recriar). Se a compra já tem alguma parcela paga ou já incluída numa
// fatura fechada, valor e nº de parcelas ficam travados (mexer neles
// exigiria decidir o que fazer com dinheiro já contabilizado) — só
// descrição, categoria e data da compra continuam editáveis nesse caso.
// Sem parcela travada, a edição regenera as parcelas do zero com os novos
// valores, exatamente como uma compra nova.
// ---------------------------------------------------------------------------
const EditCardPurchaseSchema = z.object({
  id: z.string().min(1),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data da compra inválida."),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento inválida."),
  description: z.string().trim().min(1, "Informe a descrição da compra."),
  categoryId: z.string().optional(),
  totalAmount: z.coerce.number().positive("Valor precisa ser maior que zero."),
  installmentsTotal: z.coerce.number().int().min(1).max(48, "Máximo de 48 parcelas."),
});

export async function updateCardPurchase(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();

  const parsed = EditCardPurchaseSchema.safeParse({
    id: formData.get("id"),
    purchaseDate: formData.get("purchaseDate"),
    firstDueDate: formData.get("firstDueDate"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId") || undefined,
    totalAmount: formData.get("totalAmount"),
    installmentsTotal: formData.get("installmentsTotal"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const result = await withRLS(session.userId, async (): Promise<{ ok: true; notice?: string } | { ok: false; error: string }> => {
    // Garante que a compra pertence a um cartão do usuário logado, e traz o
    // estado atual pra decidir se dá pra mexer em valor/parcelas.
    const [purchase] = await db
      .select({
        id: cardPurchases.id,
        cardId: cardPurchases.cardId,
        totalAmount: cardPurchases.totalAmount,
        installmentsTotal: cardPurchases.installmentsTotal,
      })
      .from(cardPurchases)
      .innerJoin(creditCards, eq(cardPurchases.cardId, creditCards.id))
      .where(and(eq(cardPurchases.id, data.id), eq(creditCards.userId, session.userId)))
      .limit(1);

    if (!purchase) {
      return { ok: false, error: "Compra não encontrada." };
    }

    const existingInstallments = await db
      .select({ id: cardInstallments.id, paid: cardInstallments.paid, statementId: cardInstallments.statementId })
      .from(cardInstallments)
      .where(eq(cardInstallments.cardPurchaseId, data.id));

    const hasLockedInstallment = existingInstallments.some((i) => i.paid || i.statementId !== null);
    const changedValueOrInstallments =
      Number(purchase.totalAmount) !== data.totalAmount || purchase.installmentsTotal !== data.installmentsTotal;

    if (hasLockedInstallment && changedValueOrInstallments) {
      return {
        ok: false,
        error:
          "Essa compra já tem parcela em fatura fechada: não dá para mudar valor nem parcelas. Só descrição, categoria e data da compra podem ser editadas. Para mudar o valor, reabra a fatura em \"Faturas fechadas\" ou exclua a compra e lance de novo.",
      };
    }

    await db
      .update(cardPurchases)
      .set({
        purchaseDate: data.purchaseDate,
        description: data.description,
        categoryId: data.categoryId || null,
        totalAmount: data.totalAmount.toString(),
        installmentsTotal: data.installmentsTotal,
      })
      .where(eq(cardPurchases.id, data.id));

    // Sem parcela travada: regenera todas as parcelas do zero (mesma lógica
    // de uma compra nova), já que nada foi faturado ainda.
    if (hasLockedInstallment) {
      return { ok: true };
    }

    let generated;
    try {
      generated = generateInstallments({
        totalAmount: data.totalAmount,
        installmentsTotal: data.installmentsTotal,
        firstDueDate: data.firstDueDate,
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Não foi possível gerar as parcelas." };
    }

    await db.delete(cardInstallments).where(eq(cardInstallments.cardPurchaseId, data.id));
    await db.insert(cardInstallments).values(
      generated.map((inst) => ({
        cardPurchaseId: data.id,
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDate,
        amount: inst.amount.toString(),
      }))
    );

    // Se o novo vencimento cair em período já fechado, a baixa é na hora.
    const settled = await settleInstallmentsInClosedPeriods({
      userId: session.userId,
      cardId: purchase.cardId,
      purchaseId: data.id,
      closingDate: todaySaoPaulo(),
    });

    return { ok: true, notice: settledNotice(settled, data.installmentsTotal) };
  });

  if (result.ok) {
    revalidateCardViews();
  }
  return result;
}

export async function deleteCardPurchase(formData: FormData) {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await withRLS(session.userId, async () => {
    // Confere que a compra pertence a um cartão do usuário logado antes de apagar.
    const [purchase] = await db
      .select({ id: cardPurchases.id, cardId: cardPurchases.cardId })
      .from(cardPurchases)
      .innerJoin(creditCards, eq(cardPurchases.cardId, creditCards.id))
      .where(and(eq(cardPurchases.id, id), eq(creditCards.userId, session.userId)))
      .limit(1);

    if (purchase) {
      await db.delete(cardPurchases).where(eq(cardPurchases.id, id));
      // A compra podia ter parcela dentro de fatura fechada: corrige o
      // total dessas faturas (e some com a fatura que ficou vazia).
      await refreshCardStatements(purchase.cardId);
    }
  });

  revalidateCardViews();
}

// ---------------------------------------------------------------------------
// Fechamento de fatura. Duas formas:
// - por mês, com um clique ("Fechar fatura de outubro"): período = o mês
//   inteiro;
// - manual, "de tal data até tal data" (pode atravessar meses, ex.: 01/09 a
//   10/10).
// Nos dois casos entra toda parcela em aberto com VENCIMENTO dentro do
// período; ela recebe baixa, sai da lista de parcelas em aberto e a fatura
// vira relatório.
// ---------------------------------------------------------------------------
async function ownsCard(userId: string, cardId: string): Promise<boolean> {
  const [card] = await db
    .select({ id: creditCards.id })
    .from(creditCards)
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, userId)))
    .limit(1);
  return Boolean(card);
}

const StatementSchema = z.object({
  cardId: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inicial inválida."),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data final inválida."),
  closingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de fechamento inválida.").optional(),
});

export async function createCardStatement(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();

  const parsed = StatementSchema.safeParse({
    cardId: formData.get("cardId"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    closingDate: formData.get("closingDate") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  if (data.periodStart > data.periodEnd) {
    return { ok: false, error: "A data inicial precisa ser antes (ou igual) da data final." };
  }

  const result = await withRLS(session.userId, async (): Promise<SimpleFormState> => {
    if (!(await ownsCard(session.userId, data.cardId))) {
      return { ok: false, error: "Cartão não encontrado." };
    }

    const closed = await closeStatementForPeriod({
      cardId: data.cardId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      closingDate: data.closingDate ?? todaySaoPaulo(),
    });

    if (!closed) {
      // Mensagem que ajuda a acertar o período: a fatura olha o VENCIMENTO
      // da parcela, não a data da compra.
      const range = await openInstallmentsRange(data.cardId);
      const period = `${formatDateBR(data.periodStart)} e ${formatDateBR(data.periodEnd)}`;
      if (!range) {
        return { ok: false, error: "Este cartão não tem nenhuma parcela em aberto: tudo já está em fatura fechada." };
      }
      return {
        ok: false,
        error: `Nenhuma parcela em aberto vence entre ${period}. A fatura considera a data de VENCIMENTO da parcela (não a data da compra). As parcelas em aberto deste cartão vencem de ${formatDateBR(range.first)} a ${formatDateBR(range.last)}.`,
      };
    }

    return {
      ok: true,
      notice: `Fatura fechada: ${closed.count} ${closed.count === 1 ? "parcela" : "parcelas"}, total de ${formatBRL(closed.total)}.`,
    };
  });

  if (result?.ok) {
    revalidateCardViews();
  }
  return result;
}

const MonthStatementSchema = z.object({
  cardId: z.string().min(1),
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido."),
});

/** "Fechar fatura de <mês>" com um clique: todas as parcelas em aberto que vencem naquele mês. */
export async function closeCardMonthStatement(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();
  const parsed = MonthStatementSchema.safeParse({ cardId: formData.get("cardId"), yearMonth: formData.get("yearMonth") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { cardId, yearMonth } = parsed.data;
  const { start, end } = monthBounds(yearMonth);

  const result = await withRLS(session.userId, async (): Promise<SimpleFormState> => {
    if (!(await ownsCard(session.userId, cardId))) {
      return { ok: false, error: "Cartão não encontrado." };
    }
    const closed = await closeStatementForPeriod({ cardId, periodStart: start, periodEnd: end, closingDate: todaySaoPaulo() });
    if (!closed) {
      return { ok: false, error: `Não há parcela em aberto vencendo em ${formatYearMonthBR(yearMonth)}.` };
    }
    return {
      ok: true,
      notice: `Fatura de ${formatYearMonthBR(yearMonth)} fechada: ${closed.count} ${closed.count === 1 ? "parcela" : "parcelas"}, total de ${formatBRL(closed.total)}.`,
    };
  });

  if (result?.ok) {
    revalidateCardViews();
  }
  return result;
}

/** Reabre uma fatura fechada (as parcelas voltam para "em aberto"). */
export async function reopenCardStatement(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const session = await verifySession();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Fatura não encontrada." };

  const result = await withRLS(session.userId, () => reopenStatement(session.userId, id));
  if (result.ok) {
    revalidateCardViews();
  }
  return result;
}
