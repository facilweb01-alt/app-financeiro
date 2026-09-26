// Suíte de testes da lógica de negócio pura (sem banco).
// Roda de verdade (node --test via tsx), cobrindo caminho feliz e casos de
// borda, como manda o playbook: nunca só ler o código e confiar.
//
// Executar: npm run test:business

import test from "node:test";
import assert from "node:assert/strict";
import { splitCentsInInstallments, toCents, fromCents } from "../money";
import { addMonthsClamped, addMonthsToYearMonth, toYearMonth, currentYearMonth } from "../dates";
import { generateInstallments } from "../installments";
import { computeMonthClosingSnapshot, computeFutureMonthsHorizon } from "../monthClosing";
import { computeSpendingStatus, spendingStatusSentence } from "../spendingStatus";

// ---------------------------------------------------------------------------
// money.ts
// ---------------------------------------------------------------------------

test("splitCentsInInstallments: divide sem perder nem sobrar centavo (caso feio, 100/3)", () => {
  const parts = splitCentsInInstallments(10000, 3); // R$ 100,00 em 3x
  assert.deepEqual(parts, [3334, 3333, 3333]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 10000);
});

test("splitCentsInInstallments: divisão exata", () => {
  const parts = splitCentsInInstallments(30000, 3); // R$ 300,00 em 3x
  assert.deepEqual(parts, [10000, 10000, 10000]);
});

test("splitCentsInInstallments: 1 centavo em 3 parcelas (caso extremo)", () => {
  const parts = splitCentsInInstallments(1, 3);
  assert.deepEqual(parts, [1, 0, 0]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 1);
});

test("splitCentsInInstallments: número de parcelas inválido lança erro", () => {
  assert.throws(() => splitCentsInInstallments(1000, 0));
  assert.throws(() => splitCentsInInstallments(1000, -1));
});

test("toCents/fromCents são inversas (dentro da precisão de centavos)", () => {
  assert.equal(toCents(19.9), 1990);
  assert.equal(fromCents(1990), 19.9);
});

// ---------------------------------------------------------------------------
// dates.ts
// ---------------------------------------------------------------------------

test("addMonthsClamped: caso normal", () => {
  assert.equal(addMonthsClamped("2026-01-15", 1), "2026-02-15");
});

test("addMonthsClamped: dia 31 caindo em fevereiro (mês curto) gruda no último dia", () => {
  assert.equal(addMonthsClamped("2026-01-31", 1), "2026-02-28"); // 2026 não é bissexto
  assert.equal(addMonthsClamped("2027-01-31", 1), "2027-02-28");
  assert.equal(addMonthsClamped("2024-01-31", 1), "2024-02-29"); // 2024 é bissexto
});

test("addMonthsClamped: atravessa o ano", () => {
  assert.equal(addMonthsClamped("2026-11-30", 2), "2027-01-30");
});

test("toYearMonth extrai ano-mês", () => {
  assert.equal(toYearMonth("2026-09-08"), "2026-09");
});

test("currentYearMonth retorna formato YYYY-MM", () => {
  assert.match(currentYearMonth(), /^\d{4}-\d{2}$/);
});

test("addMonthsToYearMonth: caso normal", () => {
  assert.equal(addMonthsToYearMonth("2026-09", 1), "2026-10");
  assert.equal(addMonthsToYearMonth("2026-09", 3), "2026-12");
});

test("addMonthsToYearMonth: atravessa o ano", () => {
  assert.equal(addMonthsToYearMonth("2026-11", 2), "2027-01");
  assert.equal(addMonthsToYearMonth("2026-01", 12), "2027-01");
});

test("addMonthsToYearMonth: soma zero devolve o mesmo mês", () => {
  assert.equal(addMonthsToYearMonth("2026-09", 0), "2026-09");
});

// ---------------------------------------------------------------------------
// installments.ts
// ---------------------------------------------------------------------------

