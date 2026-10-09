// Suíte de testes da lógica de negócio pura (sem banco).
// Roda de verdade (node --test via tsx), cobrindo caminho feliz e casos de
// borda, como manda o playbook: nunca só ler o código e confiar.
//
// Executar: npm run test:business

import test from "node:test";
import assert from "node:assert/strict";
import { splitCentsInInstallments, toCents, fromCents } from "../money";
import { addMonthsClamped, addMonthsToYearMonth, toYearMonth, currentYearMonth, monthBounds, todaySaoPaulo } from "../dates";
import { generateInstallments } from "../installments";
import { computeMonthClosingSnapshot, computeFutureMonthsHorizon, resolveMonthSnapshot, monthTotalOf } from "../monthClosing";
import {
  findStatementCovering,
  groupOpenInstallmentsByMonth,
  planSettlement,
  suggestFirstDueDate,
  sumAmounts,
} from "../cardStatements";
import { computeSpendingStatus, spendingStatusSentence } from "../spendingStatus";
import {
  describeCardCycle,
  firstDueDateForPurchase,
  hasCardCycle,
  statementClosingDateForPurchase,
} from "../cardCycle";
import {
  AUTOMATION_RULES,
  buildAutomationMessage,
  isOptOutMessage,
  isWithinSendWindow,
  nextAutomation,
  type AutomationCandidate,
  type AutomationRecord,
} from "../automations";

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
  cardFirstDueDate,
  checkoutDueDateTime,
  pickCardSubscription,
  normalizeBillingMethod,
  validateBillingAddress,
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


// ---------------------------------------------------------------------------
// whatsappInput.ts — bugs reais do teste pelo WhatsApp (26/09/2026)
// ---------------------------------------------------------------------------
import {
  normalizeFlexibleDate,
  normalizeCardName,
  displayCardName,
  matchCard,
  isCardPurchase,
} from "../whatsappInput";

test("normalizeFlexibleDate: aceita ISO, dd/mm/aaaa, dd/mm/aa e dd/mm", () => {
  const today = "2026-09-26";
  assert.equal(normalizeFlexibleDate("2026-10-15", today), "2026-10-15");
  assert.equal(normalizeFlexibleDate("15/10/2026", today), "2026-10-15");
  assert.equal(normalizeFlexibleDate("15-10-26", today), "2026-10-15");
  assert.equal(normalizeFlexibleDate("15/10", today), "2026-10-15");
  assert.equal(normalizeFlexibleDate("5/1", "2026-12-20"), "2027-01-05"); // janeiro do ano que vem
  assert.equal(normalizeFlexibleDate("20/09", today), "2026-09-20"); // passado recente fica no ano atual
});

test("normalizeFlexibleDate: recusa data que não existe (bug do 'Tive um problema')", () => {
  const today = "2026-09-26";
  assert.equal(normalizeFlexibleDate("2026-15-10", today), null); // dia/mês trocados
  assert.equal(normalizeFlexibleDate("31/02/2026", today), null);
  assert.equal(normalizeFlexibleDate("amanhã", today), null);
  assert.equal(normalizeFlexibleDate("", today), null);
  assert.equal(normalizeFlexibleDate(null, today), null);
});

test("normalizeCardName/displayCardName: ignora 'cartão', acento e caixa", () => {
  assert.equal(normalizeCardName("Cartão Mercado Pago"), "mercado pago");
  assert.equal(normalizeCardName("cartao AZUL"), "azul");
  assert.equal(normalizeCardName("Nubank"), "nubank");
  assert.equal(displayCardName("cartão mercado pago"), "Mercado Pago");
});

test("matchCard: nome igual, parcial único, e nunca chuta quando é ambíguo", () => {
  const cards = [
    { id: "1", name: "Nubank" },
    { id: "2", name: "Mercado Pago" },
    { id: "3", name: "Itaú Azul" },
    { id: "4", name: "Itaú Personnalité" },
  ];
  assert.equal(matchCard(cards, "cartão mercado pago")?.id, "2");
  assert.equal(matchCard(cards, "NUBANK")?.id, "1");
  assert.equal(matchCard(cards, "azul")?.id, "3"); // parcial único
  assert.equal(matchCard(cards, "itau"), null); // ambíguo: 2 Itaú
  assert.equal(matchCard(cards, "inter"), null);
});

test("isCardPurchase: cartão pelo método, pelo nome ou por ter parcelas", () => {
  assert.equal(isCardPurchase({ paymentMethod: "Cartão de crédito" }), true);
  assert.equal(isCardPurchase({ cardName: "Nubank" }), true);
  assert.equal(isCardPurchase({ installments: 3 }), true);
  assert.equal(isCardPurchase({ paymentMethod: "pix", installments: 1 }), false);
  assert.equal(isCardPurchase({}), false);
});

