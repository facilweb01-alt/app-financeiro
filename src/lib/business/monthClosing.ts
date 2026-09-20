import { toYearMonth, compareYearMonth } from "./dates";

export type TransactionLike = {
  dueDate: string; // "YYYY-MM-DD"
  amount: number;
  categoryKey: string;
  categoryLabel: string;
};

export type CardInstallmentLike = {
  dueDate: string; // "YYYY-MM-DD"
  amount: number;
  categoryKey?: string | null;
  categoryLabel?: string | null;
  cardName: string;
  purchaseDescription: string;
  installmentNumber: number;
  installmentsTotal: number;
};

export type CategoryTotal = {
  categoryKey: string;
  categoryLabel: string;
  amount: number;
  percentOfIncome: number | null; // null quando não há renda informada
};

export type FutureMonthPending = {
  yearMonth: string;
  amount: number;
  items: {
    cardName: string;
    purchaseDescription: string;
    installmentNumber: number;
    installmentsTotal: number;
    amount: number;
  }[];
};

export type MonthClosingSnapshot = {
  yearMonth: string;
  income: number;
  categoryTotals: CategoryTotal[];
  totalSpent: number;
  // Gasto variável (categoryTotals) + contas fixas do mês — é sobre esse
  // total que a % da renda é calculada, já que uma conta fixa também
  // compromete a renda mensal do usuário.
  totalCommitted: number;
  totalPercentOfIncome: number | null;
  fixedAccountsTotal: number;
  investmentsTotal: number;
  // Parcelas de cartão e lançamentos com vencimento em meses futuros (ainda
  // não pagos), já somados por mês — é o que a regra de negócio pede:
  // "identificar as demais faltantes e valores a vencer já somando nos
  // próximos meses".
  pendingByFutureMonth: FutureMonthPending[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcula o snapshot de fechamento de um mês: quanto foi gasto por
 * categoria (com % sobre a renda), total de contas fixas e investimentos
 * no mês, e a projeção de parcelas/lançamentos que ainda vão vencer nos
 * meses seguintes.
 *
 * É uma função pura (sem acesso a banco) para poder ser testada com dados
 * simulados cobrindo os casos de borda: mês sem renda informada, parcela
 * caindo em fevereiro (mês curto), compra parcelada que atravessa o ano.
 */
export function computeMonthClosingSnapshot(params: {
  yearMonth: string; // mês que está sendo fechado, "YYYY-MM"
  income: number;
  transactions: TransactionLike[]; // lançamentos manuais (todas as datas; a função filtra)
  cardInstallments: CardInstallmentLike[]; // todas as parcelas de todos os cartões (passadas, do mês, e futuras)
  fixedAccountsTotal: number;
  investmentsTotal: number;
}): MonthClosingSnapshot {
  const { yearMonth, income, transactions, cardInstallments, fixedAccountsTotal, investmentsTotal } = params;

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new Error("yearMonth inválido (esperado YYYY-MM)");
  }

  const categoryMap = new Map<string, CategoryTotal>();
  const addToCategory = (key: string, label: string, amount: number) => {
    const existing = categoryMap.get(key);
    if (existing) {
      existing.amount = round2(existing.amount + amount);
    } else {
      categoryMap.set(key, { categoryKey: key, categoryLabel: label, amount: round2(amount), percentOfIncome: null });
    }
  };

  // Lançamentos manuais com vencimento dentro do mês fechado.
  for (const tx of transactions) {
    if (toYearMonth(tx.dueDate) === yearMonth) {
      addToCategory(tx.categoryKey, tx.categoryLabel, tx.amount);
    }
  }

  // Parcelas de cartão com vencimento dentro do mês fechado.
  const futureBuckets = new Map<string, FutureMonthPending>();
  for (const inst of cardInstallments) {
    const instYearMonth = toYearMonth(inst.dueDate);
    if (instYearMonth === yearMonth) {
      addToCategory(inst.categoryKey ?? "cartao_sem_categoria", inst.categoryLabel ?? "Cartão (sem categoria)", inst.amount);
    } else if (compareYearMonth(instYearMonth, yearMonth) > 0) {
      // Parcela ainda não vencida, cai em algum mês futuro: entra na projeção.
      let bucket = futureBuckets.get(instYearMonth);
      if (!bucket) {
        bucket = { yearMonth: instYearMonth, amount: 0, items: [] };
        futureBuckets.set(instYearMonth, bucket);
      }
      bucket.amount = round2(bucket.amount + inst.amount);
      bucket.items.push({
        cardName: inst.cardName,
        purchaseDescription: inst.purchaseDescription,
        installmentNumber: inst.installmentNumber,
        installmentsTotal: inst.installmentsTotal,
        amount: inst.amount,
      });
    }
    // Parcelas com vencimento em meses já passados (anteriores ao mês
    // fechado) não entram no snapshot deste fechamento — já foram
    // contabilizadas no fechamento do mês delas.
  }

  const categoryTotals = Array.from(categoryMap.values())
    .map((c) => ({
      ...c,
      percentOfIncome: income > 0 ? round2((c.amount / income) * 100) : null,
    }))
    .sort((a, b) => b.amount - a.amount);

  const totalSpent = round2(categoryTotals.reduce((sum, c) => sum + c.amount, 0));
  // % da renda considera o gasto variável do mês somado às contas fixas —
  // uma conta fixa (aluguel, assinatura, etc.) também compromete a renda,
  // então não pode ficar de fora do percentual mostrado no dashboard.
  const totalCommitted = round2(totalSpent + fixedAccountsTotal);

  const pendingByFutureMonth = Array.from(futureBuckets.values()).sort((a, b) =>
    compareYearMonth(a.yearMonth, b.yearMonth)
  );

  return {
    yearMonth,
    income: round2(income),
    categoryTotals,
    totalSpent,
    totalCommitted,
    totalPercentOfIncome: income > 0 ? round2((totalCommitted / income) * 100) : null,
    fixedAccountsTotal: round2(fixedAccountsTotal),
    investmentsTotal: round2(investmentsTotal),
    pendingByFutureMonth,
  };
}