test("generateInstallments: compra de R$100 em 3x a partir de 15/01", () => {
  const result = generateInstallments({
    totalAmount: 100,
    installmentsTotal: 3,
    firstDueDate: "2026-01-15",
  });
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((r) => r.dueDate),
    ["2026-01-15", "2026-02-15", "2026-03-15"]
  );
  const total = result.reduce((sum, r) => sum + r.amount, 0);
  assert.equal(Math.round(total * 100) / 100, 100);
  // a diferença de arredondamento (100/3 = 33.333...) fica nas primeiras parcelas
  assert.equal(result[0].amount, 33.34);
  assert.equal(result[1].amount, 33.33);
  assert.equal(result[2].amount, 33.33);
});

test("generateInstallments: compra à vista (1x)", () => {
  const result = generateInstallments({
    totalAmount: 250.5,
    installmentsTotal: 1,
    firstDueDate: "2026-05-10",
  });
  assert.deepEqual(result, [{ installmentNumber: 1, dueDate: "2026-05-10", amount: 250.5 }]);
});

test("generateInstallments: compra parcelada atravessando virada de ano e mês curto", () => {
  const result = generateInstallments({
    totalAmount: 600,
    installmentsTotal: 4,
    firstDueDate: "2026-12-31",
  });
  assert.deepEqual(
    result.map((r) => r.dueDate),
    ["2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31"]
  );
});

test("generateInstallments: valor inválido (zero ou negativo) lança erro", () => {
  assert.throws(() =>
    generateInstallments({ totalAmount: 0, installmentsTotal: 3, firstDueDate: "2026-01-01" })
  );
  assert.throws(() =>
    generateInstallments({ totalAmount: -10, installmentsTotal: 3, firstDueDate: "2026-01-01" })
  );
});

test("generateInstallments: número de parcelas inválido lança erro", () => {
  assert.throws(() =>
    generateInstallments({ totalAmount: 100, installmentsTotal: 0, firstDueDate: "2026-01-01" })
  );
  assert.throws(() =>
    generateInstallments({ totalAmount: 100, installmentsTotal: 2.5, firstDueDate: "2026-01-01" })
  );
});

test("generateInstallments: data de vencimento em formato errado lança erro", () => {
  assert.throws(() =>
    generateInstallments({ totalAmount: 100, installmentsTotal: 1, firstDueDate: "31/01/2026" })
  );
});

// ---------------------------------------------------------------------------
// monthClosing.ts
// ---------------------------------------------------------------------------