// ---------------------------------------------------------------------------
// Cancelamento de assinatura (painel admin) — acesso até o fim do período pago
// ---------------------------------------------------------------------------
test("computeBillingState: cancelada dentro do período pago = canceled_active; no vencimento = canceled", () => {
  const base = { billingEnabled: true, status: "active", subscriptionDueDate: "2026-10-26", canceledAt: new Date("2026-09-27T12:00:00Z") };
  assert.equal(computeBillingState({ ...base, today: "2026-09-27" }).kind, "canceled_active");
  assert.equal(computeBillingState({ ...base, today: "2026-10-25" }).kind, "canceled_active");
  assert.equal(computeBillingState({ ...base, today: "2026-10-26" }).kind, "canceled"); // acaba no dia
  assert.equal(computeBillingState({ ...base, today: "2026-11-30" }).kind, "canceled");
});

test("computeBillingState: cancelada sem nenhum pagamento (ou pendente) encerra na hora", () => {
  const c = new Date("2026-09-27T12:00:00Z");
  assert.equal(computeBillingState({ billingEnabled: true, status: "active", subscriptionDueDate: null, today: "2026-09-27", canceledAt: c }).kind, "canceled");
  assert.equal(computeBillingState({ billingEnabled: true, status: "pending", subscriptionDueDate: "2026-09-27", today: "2026-09-27", canceledAt: c }).kind, "canceled");
});

test("computeBillingState: conta isenta ignora cancelamento; sem cancelamento nada muda", () => {
  const c = new Date();
  assert.equal(computeBillingState({ billingEnabled: false, status: "active", subscriptionDueDate: null, today: "2026-09-27", canceledAt: c }).kind, "exempt");
  assert.equal(computeBillingState({ billingEnabled: true, status: "active", subscriptionDueDate: "2026-10-26", today: "2026-09-27", canceledAt: null }).kind, "ok");
});

// ---------------------------------------------------------------------------
// Cartão de crédito recorrente (Checkout do Asaas)
// ---------------------------------------------------------------------------
test("cardFirstDueDate: sem pagar ainda cobra hoje; em dia cobra no vencimento que já existe; vencido cobra hoje", () => {
  const today = "2026-09-28";
  assert.equal(cardFirstDueDate({ status: "pending", subscriptionDueDate: "2026-09-28", today }), today);
  assert.equal(cardFirstDueDate({ status: "active", subscriptionDueDate: "2026-10-26", today }), "2026-10-26");
  assert.equal(cardFirstDueDate({ status: "active", subscriptionDueDate: "2026-09-25", today }), today); // vencido
  assert.equal(cardFirstDueDate({ status: "active", subscriptionDueDate: today, today }), today); // vence hoje
  assert.equal(cardFirstDueDate({ status: "active", subscriptionDueDate: null, today }), today);
});

test("checkoutDueDateTime: hoje = agora + 10 min (horário de Brasília); futuro = meio-dia", () => {
  // 28/09/2026 15:00 UTC = 12:00 em São Paulo
  const now = new Date("2026-09-28T15:00:00Z");
  assert.equal(checkoutDueDateTime("2026-09-28", now), "2026-09-28 12:10:00");
  assert.equal(checkoutDueDateTime("2026-10-26", now), "2026-10-26 12:00:00");
  // 23:55 em São Paulo: +10 min viraria o dia seguinte -> último segundo de hoje
  const late = new Date("2026-09-29T02:55:00Z");
  assert.equal(checkoutDueDateTime("2026-09-28", late), "2026-09-28 23:59:59");
});

test("pickCardSubscription: adota a assinatura de cartão mais nova que ainda não é a atual", () => {
  const subs = [
    { id: "sub_pix", billingType: "PIX", dateCreated: "2026-09-26", status: "ACTIVE" },
    { id: "sub_card1", billingType: "CREDIT_CARD", dateCreated: "2026-09-27", status: "ACTIVE" },
    { id: "sub_card2", billingType: "CREDIT_CARD", dateCreated: "2026-09-28", status: "ACTIVE" },
  ];
  assert.equal(pickCardSubscription(subs, "sub_pix")?.id, "sub_card2");
  assert.equal(pickCardSubscription(subs, "sub_card2"), null); // já é a atual
  assert.equal(pickCardSubscription([subs[0]], "sub_pix"), null); // só Pix: nada a trocar
  assert.equal(pickCardSubscription([{ ...subs[1], deleted: true }], "sub_pix"), null);
  assert.equal(pickCardSubscription([{ ...subs[1], status: "INACTIVE" }], "sub_pix"), null);
  // trocou de cartão no mesmo dia (o Asaas só informa a data): fica com a nova
  const sameDay = [
    { id: "sub_cardA", billingType: "CREDIT_CARD", dateCreated: "2026-09-28", status: "ACTIVE" },
    { id: "sub_cardB", billingType: "CREDIT_CARD", dateCreated: "2026-09-28", status: "ACTIVE" },
  ];
  assert.equal(pickCardSubscription(sameDay, "sub_cardA")?.id, "sub_cardB");
  assert.equal(pickCardSubscription([...sameDay].reverse(), "sub_cardA")?.id, "sub_cardB");
});

test("computeSubscriptionDueDate: depois de trocar para o cartão, o dia do contrato é o da assinatura nova", () => {
  const payments = [
    { dueDate: "2026-09-05", status: "RECEIVED" }, // Pix antigo, dia 5
    { dueDate: "2026-10-05", status: "DELETED" }, // Pix em aberto, cancelado na troca
    { dueDate: "2026-10-20", status: "CONFIRMED" }, // 1ª do cartão, dia 20
  ];
  assert.equal(computeSubscriptionDueDate(payments), "2026-11-05"); // sem âncora: dia antigo (errado para o cartão)
  assert.equal(computeSubscriptionDueDate(payments, { anchorDate: "2026-10-20" }), "2026-11-20");
});

