export function formatBRL(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateBR(dateStr: string): string {
  // dateStr no formato "YYYY-MM-DD" (sem hora) — monta a data manualmente
  // para não sofrer o típico bug de fuso horário do `new Date("YYYY-MM-DD")`.
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

const MONTH_LABELS_PT: Record<string, string> = {
  "01": "Janeiro",
  "02": "Fevereiro",
  "03": "Março",
  "04": "Abril",
  "05": "Maio",
  "06": "Junho",
  "07": "Julho",
  "08": "Agosto",
  "09": "Setembro",
  "10": "Outubro",
  "11": "Novembro",
  "12": "Dezembro",
};

export function formatYearMonthBR(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  return `${MONTH_LABELS_PT[m] ?? m} de ${y}`;
}

/** Dia e horário no fuso de São Paulo — usado no painel administrativo (último acesso). */
export function formatDateTimeBR(date: Date): string {
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