test("computeMonthClosingSnapshot: caminho feliz com renda informada", () => {
  const snapshot = computeMonthClosingSnapshot({
    yearMonth: "2026-09",
    income: 5000,
    transactions: [
      { dueDate: "2026-09-05", description: "Mercado", amount: 300, categoryKey: "alimentacao", categoryLabel: "Alimentação" },
      { dueDate: "2026-09-20", description: "Cinema", amount: 150, categoryKey: "lazer", categoryLabel: "Lazer" },
      // fora do mês fechado — não deve entrar
      { dueDate: "2026-08-31", description: "Show", amount: 999, categoryKey: "lazer", categoryLabel: "Lazer" },
    ],
    cardInstallments: [
      {
        dueDate: "2026-09-10",
        amount: 100,
        categoryKey: "alimentacao",
        categoryLabel: "Alimentação",
        cardName: "Nubank",
        purchaseDescription: "Mercado",
        installmentNumber: 1,
        installmentsTotal: 3,
      },
      {
        dueDate: "2026-10-10",
        amount: 100,
        categoryKey: "alimentacao",
        categoryLabel: "Alimentação",
        cardName: "Nubank",
        purchaseDescription: "Mercado",
        installmentNumber: 2,
        installmentsTotal: 3,
      },
      {
        dueDate: "2026-11-10",
        amount: 100,
        categoryKey: "alimentacao",
        categoryLabel: "Alimentação",
        cardName: "Nubank",
        purchaseDescription: "Mercado",
        installmentNumber: 3,
        installmentsTotal: 3,
      },
      // parcela de um mês já fechado anteriormente — não deve reaparecer
      {
        dueDate: "2026-08-10",
        amount: 100,
        categoryKey: "alimentacao",
        categoryLabel: "Alimentação",
        cardName: "Nubank",
        purchaseDescription: "Mercado",
        installmentNumber: 0,
        installmentsTotal: 3,
      },
    ],
    fixedAccountsTotal: 1200,
    investmentsTotal: 500,
  });

  assert.equal(snapshot.totalSpent, 550); // 300 + 150 + 100 (parcela de set)
  assert.equal(snapshot.totalCommitted, 1750); // 550 gasto variável + 1200 contas fixas
  assert.equal(snapshot.totalPercentOfIncome, 35); // 1750/5000 (gasto variável + contas fixas)

  const alimentacao = snapshot.categoryTotals.find((c) => c.categoryKey === "alimentacao");
  assert.ok(alimentacao);
  assert.equal(alimentacao!.amount, 400); // 300 manual + 100 parcela de setembro
  assert.equal(alimentacao!.percentOfIncome, 8);

  // projeção: parcelas 2 e 3 (outubro e novembro), a de agosto não conta
  assert.equal(snapshot.pendingByFutureMonth.length, 2);
  assert.equal(snapshot.pendingByFutureMonth[0].yearMonth, "2026-10");
  assert.equal(snapshot.pendingByFutureMonth[0].amount, 100);
  assert.equal(snapshot.pendingByFutureMonth[1].yearMonth, "2026-11");
  assert.equal(snapshot.pendingByFutureMonth[1].amount, 100);
  // parcela futura carrega a categoria junto (usada pelo filtro por
  // categoria do painel) — pedido do Marcelo.
  assert.equal(snapshot.pendingByFutureMonth[0].items[0].categoryKey, "alimentacao");
  assert.equal(snapshot.pendingByFutureMonth[0].items[0].categoryLabel, "Alimentação");

  // itens individuais do mês fechado, misturando lançamento e cartão, cada
  // um com sua origem marcada — base da busca+detalhe por categoria.
  assert.equal(snapshot.categoryItems.length, 3); // 2 lançamentos + 1 parcela de setembro
  const lancamentoAlimentacao = snapshot.categoryItems.find(
    (i) => i.origin === "lancamento" && i.categoryKey === "alimentacao"
  );
  assert.ok(lancamentoAlimentacao);
  assert.equal(lancamentoAlimentacao!.description, "Mercado");
  assert.equal(lancamentoAlimentacao!.amount, 300);
  const parcelaCartao = snapshot.categoryItems.find((i) => i.origin === "cartao");
  assert.ok(parcelaCartao);
  assert.equal(parcelaCartao!.categoryKey, "alimentacao");
  assert.equal(parcelaCartao!.amount, 100);
  assert.match(parcelaCartao!.description, /Nubank/);
});

test("computeMonthClosingSnapshot: sem renda informada não calcula percentual (não quebra dividindo por zero)", () => {
  const snapshot = computeMonthClosingSnapshot({
    yearMonth: "2026-09",
    income: 0,
    transactions: [{ dueDate: "2026-09-05", description: "Show", amount: 300, categoryKey: "lazer", categoryLabel: "Lazer" }],
    cardInstallments: [],
    fixedAccountsTotal: 0,
    investmentsTotal: 0,
  });
  assert.equal(snapshot.totalPercentOfIncome, null);
  assert.equal(snapshot.categoryTotals[0].percentOfIncome, null);
});

test("computeMonthClosingSnapshot: mês sem nenhum lançamento (dado ausente) não quebra", () => {
  const snapshot = computeMonthClosingSnapshot({
    yearMonth: "2026-09",
    income: 5000,
    transactions: [],
    cardInstallments: [],
    fixedAccountsTotal: 0,
    investmentsTotal: 0,
  });
  assert.equal(snapshot.totalSpent, 0);
  assert.equal(snapshot.categoryTotals.length, 0);
  assert.equal(snapshot.pendingByFutureMonth.length, 0);
});

test("computeMonthClosingSnapshot: duas categorias diferentes não se misturam (duplicidade de key)", () => {
  const snapshot = computeMonthClosingSnapshot({
    yearMonth: "2026-09",
    income: 1000,
    transactions: [
      { dueDate: "2026-09-01", description: "Consulta", amount: 50, categoryKey: "saude", categoryLabel: "Saúde" },
      { dueDate: "2026-09-02", description: "Farmácia", amount: 30, categoryKey: "saude", categoryLabel: "Saúde" },
      { dueDate: "2026-09-03", description: "Cinema", amount: 20, categoryKey: "lazer", categoryLabel: "Lazer" },
    ],
    cardInstallments: [],
    fixedAccountsTotal: 0,
    investmentsTotal: 0,
  });
  assert.equal(snapshot.categoryTotals.length, 2);
  const saude = snapshot.categoryTotals.find((c) => c.categoryKey === "saude");
  assert.equal(saude!.amount, 80);
});