test("normalizeBillingMethod: só CREDIT_CARD vira cartão; o resto é Pix", () => {
  assert.equal(normalizeBillingMethod("CREDIT_CARD"), "CREDIT_CARD");
  assert.equal(normalizeBillingMethod("PIX"), "PIX");
  assert.equal(normalizeBillingMethod(null), "PIX");
  assert.equal(normalizeBillingMethod("BOLETO"), "PIX");
});

test("validateBillingAddress: limpa os campos e recusa endereço incompleto (o Asaas exige endereço para o cartão)", () => {
  const ok = validateBillingAddress({ postalCode: "58.310-000", address: "  Rua das  Flores ", addressNumber: " 12 ", complement: "", province: "Centro" });
  assert.deepEqual(ok, { ok: true, data: { postalCode: "58310000", address: "Rua das Flores", addressNumber: "12", complement: null, province: "Centro" } });
  assert.equal(validateBillingAddress({ postalCode: "5831", address: "Rua A", addressNumber: "1", province: "Centro" }).ok, false);
  assert.equal(validateBillingAddress({ postalCode: "58310000", address: "", addressNumber: "1", province: "Centro" }).ok, false);
  assert.equal(validateBillingAddress({ postalCode: "58310000", address: "Rua A", addressNumber: "", province: "Centro" }).ok, false);
  assert.equal(validateBillingAddress({ postalCode: "58310000", address: "Rua A", addressNumber: "S/N", province: "" }).ok, false);
  assert.equal(validateBillingAddress({ postalCode: "58310000", address: "Rua A", addressNumber: "S/N", province: "Centro" }).ok, true);
});

// ---------------------------------------------------------------------------
// Categoria pelo WhatsApp e aviso de virada de mês (02/10/2026)
// ---------------------------------------------------------------------------
import { resolveWhatsappCategory, prettyCategoryLabel, type WhatsappCategory } from "../whatsappInput";
import { monthPendingClose } from "../monthClosing";

const SYSTEM_CATEGORIES: WhatsappCategory[] = [
  { id: "c-produto", key: "produto", label: "Produto", isCustom: false },
  { id: "c-servico", key: "servico", label: "Serviço", isCustom: false },
  { id: "c-lazer", key: "lazer", label: "Lazer", isCustom: false },
  { id: "c-saude", key: "saude", label: "Saúde", isCustom: false },
  { id: "c-alim", key: "alimentacao", label: "Compra de alimentos", isCustom: false },
  { id: "c-pessoais", key: "compras_pessoais", label: "Compras pessoais", isCustom: false },
  { id: "c-viagem", key: "viagem", label: "Viagem", isCustom: false },
  { id: "c-gasolina", key: "gasolina", label: "Gasolina", isCustom: false },
  { id: "c-outros", key: "outros", label: "Outros", isCustom: false },
];

function categoryId(decision: ReturnType<typeof resolveWhatsappCategory>): string | null {
  return decision.kind === "existing" ? decision.category.id : null;
}

test("categoria WhatsApp: 'mercado' cai em Compra de alimentos mesmo quando a IA diz produto/outros", () => {
  for (const categoryKey of ["produto", "outros", undefined]) {
    const d = resolveWhatsappCategory({ categories: SYSTEM_CATEGORIES, categoryKey, description: "mercado" });
    assert.equal(categoryId(d), "c-alim");
  }
  const d = resolveWhatsappCategory({ categories: SYSTEM_CATEGORIES, categoryKey: "produto", description: "Supermercado Bom Preço" });
  assert.equal(categoryId(d), "c-alim");
  // Mercado Pago / Mercado Livre não são compra de alimentos
  const mp = resolveWhatsappCategory({ categories: SYSTEM_CATEGORIES, categoryKey: "compras_pessoais", description: "Gasto Mercado Pago" });
  assert.equal(categoryId(mp), "c-pessoais");
  const ml = resolveWhatsappCategory({ categories: SYSTEM_CATEGORIES, categoryKey: "produto", description: "fone no mercado livre" });
  assert.equal(categoryId(ml), "c-produto");
  // palavra dentro de outra não conta ("mercadoria" não é mercado)
  const other = resolveWhatsappCategory({ categories: SYSTEM_CATEGORIES, categoryKey: "produto", description: "mercadoria da loja" });
  assert.equal(categoryId(other), "c-produto");
});

test("categoria WhatsApp: categoria específica da IA é respeitada", () => {
  const d = resolveWhatsappCategory({ categories: SYSTEM_CATEGORIES, categoryKey: "lazer", description: "cinema com a família" });
  assert.equal(categoryId(d), "c-lazer");
  const g = resolveWhatsappCategory({ categories: SYSTEM_CATEGORIES, categoryKey: "gasolina", description: "posto shell" });
  assert.equal(categoryId(g), "c-gasolina");
});

