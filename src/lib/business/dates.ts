// Utilidades de data. Trabalhamos com datas "puras" (ano-mês-dia, sem fuso
// horário/hora) representadas como string "YYYY-MM-DD", que é o formato que
// o Postgres "date" e os campos <input type="date"> do navegador usam — isso
// evita bugs clássicos de fuso horário deslocando o dia em +-1.

export function toYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM-DD" -> "YYYY-MM"
}

export function parseYearMonth(yearMonth: string): { year: number; month: number } {
  const [year, month] = yearMonth.split("-").map(Number);
  return { year, month };
}

export function compareYearMonth(a: string, b: string): number {
  return a.localeCompare(b);
}

function daysInMonth(year: number, month1To12: number): number {
  // dia 0 do mês seguinte = último dia do mês atual
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

/**
 * Soma N meses a uma data "YYYY-MM-DD", preservando o dia do mês quando
 * possível e "grudando" no último dia do mês quando o mês de destino é mais
 * curto (ex: 31/01 + 1 mês = 28/02 ou 29/02, nunca 03/03).
 */
export function addMonthsClamped(dateStr: string, monthsToAdd: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const totalMonths = (y * 12 + (m - 1)) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth1To12 = (totalMonths % 12) + 1;
  const lastDay = daysInMonth(targetYear, targetMonth1To12);
  const targetDay = Math.min(d, lastDay);
  return `${targetYear.toString().padStart(4, "0")}-${targetMonth1To12
    .toString()
    .padStart(2, "0")}-${targetDay.toString().padStart(2, "0")}`;
}

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
}
