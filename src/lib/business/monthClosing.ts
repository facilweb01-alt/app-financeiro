import { toYearMonth, compareYearMonth, addMonthsToYearMonth } from "./dates";

export type TransactionLike = {
  dueDate: string; // "YYYY-MM-DD"
  description: string;
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

// Um lançamento/parcela individual dentro do mês fechado, já marcado com a
// origem (lançamento manual do dia a dia, ou parcela de cartão) — é o que
// alimenta a lista de detalhe ao pesquisar/selecionar uma categoria no
// painel (pedido do Marcelo: "colocar um filtro para saber os gastos"
// misturando cartão e lançamentos do dia a dia dentro de cada categoria).
export type MonthCategoryItem = {
  categoryKey: string;
  categoryLabel: string;
  description: string;
  amount: number;
  dueDate: string;
  origin: "lancamento" | "cartao";
};

export type FutureMonthItemDetail = {
  cardName: string;
  purchaseDescription: string;
  installmentNumber: number;
  installmentsTotal: number;
  amount: number;
  categoryKey: string;
  categoryLabel: string;
};

export type FutureMonthPending = {
  yearMonth: string;
  amount: number;
  items: FutureMonthItemDetail[];
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
  // Cada lançamento/parcela individual que caiu no mês fechado, um por um
  // (não agregado) — usado pela busca+detalhe de categoria no painel.
  categoryItems: MonthCategoryItem[];
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

  const categoryItems: MonthCategoryItem[] = [];

  // Lançamentos manuais com vencimento dentro do mês fechado.
  for (const tx of transactions) {
    if (toYearMonth(tx.dueDate) === yearMonth) {
      addToCategory(tx.categoryKey, tx.categoryLabel, tx.amount);
      categoryItems.push({
        categoryKey: tx.categoryKey,
        categoryLabel: tx.categoryLabel,
        description: tx.description,
        amount: tx.amount,
        dueDate: tx.dueDate,
        origin: "lancamento",
      });
    }
  }

  // Parcelas de cartão com vencimento dentro do mês fechado.
  const futureBuckets = new Map<string, FutureMonthPending>();
  for (const inst of cardInstallments) {
    const instYearMonth = toYearMonth(inst.dueDate);
    const categoryKey = inst.categoryKey ?? "cartao_sem_categoria";
    const categoryLabel = inst.categoryLabel ?? "Cartão (sem categoria)";
    if (instYearMonth === yearMonth) {
      addToCategory(categoryKey, categoryLabel, inst.amount);
      categoryItems.push({
        categoryKey,
        categoryLabel,
        description: `${inst.cardName} — ${inst.purchaseDescription} (${inst.installmentNumber}/${inst.installmentsTotal})`,
        amount: inst.amount,
        dueDate: inst.dueDate,
        origin: "cartao",
      });
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
        categoryKey,
        categoryLabel,
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
    categoryItems,
  };
}

export type FutureMonthHorizonEntry = {
  yearMonth: string;
  amount: number;
  items: FutureMonthItemDetail[];
};

/**
 * Diferente de `pendingByFutureMonth` (que só lista os meses que já têm
 * parcela de verdade, usado no fechamento/PDF), esta função sempre devolve
 * um mês pra cada posição do horizonte pedido (padrão 10, um "por causa de
 * ser fatura de cartão" — parcelamentos longos) — inclusive os que ainda
 * não têm nenhuma parcela (amount 0, items []). É o que permite ao painel
 * ter um filtro que deixa escolher qualquer mês futuro dentro desse
 * horizonte e ver o total/lista daquele mês, mesmo que o gráfico em si só
 * mostre os 3 mais próximos.
 */
export function computeFutureMonthsHorizon(params: {
  yearMonth: string; // mês base (o mês "atual" sendo exibido no painel)
  cardInstallments: CardInstallmentLike[];
  monthsAhead?: number;
}): FutureMonthHorizonEntry[] {
  const { yearMonth, cardInstallments, monthsAhead = 10 } = params;

  const horizonMonths = Array.from({ length: monthsAhead }, (_, i) => addMonthsToYearMonth(yearMonth, i + 1));
  const bucketMap = new Map<string, FutureMonthHorizonEntry>();
  for (const m of horizonMonths) {
    bucketMap.set(m, { yearMonth: m, amount: 0, items: [] });
  }

  for (const inst of cardInstallments) {
    const instYearMonth = toYearMonth(inst.dueDate);
    const bucket = bucketMap.get(instYearMonth);
    if (!bucket) continue; // fora do horizonte pedido
    bucket.amount = round2(bucket.amount + inst.amount);
    bucket.items.push({
      cardName: inst.cardName,
      purchaseDescription: inst.purchaseDescription,
      installmentNumber: inst.installmentNumber,
      installmentsTotal: inst.installmentsTotal,
      amount: inst.amount,
      categoryKey: inst.categoryKey ?? "cartao_sem_categoria",
      categoryLabel: inst.categoryLabel ?? "Cartão (sem categoria)",
    });
  }

  return horizonMonths.map((m) => bucketMap.get(m)!);
}