test("categoria WhatsApp: nome dito que já existe é mantido (sistema e própria), sem criar outra", () => {
  const pet: WhatsappCategory = { id: "c-pet", key: "pet", label: "Pet", isCustom: true };
  const cats = [...SYSTEM_CATEGORIES, pet];
  assert.equal(categoryId(resolveWhatsappCategory({ categories: cats, categoryKey: "outros", categoryName: "PET", description: "ração" })), "c-pet");
  assert.equal(categoryId(resolveWhatsappCategory({ categories: cats, categoryKey: "outros", categoryName: "saúde", description: "consulta" })), "c-saude");
  assert.equal(categoryId(resolveWhatsappCategory({ categories: cats, categoryKey: "outros", categoryName: "Compra de alimentos", description: "x" })), "c-alim");
  // sinônimo do dia a dia para uma categoria do sistema
  assert.equal(categoryId(resolveWhatsappCategory({ categories: cats, categoryKey: "outros", categoryName: "Alimentação", description: "x" })), "c-alim");
  // categoria própria citada só na descrição
  assert.equal(categoryId(resolveWhatsappCategory({ categories: cats, categoryKey: "produto", description: "banho no pet" })), "c-pet");
});

test("categoria WhatsApp: categoria própria com o mesmo nome ganha da regra do dia a dia", () => {
  const mercado: WhatsappCategory = { id: "c-mercado", key: "mercado", label: "Mercado", isCustom: true };
  const d = resolveWhatsappCategory({ categories: [...SYSTEM_CATEGORIES, mercado], categoryKey: "produto", description: "mercado" });
  assert.equal(categoryId(d), "c-mercado");
});

test("categoria WhatsApp: nome novo cria categoria; sem nome cai em Outros", () => {
  const d = resolveWhatsappCategory({ categories: SYSTEM_CATEGORIES, categoryKey: "outros", categoryName: "  educação  ", description: "mensalidade da escola" });
  assert.deepEqual(d, { kind: "create", label: "Educação", key: "educacao" });
  const noKey = resolveWhatsappCategory({ categories: SYSTEM_CATEGORIES, categoryName: "Pet shop", description: "ração" });
  assert.deepEqual(noKey, { kind: "create", label: "Pet shop", key: "pet_shop" });
  // IA escolheu uma categoria específica: não cria outra só porque veio um nome
  const kept = resolveWhatsappCategory({ categories: SYSTEM_CATEGORIES, categoryKey: "lazer", categoryName: "Cinema", description: "ingresso" });
  assert.equal(categoryId(kept), "c-lazer");
  const outros = resolveWhatsappCategory({ categories: SYSTEM_CATEGORIES, categoryKey: "outros", description: "coisa qualquer" });
  assert.equal(categoryId(outros), "c-outros");
  const unknownKey = resolveWhatsappCategory({ categories: SYSTEM_CATEGORIES, categoryKey: "inexistente", description: "coisa qualquer" });
  assert.equal(categoryId(unknownKey), "c-outros");
  assert.equal(prettyCategoryLabel("?"), null);
  assert.equal(resolveWhatsappCategory({ categories: [], categoryKey: "outros", description: "x" }).kind, "none");
});

test("monthPendingClose: avisa só do mês passado, com gasto e ainda aberto", () => {
  assert.equal(monthPendingClose({ today: "2026-10-02", closedMonths: [], monthsWithActivity: ["2026-09"] }), "2026-09");
  assert.equal(monthPendingClose({ today: "2026-10-02", closedMonths: ["2026-09"], monthsWithActivity: ["2026-09"] }), null);
  assert.equal(monthPendingClose({ today: "2026-10-02", closedMonths: [], monthsWithActivity: [] }), null);
  assert.equal(monthPendingClose({ today: "2026-10-02", closedMonths: ["2026-08"], monthsWithActivity: ["2026-08", "2026-09"] }), "2026-09");
  // virada de ano
  assert.equal(monthPendingClose({ today: "2027-01-01", closedMonths: [], monthsWithActivity: ["2026-12"] }), "2026-12");
});

// ---------------------------------------------------------------------------
// Boas-vindas pelo WhatsApp (02/10/2026)
// ---------------------------------------------------------------------------
import { buildWelcomeMessage, firstName, zapiPhone } from "../welcome";

test("zapiPhone: coloca o 55 e recusa número que não é telefone", () => {
  assert.equal(zapiPhone("83982004873"), "5583982004873");
  assert.equal(zapiPhone("(83) 98200-4873"), "5583982004873");
  assert.equal(zapiPhone("8332221111"), "558332221111");
  assert.equal(zapiPhone("5583982004873"), "5583982004873");
  assert.equal(zapiPhone("558382004873"), "558382004873");
  assert.equal(zapiPhone(""), null);
  assert.equal(zapiPhone(null), null);
  assert.equal(zapiPhone("12345"), null);
  assert.equal(zapiPhone("184713742393347"), null); // LID não é telefone
});

