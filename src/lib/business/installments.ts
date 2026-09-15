import { splitCentsInInstallments, toCents, fromCents } from "./money";
import { addMonthsClamped } from "./dates";

export type GeneratedInstallment = {
  installmentNumber: number;
  dueDate: string; // "YYYY-MM-DD"
  amount: number; // em reais
};

/**
 * Gera as N parcelas de uma compra no cartão, uma por mês, a partir da
 * primeira data de vencimento informada. O valor total é dividido
 * exatamente entre as parcelas (sem perder nem sobrar centavo — ver
 * splitCentsInInstallments).
 *
 * Essas parcelas ficam gravadas desde a criação da compra: é isso que
 * permite, no fechamento do mês, somar automaticamente o que ainda falta
 * pagar nos meses seguintes, sem precisar recalcular nada.
 */
export function generateInstallments(params: {
  totalAmount: number;
  installmentsTotal: number;
  firstDueDate: string; // "YYYY-MM-DD"
}): GeneratedInstallment[] {
  const { totalAmount, installmentsTotal, firstDueDate } = params;

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("Valor total da compra precisa ser maior que zero");
  }
  if (!Number.isInteger(installmentsTotal) || installmentsTotal <= 0) {
    throw new Error("Número de parcelas precisa ser um inteiro maior que zero");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate)) {
    throw new Error("Data de primeiro vencimento inválida (esperado YYYY-MM-DD)");
  }

  const totalCents = toCents(totalAmount);
  const centsPerInstallment = splitCentsInInstallments(totalCents, installmentsTotal);

  return centsPerInstallment.map((cents, index) => ({
    installmentNumber: index + 1,
    dueDate: addMonthsClamped(firstDueDate, index),
    amount: fromCents(cents),
  }));
}