test("computeMonthClosingSnapshot: yearMonth em formato errado lança erro", () => {
  assert.throws(() =>
    computeMonthClosingSnapshot({
      yearMonth: "09-2026",
      income: 100,
      transactions: [],
      cardInstallments: [],
      fixedAccountsTotal: 0,
      investmentsTotal: 0,
    })
  );
});

// ---------------------------------------------------------------------------
// monthClosing.ts — computeFutureMonthsHorizon
// ---------------------------------------------------------------------------

test("computeFutureMonthsHorizon: devolve um mês por posição do horizonte, mesmo sem parcela (zerado)", () => {
  const horizon = computeFutureMonthsHorizon({
    yearMonth: "2026-09",
    cardInstallments: [],
    monthsAhead: 10,
  });
  assert.equal(horizon.length, 10);
  assert.equal(horizon[0].yearMonth, "2026-10"); // mês seguinte ao base
  assert.equal(horizon[9].yearMonth, "2027-07"); // 10º mês à frente
  for (const bucket of horizon) {
    assert.equal(bucket.amount, 0);
    assert.deepEqual(bucket.items, []);
  }
});

test("computeFutureMonthsHorizon: soma parcelas por mês dentro do horizonte e ignora fora dele", () => {
  const horizon = computeFutureMonthsHorizon({
    yearMonth: "2026-09",
    cardInstallments: [
      {
        dueDate: "2026-10-05",
        amount: 100,
        cardName: "Nubank",
        purchaseDescription: "Mercado",
        installmentNumber: 1,
        installmentsTotal: 2,
        categoryKey: "alimentacao",
        categoryLabel: "Alimentação",
      },
      {
        dueDate: "2026-10-15",
        amount: 50,
        cardName: "Itaú",
        purchaseDescription: "Farmácia",
        installmentNumber: 1,
        installmentsTotal: 1,
        // sem categoria informada — deve cair no rótulo padrão de cartão
      },
      // fora do horizonte de 10 meses (mês base + 11) — deve ser ignorada
      {
        dueDate: "2027-09-05",
        amount: 999,
        cardName: "Nubank",
        purchaseDescription: "Fora do horizonte",
        installmentNumber: 2,
        installmentsTotal: 2,
      },
    ],
    monthsAhead: 10,
  });

  const outubro = horizon.find((b) => b.yearMonth === "2026-10");
  assert.ok(outubro);
  assert.equal(outubro!.amount, 150);
  assert.equal(outubro!.items.length, 2);
  const comCategoria = outubro!.items.find((i) => i.cardName === "Nubank");
  assert.equal(comCategoria!.categoryKey, "alimentacao");
  const semCategoria = outubro!.items.find((i) => i.cardName === "Itaú");
  assert.equal(semCategoria!.categoryKey, "cartao_sem_categoria");
  assert.equal(semCategoria!.categoryLabel, "Cartão (sem categoria)");

  // mês fora do horizonte não deve gerar nenhum bucket com esse valor
  const foraDoHorizonte = horizon.find((b) => b.yearMonth === "2027-09");
  assert.equal(foraDoHorizonte, undefined);
  const totalGeral = horizon.reduce((sum, b) => sum + b.amount, 0);
  assert.equal(totalGeral, 150); // os 999 do mês fora do horizonte não entram
});

test("computeFutureMonthsHorizon: monthsAhead customizado limita o tamanho do horizonte", () => {
  const horizon = computeFutureMonthsHorizon({
    yearMonth: "2026-09",
    cardInstallments: [],
    monthsAhead: 3,
  });
  assert.equal(horizon.length, 3);
  assert.deepEqual(
    horizon.map((b) => b.yearMonth),
    ["2026-10", "2026-11", "2026-12"]
  );
});

// ---------------------------------------------------------------------------
// spendingStatus.ts — resumo didático do painel (substitui o anel de %)
// ---------------------------------------------------------------------------