test("buildWelcomeMessage: boas-vindas, salvar contato, exemplos, manual e link do app", () => {
  assert.equal(firstName("  marcelo martins "), "Marcelo");
  assert.equal(firstName(""), "");
  const msg = buildWelcomeMessage({ name: "ANA paula", appUrl: "https://contay.com.br", botNumber: "(83) 98199-5301" });
  assert.ok(msg.startsWith("Olá, Ana! 👋 Seja bem-vindo(a) ao *Contay*."));
  assert.ok(msg.includes("*Salve este contato*") && msg.includes("(83) 98199-5301"));
  assert.ok(msg.includes("como *Contay*, número (83) 98199-5301.") && !msg.includes("(("));
  assert.ok(msg.includes("gastei 45 no mercado") && msg.includes("300 no cartão Nubank em 3x"));
  assert.ok(msg.includes("https://contay.com.br/manual"));
  assert.ok(msg.includes("tira suas dúvidas") && msg.includes("Pergunte aqui mesmo"));
  assert.ok(msg.trimEnd().endsWith("Para abrir o app: https://contay.com.br"));
  assert.ok(buildWelcomeMessage({ name: null, appUrl: "x", botNumber: "y" }).startsWith("Olá! 👋"));
});


// ---------------------------------------------------------------------------
// Correções de 07/10/2026: total do fechamento, fatura do cartão por período
// e baixa automática em período já fechado.
// ---------------------------------------------------------------------------

test("currentYearMonth/todaySaoPaulo: 23h do último dia do mês em São Paulo ainda é o mês que está acabando", () => {
  // 01/11/2026 01:30 UTC = 31/10/2026 22:30 em São Paulo
  const now = new Date("2026-11-01T01:30:00Z");
  assert.equal(todaySaoPaulo(now), "2026-10-31");
  assert.equal(currentYearMonth(now), "2026-10");
});

