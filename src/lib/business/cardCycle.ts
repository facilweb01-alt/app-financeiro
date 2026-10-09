// Ciclo da fatura do cartão (pedido do Marcelo em 09/10/2026): com o dia do
// fechamento e o dia do vencimento cadastrados no cartão, a compra é lançada
// só com a DATA DA COMPRA e o 1º vencimento sai daqui.
//
// Regra (a mesma dos bancos):
//   - a fatura fecha no "dia do fechamento" de cada mês;
//   - compra feita ANTES do dia do fechamento entra na fatura que fecha neste
//     mês; compra feita NO dia do fechamento ou depois vai para a fatura que
//     fecha no mês seguinte;
//   - a fatura vence no "dia do vencimento" depois do fechamento: no mesmo
//     mês do fechamento se o dia do vencimento for maior que o do
//     fechamento; senão, no mês seguinte.
//   - Dia que não existe no mês (31 em abril, 30 em fevereiro) vira o último
//     dia do mês.
//
// Função pura (sem banco), usada no servidor e no formulário do navegador.

export type CardCycle = { closingDay: number; dueDay: number };

function lastDayOfMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

function shiftMonth(year: number, month1To12: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month1To12 - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function isoDate(year: number, month1To12: number, day: number): string {
  const d = Math.min(day, lastDayOfMonth(year, month1To12));
  return `${String(year).padStart(4, "0")}-${String(month1To12).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isValidCycleDay(day: unknown): day is number {
  return typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 31;
}

/** O cartão tem fechamento e vencimento cadastrados (os dois válidos)? */
export function hasCardCycle(card: { closingDay: number | null; dueDay: number | null }): card is CardCycle {
  return isValidCycleDay(card.closingDay) && isValidCycleDay(card.dueDay);
}

/** Data (YYYY-MM-DD) em que fecha a fatura onde a compra entra. */
export function statementClosingDateForPurchase(purchaseDate: string, cycle: CardCycle): string {
  const [y, m, d] = purchaseDate.split("-").map(Number);
  const closingThisMonth = Math.min(cycle.closingDay, lastDayOfMonth(y, m));
  const target = d < closingThisMonth ? { year: y, month: m } : shiftMonth(y, m, 1);
  return isoDate(target.year, target.month, cycle.closingDay);
}

/** 1º vencimento (YYYY-MM-DD) de uma compra feita em `purchaseDate`. */
export function firstDueDateForPurchase(purchaseDate: string, cycle: CardCycle): string {
  const closing = statementClosingDateForPurchase(purchaseDate, cycle);
  const [cy, cm] = closing.split("-").map(Number);
  const dueMonth = cycle.dueDay > cycle.closingDay ? { year: cy, month: cm } : shiftMonth(cy, cm, 1);
  return isoDate(dueMonth.year, dueMonth.month, cycle.dueDay);
}

/** Texto curto para a tela: "fecha dia 3 e vence dia 10". */
export function describeCardCycle(cycle: CardCycle): string {
  return `fecha dia ${cycle.closingDay} e vence dia ${cycle.dueDay}`;
}