test("computeSpendingStatus: sem renda cadastrada (percent null) não quebra e sinaliza estado neutro", () => {
  const status = computeSpendingStatus(null);
  assert.equal(status.level, "sem-renda");
  assert.equal(status.meterPercent, 0);
  assert.equal(status.isExtreme, false);
  assert.equal(status.multiplier, null);
  assert.match(spendingStatusSentence(status), /Cadastre sua renda/);
});

test("computeSpendingStatus: abaixo de 70% é 'Sob controle' (verde), mesma faixa de antes", () => {
  const status = computeSpendingStatus(35);
  assert.equal(status.level, "controle");
  assert.equal(status.label, "Sob controle");
  assert.equal(status.color, "#22c55e");
  assert.equal(status.meterPercent, 35);
  assert.equal(status.isExtreme, false);
});

test("computeSpendingStatus: entre 70% e 99% é 'Atenção' (âmbar)", () => {
  const status = computeSpendingStatus(85);
  assert.equal(status.level, "atencao");
  assert.equal(status.color, "#f59e0b");
  assert.equal(status.meterPercent, 85);
});

test("computeSpendingStatus: 100% ou mais é 'Renda estourada' (vermelho), medidor nunca passa de 100", () => {
  const status = computeSpendingStatus(140);
  assert.equal(status.level, "estourado");
  assert.equal(status.color, "#ef4444");
  assert.equal(status.meterPercent, 100); // limitado, não "dá a volta"
  assert.equal(status.isExtreme, false);
});

test("computeSpendingStatus: percentual extremo (>=1000%) vira múltiplo em vez de número gigante — o bug real do Marcelo", () => {
  // Caso real detectado: renda cadastrada muito baixa (~R$31) gerando
  // 38266.67% — exatamente o que confundiu o Marcelo no painel.
  const status = computeSpendingStatus(38266.67);
  assert.equal(status.level, "estourado");
  assert.equal(status.meterPercent, 100);
  assert.equal(status.isExtreme, true);
  assert.equal(status.multiplier, 383); // Math.round(38266.67 / 100)
  assert.match(spendingStatusSentence(status), /renda desatualizado/);
});

test("computeSpendingStatus: limiar exato de 1000% já conta como extremo", () => {
  const abaixo = computeSpendingStatus(999.9);
  assert.equal(abaixo.isExtreme, false);
  const noLimite = computeSpendingStatus(1000);
  assert.equal(noLimite.isExtreme, true);
  assert.equal(noLimite.multiplier, 10);
});

// ---------------------------------------------------------------------------
// billing/core.ts — cobrança mensal via Pix (Asaas)
// ---------------------------------------------------------------------------
import {
  todayInSaoPaulo,
  daysBetween,
  addDays,
  nextCycleDate,
  computeSubscriptionDueDate,
  computeBillingState,
  isValidCpf,
  normalizeSignupPhone,
  whatsappPhoneVariants,
  GRACE_DAYS,
} from "../../billing/core";

test("todayInSaoPaulo: 01:30 UTC ainda é o dia anterior em São Paulo", () => {
  assert.equal(todayInSaoPaulo(new Date("2026-09-27T01:30:00Z")), "2026-09-26");
  assert.equal(todayInSaoPaulo(new Date("2026-09-27T15:00:00Z")), "2026-09-27");
});

test("daysBetween / addDays", () => {
  assert.equal(daysBetween("2026-09-26", "2026-10-01"), 5);
  assert.equal(daysBetween("2026-10-01", "2026-09-26"), -5);
  assert.equal(addDays("2026-02-27", 3), "2026-03-02");
});

test("nextCycleDate: mantém o dia do contrato mesmo depois de um mês curto", () => {
  assert.equal(nextCycleDate("2026-01-31", 31), "2026-02-28");
  assert.equal(nextCycleDate("2026-02-28", 31), "2026-03-31");
  assert.equal(nextCycleDate("2026-09-26", 26), "2026-10-26");
  assert.equal(nextCycleDate("2026-12-10", 10), "2027-01-10");
});

test("computeSubscriptionDueDate: sem cobranças -> null", () => {
  assert.equal(computeSubscriptionDueDate([]), null);
});