test("monthBounds: primeiro e último dia, inclusive fevereiro bissexto", () => {
  assert.deepEqual(monthBounds("2026-10"), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(monthBounds("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(monthBounds("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
});

test("monthTotalOf: total do mês = gasto lançado + contas fixas (caso real do Lucas: 14.190,62 + 4.860,00 = 19.050,62)", () => {
  const snap = computeMonthClosingSnapshot({
    yearMonth: "2026-10",
    income: 13000,
    transactions: [{ dueDate: "2026-10-05", description: "x", amount: 14190.62, categoryKey: "outros", categoryLabel: "Outros" }],
    cardInstallments: [],
    fixedAccountsTotal: 4860,
    investmentsTotal: 0,
  });
  assert.equal(snap.totalSpent, 14190.62);
  assert.equal(monthTotalOf(snap), 19050.62);
  assert.equal(snap.totalPercentOfIncome, 146.54);
  // Fechamento antigo, gravado sem totalCommitted: soma na hora.
  assert.equal(monthTotalOf({ totalSpent: 100.1, fixedAccountsTotal: 200.2 }), 300.3);
});

test("resolveMonthSnapshot: mês em aberto usa renda e contas fixas atuais", () => {
  const snap = resolveMonthSnapshot({
    yearMonth: "2026-10",
    liveIncome: 5000,
    transactions: [{ dueDate: "2026-10-05", description: "x", amount: 400, categoryKey: "outros", categoryLabel: "Outros" }],
    cardInstallments: [],
    liveFixedAccountsTotal: 1200,
    investmentsTotal: 0,
    closing: null,
  });
  assert.equal(snap.closed, false);
  assert.equal(snap.totalCommitted, 1600);
  assert.equal(snap.totalPercentOfIncome, 32);
});

test("resolveMonthSnapshot: mês encerrado congela renda e contas fixas, mas gasto lançado depois entra no mês dele", () => {
  const closing = {
    yearMonth: "2026-09",
    income: "4000.00",
    snapshot: JSON.stringify({ fixedAccountsTotal: 1000, totalSpent: 300 }),
  };
  const snap = resolveMonthSnapshot({
    yearMonth: "2026-09",
    liveIncome: 9999, // renda mudou depois do fechamento
    transactions: [
      { dueDate: "2026-09-05", description: "já estava", amount: 300, categoryKey: "outros", categoryLabel: "Outros" },
      { dueDate: "2026-09-20", description: "lançado depois de encerrar", amount: 50, categoryKey: "outros", categoryLabel: "Outros" },
      { dueDate: "2026-10-02", description: "outro mês", amount: 70, categoryKey: "outros", categoryLabel: "Outros" },
    ],
    cardInstallments: [],
    liveFixedAccountsTotal: 5555, // contas fixas mudaram depois
    investmentsTotal: 0,
    closing,
  });
  assert.equal(snap.closed, true);
  assert.equal(snap.income, 4000);
  assert.equal(snap.fixedAccountsTotal, 1000);
  assert.equal(snap.totalSpent, 350); // 300 + 50 lançado depois; os 70 de outubro ficam fora
  assert.equal(monthTotalOf(snap), 1350);
});

test("resolveMonthSnapshot: snapshot gravado ilegível não quebra (usa contas fixas atuais)", () => {
  const snap = resolveMonthSnapshot({
    yearMonth: "2026-09",
    liveIncome: 1000,
    transactions: [],
    cardInstallments: [],
    liveFixedAccountsTotal: 250,
    investmentsTotal: 0,
    closing: { yearMonth: "2026-09", income: "1000", snapshot: "{quebrado" },
  });
  assert.equal(snap.fixedAccountsTotal, 250);
});

test("sumAmounts: soma em centavos, sem erro de ponto flutuante", () => {
  assert.equal(sumAmounts([0.1, 0.2]), 0.3);
  assert.equal(sumAmounts(["33.34", "33.33", "33.33"]), 100);
  assert.equal(sumAmounts([]), 0);
});

test("groupOpenInstallmentsByMonth: agrupa por mês de vencimento, em ordem", () => {
  const groups = groupOpenInstallmentsByMonth([
    { id: "a", dueDate: "2026-11-10", amount: 100 },
    { id: "b", dueDate: "2026-10-03", amount: 33.34 },
    { id: "c", dueDate: "2026-10-28", amount: 66.66 },
    { id: "d", dueDate: "2027-01-05", amount: 10 },
  ]);
  assert.deepEqual(groups, [
    { yearMonth: "2026-10", amount: 100, count: 2 },
    { yearMonth: "2026-11", amount: 100, count: 1 },
    { yearMonth: "2027-01", amount: 10, count: 1 },
  ]);
});

test("findStatementCovering: datas das pontas contam; período sobreposto vale o que começou por último", () => {
  const statements = [
    { id: "larga", periodStart: "2026-09-01", periodEnd: "2026-10-10" },
    { id: "out", periodStart: "2026-10-01", periodEnd: "2026-10-31" },
  ];
  assert.equal(findStatementCovering(statements, "2026-09-01")?.id, "larga");
  assert.equal(findStatementCovering(statements, "2026-10-10")?.id, "out");
  assert.equal(findStatementCovering(statements, "2026-10-31")?.id, "out");
  assert.equal(findStatementCovering(statements, "2026-11-01"), null);
});

test("planSettlement: exemplo do Marcelo — fatura fechada de 01/09 a 10/10; compra lançada depois com data dentro do período recebe baixa nela", () => {
  const plan = planSettlement({
    openInstallments: [
      { id: "dentro", dueDate: "2026-10-05", amount: 80 },
      { id: "fora", dueDate: "2026-10-11", amount: 90 },
      { id: "futura", dueDate: "2026-11-05", amount: 80 },
    ],
    statements: [{ id: "f1", periodStart: "2026-09-01", periodEnd: "2026-10-10" }],
    closedMonths: [],
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].installment.id, "dentro");
  assert.deepEqual(plan[0].target, { kind: "statement", statementId: "f1", periodStart: "2026-09-01", periodEnd: "2026-10-10" });
});

test("planSettlement: parcela em mês encerrado, sem fatura que cubra a data, vai para a fatura do mês inteiro", () => {
  const plan = planSettlement({
    openInstallments: [
      { id: "set", dueDate: "2026-09-15", amount: 50 },
      { id: "out", dueDate: "2026-10-15", amount: 50 },
    ],
    statements: [],
    closedMonths: ["2026-09"],
  });
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].target, { kind: "closed-month", yearMonth: "2026-09", periodStart: "2026-09-01", periodEnd: "2026-09-30" });
});

test("planSettlement: nada fechado -> nada recebe baixa", () => {
  assert.deepEqual(
    planSettlement({ openInstallments: [{ id: "a", dueDate: "2026-10-15", amount: 1 }], statements: [], closedMonths: [] }),
    []
  );
});

test("suggestFirstDueDate: hoje, ou o mesmo dia do primeiro mês aberto quando hoje já está em período fechado", () => {
  const base = { today: "2026-10-07", addMonths: addMonthsClamped };
  assert.equal(suggestFirstDueDate({ ...base, statements: [], closedMonths: [] }), "2026-10-07");
  assert.equal(
    suggestFirstDueDate({ ...base, statements: [{ id: "f", periodStart: "2026-10-01", periodEnd: "2026-10-31" }], closedMonths: [] }),
    "2026-11-07"
  );
  assert.equal(suggestFirstDueDate({ ...base, statements: [], closedMonths: ["2026-10", "2026-11"] }), "2026-12-07");
  // Fatura fechada só até o dia 05: hoje (07) já está fora dela.
  assert.equal(
    suggestFirstDueDate({ ...base, statements: [{ id: "f", periodStart: "2026-09-06", periodEnd: "2026-10-05" }], closedMonths: [] }),
    "2026-10-07"
  );
});

// ---------------------------------------------------------------------------
// cardCycle.ts — 1º vencimento pelo dia de fechamento/vencimento do cartão
// ---------------------------------------------------------------------------

test("cardCycle: fecha dia 3 e vence dia 10 — antes do fechamento vence no mesmo mês; no dia ou depois, no seguinte", () => {
  const c = { closingDay: 3, dueDay: 10 };
  assert.equal(statementClosingDateForPurchase("2026-10-02", c), "2026-10-03");
  assert.equal(firstDueDateForPurchase("2026-10-02", c), "2026-10-10");
  // No próprio dia do fechamento a compra já vai para a fatura seguinte.
  assert.equal(firstDueDateForPurchase("2026-10-03", c), "2026-11-10");
  assert.equal(firstDueDateForPurchase("2026-10-25", c), "2026-11-10");
});

test("cardCycle: vencimento menor que o fechamento cai no mês seguinte ao fechamento (fecha 28, vence 5)", () => {
  const c = { closingDay: 28, dueDay: 5 };
  assert.equal(firstDueDateForPurchase("2026-10-20", c), "2026-11-05");
  assert.equal(firstDueDateForPurchase("2026-10-28", c), "2026-12-05");
  // Virada de ano.
  assert.equal(firstDueDateForPurchase("2026-12-29", c), "2027-02-05");
  assert.equal(firstDueDateForPurchase("2026-12-01", c), "2027-01-05");
});

test("cardCycle: dia que não existe no mês vira o último dia (fecha 31, vence 30 em fevereiro)", () => {
  const c = { closingDay: 31, dueDay: 30 };
  // Fevereiro de 2027 tem 28 dias: fecha em 28/02; vencimento 30 é <= 31, então vai para março.
  assert.equal(statementClosingDateForPurchase("2027-02-10", c), "2027-02-28");
  assert.equal(firstDueDateForPurchase("2027-02-10", c), "2027-03-30");
  // Compra no último dia de fevereiro (= dia do fechamento ajustado) vai para o fechamento de março.
  assert.equal(statementClosingDateForPurchase("2027-02-28", c), "2027-03-31");
  assert.equal(firstDueDateForPurchase("2027-02-28", c), "2027-04-30");
  // Vencimento 31 em abril vira 30.
  assert.equal(firstDueDateForPurchase("2026-03-05", { closingDay: 10, dueDay: 31 }), "2026-03-31");
  assert.equal(firstDueDateForPurchase("2026-04-12", { closingDay: 10, dueDay: 31 }), "2026-05-31");
  assert.equal(firstDueDateForPurchase("2026-04-05", { closingDay: 10, dueDay: 31 }), "2026-04-30");
});

test("cardCycle: fechamento e vencimento no mesmo dia vencem no mês seguinte ao fechamento", () => {
  assert.equal(firstDueDateForPurchase("2026-10-01", { closingDay: 15, dueDay: 15 }), "2026-11-15");
});

test("cardCycle: hasCardCycle exige os dois dias válidos; describeCardCycle", () => {
  assert.equal(hasCardCycle({ closingDay: 3, dueDay: 10 }), true);
  assert.equal(hasCardCycle({ closingDay: null, dueDay: 10 }), false);
  assert.equal(hasCardCycle({ closingDay: 0, dueDay: 10 }), false);
  assert.equal(hasCardCycle({ closingDay: 3, dueDay: 32 }), false);
  assert.equal(describeCardCycle({ closingDay: 3, dueDay: 10 }), "fecha dia 3 e vence dia 10");
});

// ---------------------------------------------------------------------------
// automations.ts — mensagens automáticas (sem uso / não pagou)
// ---------------------------------------------------------------------------

const H = 60 * 60 * 1000;
const D = 24 * H;
const START = new Date("2026-10-09T00:00:00-03:00");
const T0 = new Date("2026-10-10T10:00:00-03:00").getTime();
const at = (ms: number) => new Date(T0 + ms);
function cand(over: Partial<AutomationCandidate> = {}): AutomationCandidate {
  return {
    role: "user",
    status: "pending",
    createdAt: at(0),
    approvedAt: null,
    billingCanceledAt: null,
    hasPhone: true,
    optedOut: false,
    hasUsage: false,
    ...over,
  };
}
const sent = (kind: "sem_uso" | "nao_pagou", step: number, when: Date): AutomationRecord => ({
  kind,
  step,
  attempts: 1,
  lastAttemptAt: when,
  sentAt: when,
});

test("automações: não pagou — 1ª mensagem só depois de 1 hora do cadastro", () => {
  assert.equal(nextAutomation(cand(), [], at(59 * 60 * 1000), START), null);
  assert.deepEqual(nextAutomation(cand(), [], at(H), START), { kind: "nao_pagou", step: 0, retry: false });
});

test("automações: não pagou — ofertas a cada 15 dias contados do envio anterior, no máximo 6", () => {
  const h0 = [sent("nao_pagou", 0, at(2 * H))];
  assert.equal(nextAutomation(cand(), h0, at(2 * H + 15 * D - 1), START), null);
  assert.deepEqual(nextAutomation(cand(), h0, at(2 * H + 15 * D), START), { kind: "nao_pagou", step: 1, retry: false });
  const all = [0, 1, 2, 3, 4, 5, 6].map((step) => sent("nao_pagou", step, at(2 * H + step * 15 * D)));
  assert.equal(nextAutomation(cand(), all, at(400 * D), START), null);
  const five = all.slice(0, 6); // passos 0..5
  assert.deepEqual(nextAutomation(cand(), five, at(2 * H + 6 * 15 * D), START), { kind: "nao_pagou", step: 6, retry: false });
  assert.equal(AUTOMATION_RULES.naoPagouMaxOffers, 6);
});

test("automações: não pagou — para com SAIR, cancelamento, sem telefone, cadastro antigo ou admin", () => {
  const late = at(2 * H);
  assert.equal(nextAutomation(cand({ optedOut: true }), [], late, START), null);
  assert.equal(nextAutomation(cand({ billingCanceledAt: at(0) }), [], late, START), null);
  assert.equal(nextAutomation(cand({ hasPhone: false }), [], late, START), null);
  assert.equal(nextAutomation(cand({ createdAt: new Date("2026-10-01T10:00:00-03:00") }), [], late, START), null);
  assert.equal(nextAutomation(cand({ role: "admin" }), [], late, START), null);
  assert.equal(nextAutomation(cand({ status: "suspended" }), [], late, START), null);
});

test("automações: sem uso — 7 dias e reforço aos 14 (pelo menos 5 dias depois do 1º); para ao lançar", () => {
  const c = cand({ status: "active", approvedAt: at(0) });
  assert.equal(nextAutomation(c, [], at(7 * D - 1), START), null);
  assert.deepEqual(nextAutomation(c, [], at(7 * D), START), { kind: "sem_uso", step: 1, retry: false });
  // 1º enviado só no dia 12 (ex.: app fora do ar): o 2º espera até o dia 17.
  const h1 = [sent("sem_uso", 1, at(12 * D))];
  assert.equal(nextAutomation(c, h1, at(14 * D), START), null);
  assert.deepEqual(nextAutomation(c, h1, at(17 * D), START), { kind: "sem_uso", step: 2, retry: false });
  const h2 = [sent("sem_uso", 1, at(7 * D)), sent("sem_uso", 2, at(14 * D))];
  assert.equal(nextAutomation(c, h2, at(60 * D), START), null);
  assert.equal(nextAutomation({ ...c, hasUsage: true }, [], at(8 * D), START), null);
  // Liberado antes do início das automações: nada.
  assert.equal(nextAutomation({ ...c, approvedAt: new Date("2026-10-01T10:00:00-03:00") }, [], at(8 * D), START), null);
});

test("automações: quem pagou depois de receber ofertas entra na regra de sem uso", () => {
  const history = [sent("nao_pagou", 0, at(2 * H))];
  const c = cand({ status: "active", approvedAt: at(3 * D) });
  assert.equal(nextAutomation(c, history, at(5 * D), START), null);
  assert.deepEqual(nextAutomation(c, history, at(10 * D), START), { kind: "sem_uso", step: 1, retry: false });
});

test("automações: falha tenta de novo depois de 6 horas, no máximo 3 tentativas", () => {
  const failed = (attempts: number, last: Date): AutomationRecord => ({ kind: "nao_pagou", step: 0, attempts, lastAttemptAt: last, sentAt: null });
  assert.equal(nextAutomation(cand(), [failed(1, at(2 * H))], at(7 * H), START), null);
  assert.deepEqual(nextAutomation(cand(), [failed(1, at(2 * H))], at(8 * H), START), { kind: "nao_pagou", step: 0, retry: true });
  assert.equal(nextAutomation(cand(), [failed(3, at(2 * H))], at(30 * D), START), null);
});

test("automações: janela das 8h às 22h (Brasília)", () => {
  assert.equal(isWithinSendWindow(new Date("2026-10-10T07:59:00-03:00")), false);
  assert.equal(isWithinSendWindow(new Date("2026-10-10T08:00:00-03:00")), true);
  assert.equal(isWithinSendWindow(new Date("2026-10-10T21:59:00-03:00")), true);
  assert.equal(isWithinSendWindow(new Date("2026-10-10T22:00:00-03:00")), false);
  assert.equal(isWithinSendWindow(new Date("2026-10-11T00:30:00Z")), true); // 21h30 em Brasília
  assert.equal(isWithinSendWindow(new Date("2026-10-11T01:30:00Z")), false); // 22h30 em Brasília
});

test("automações: textos — nome, link, preço e SAIR só nas mensagens de oferta", () => {
  const base = { name: "lucas bernardes", appUrl: "https://contay.com.br" };
  const s1 = buildAutomationMessage({ ...base, kind: "sem_uso", step: 1 });
  assert.match(s1, /^Oi, Lucas!/);
  assert.match(s1, /contay\.com\.br\/manual/);
  assert.doesNotMatch(s1, /SAIR/);
  const p0 = buildAutomationMessage({ ...base, kind: "nao_pagou", step: 0 });
  assert.match(p0, /dúvida/);
  assert.match(p0, /R\$ 29,90/);
  assert.match(p0, /contay\.com\.br\/assinatura/);
  assert.match(p0, /SAIR/);
  const offers = [1, 2, 3, 4, 5, 6].map((step) => buildAutomationMessage({ ...base, kind: "nao_pagou", step }));
  assert.equal(new Set(offers).size, 3); // 3 textos que se alternam
  for (const o of offers) {
    assert.match(o, /SAIR/);
    assert.match(o, /R\$ 29,90/);
    assert.ok(o.length < 600, "oferta curta");
  }
  assert.match(buildAutomationMessage({ name: null, appUrl: "x", kind: "nao_pagou", step: 0 }), /^Oi! 👋/);
});

test("automações: reconhece SAIR / PARAR / STOP e não confunde com outras mensagens", () => {
  for (const t of ["SAIR", "sair", " Sair. ", "PARAR", "pare", "stop", "Não quero mais receber"]) assert.equal(isOptOutMessage(t), true, t);
  for (const t of ["quero sair do vermelho", "gastei 45 no mercado", "cancelar assinatura", "", null]) assert.equal(isOptOutMessage(t), false, String(t));
});