test("computeSubscriptionDueDate: primeira cobrança em aberto -> vencimento dela", () => {
  assert.equal(computeSubscriptionDueDate([{ dueDate: "2026-09-26", status: "PENDING" }]), "2026-09-26");
});

test("computeSubscriptionDueDate: tudo pago -> próximo ciclo no dia do contrato", () => {
  assert.equal(
    computeSubscriptionDueDate([
      { dueDate: "2026-01-31", status: "RECEIVED" },
      { dueDate: "2026-02-28", status: "CONFIRMED" },
    ]),
    "2026-03-31"
  );
});

test("computeSubscriptionDueDate: em aberto tem prioridade (o mais antigo)", () => {
  assert.equal(
    computeSubscriptionDueDate([
      { dueDate: "2026-09-26", status: "RECEIVED" },
      { dueDate: "2026-11-26", status: "PENDING" },
      { dueDate: "2026-10-26", status: "OVERDUE" },
    ]),
    "2026-10-26"
  );
});

test("computeSubscriptionDueDate: só canceladas/estornadas -> null", () => {
  assert.equal(computeSubscriptionDueDate([{ dueDate: "2026-09-26", status: "REFUNDED" }]), null);
});

test("computeBillingState: conta sem cobrança automática é isenta", () => {
  const s = computeBillingState({ billingEnabled: false, status: "active", subscriptionDueDate: "2020-01-01", today: "2026-09-26" });
  assert.equal(s.kind, "exempt");
});

test("computeBillingState: cadastro pendente aguarda o primeiro pagamento", () => {
  const s = computeBillingState({ billingEnabled: true, status: "pending", subscriptionDueDate: "2026-09-26", today: "2026-09-26" });
  assert.equal(s.kind, "awaiting_first_payment");
});

test("computeBillingState: faixas ok / vence logo / vencido / bloqueado", () => {
  const base = { billingEnabled: true, status: "active", subscriptionDueDate: "2026-10-26" };
  assert.equal(computeBillingState({ ...base, today: "2026-10-10" }).kind, "ok");
  assert.equal(computeBillingState({ ...base, today: "2026-10-21" }).kind, "due_soon"); // 5 dias antes
  assert.equal(computeBillingState({ ...base, today: "2026-10-26" }).kind, "due_soon"); // no dia
  assert.equal(computeBillingState({ ...base, today: "2026-10-27" }).kind, "overdue");
  assert.equal(computeBillingState({ ...base, today: "2026-10-29" }).kind, "overdue"); // 3º dia de tolerância
  assert.equal(computeBillingState({ ...base, today: "2026-10-30" }).kind, "blocked"); // 4º dia -> bloqueia
  assert.equal(GRACE_DAYS, 3);
  assert.equal(computeBillingState({ ...base, today: "2026-10-27" }).blockDate, "2026-10-30");
});

test("isValidCpf: aceita CPF válido (com ou sem máscara) e recusa inválidos", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("52998224725"), true);
  assert.equal(isValidCpf("529.982.247-24"), false);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("123"), false);
});

test("normalizeSignupPhone: aceita vários formatos e guarda DDD + número", () => {
  assert.equal(normalizeSignupPhone("(83) 98200-4873"), "83982004873");
  assert.equal(normalizeSignupPhone("+55 83 98200-4873"), "83982004873");
  assert.equal(normalizeSignupPhone("5583982004873"), "83982004873");
  assert.equal(normalizeSignupPhone("8382004873"), "8382004873");
  assert.equal(normalizeSignupPhone("98200-4873"), null); // sem DDD
});

test("whatsappPhoneVariants: casa o número com/sem 55 e com/sem o 9", () => {
  const fromZapi = whatsappPhoneVariants("558382004873");
  assert.ok(fromZapi.includes("83982004873")); // cadastro sem DDI
  assert.ok(fromZapi.includes("5583982004873")); // vinculado com DDI
  assert.ok(fromZapi.includes("8382004873"));
  const fromSignup = whatsappPhoneVariants("83982004873");
  assert.ok(fromSignup.includes("558382004873"));
  assert.ok(fromSignup.includes("5583982004873"));
  assert.deepEqual(whatsappPhoneVariants(""), []);
});
