// Mensagens automáticas pelo WhatsApp (pedidos do Marcelo em 09/10/2026).
// Regras puras (sem banco nem Z-API), testadas em __tests__/run-tests.ts.
//
//  • "sem_uso": cliente que pagou (conta ativa) e ainda não lançou nada.
//      passo 1 — 5 dias depois de a conta ser liberada (era 7 até 13/10/2026);
//      passo 2 — 10 dias depois (reforço), pelo menos 5 dias após o passo 1.
//    Para assim que houver qualquer lançamento (gasto, compra no cartão ou
//    conta fixa).
//  • "nao_pagou": fez o cadastro na página de vendas e não pagou.
//      passo 0 — 1 hora depois do cadastro ("ficou alguma dúvida?");
//      passos 1 a 6 — uma oferta curta a cada 15 dias (a contar do envio
//      anterior). Para quando pagar, quando responder SAIR ou depois da 6ª.
//  • "teste" (11/10/2026): cadastro em teste grátis de 7 dias que ainda não pagou.
//      passos 3, 4 e 5 (13/10/2026) — dicas de uso, um dia sim, outro não:
//        no 2º, 4º e 6º dia do teste (faltando 6, 4 e 2 dias para o fim).
//        Não vão para quem já deixou o cartão cadastrado (já contratou);
//      passo 1 — na véspera do último dia do teste;
//      passo 2 — no último dia do teste.
//    As duas levam o link de pagamento para continuar. Quem já deixou o
//    cartão cadastrado recebe o aviso de que a 1ª mensalidade será cobrada.
//    Quem pagou não recebe. Depois que o teste termina sem pagamento, seguem
//    as ofertas de "nao_pagou" (passos 1 a 6, a 1ª 15 dias depois do fim do
//    teste); o passo 0 de "nao_pagou" não se aplica a quem teve teste.
//  • Só sai mensagem das 8h às 22h (horário de Brasília); fora disso espera.
//  • Envio que falhou é tentado de novo depois de 6 horas, até 3 tentativas.
//  • Só entra quem se cadastrou/foi liberado a partir da data de início
//    (AUTOMATIONS_DEFAULT_START), para clientes e cadastros antigos não
//    receberem tudo de uma vez no dia em que a função entrar no ar.

export type AutomationKind = "sem_uso" | "nao_pagou" | "teste";

export const AUTOMATION_RULES = {
  semUsoDays: [5, 10] as const,
  /** Dicas no teste grátis: quantos dias faltam para o fim em cada uma (passos 3, 4 e 5). */
  trialTipsDaysLeft: [6, 4, 2] as const,
  semUsoMinGapDays: 5,
  naoPagouFirstAfterMinutes: 60,
  naoPagouEveryDays: 15,
  naoPagouMaxOffers: 6,
  retryAfterHours: 6,
  maxAttempts: 3,
  windowStartHour: 8, // inclusive
  windowEndHour: 22, // exclusive (até 21h59)
} as const;

/** A partir de quando as regras valem (cadastro/liberação). Pode ser trocada pela variável AUTOMACOES_DESDE. */
export const AUTOMATIONS_DEFAULT_START = "2026-10-09T00:00:00-03:00";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type AutomationCandidate = {
  role: string;
  status: string; // 'pending' | 'active' | 'suspended'
  createdAt: Date;
  approvedAt: Date | null;
  billingCanceledAt: Date | null;
  hasPhone: boolean;
  optedOut: boolean;
  hasUsage: boolean; // já lançou algo (gasto, compra no cartão ou conta fixa)
  /** Último dia do teste grátis ("YYYY-MM-DD"); nulo/ausente = conta sem teste. */
  trialEndsAt?: string | null;
  /** Já deixou o cartão recorrente cadastrado (contratou durante o teste). */
  cardOnFile?: boolean;
};

export type AutomationRecord = {
  kind: AutomationKind;
  step: number;
  attempts: number;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
};

export type PlannedAutomation = { kind: AutomationKind; step: number; retry: boolean };

/** Data ("YYYY-MM-DD") em São Paulo. O servidor roda em UTC. */
export function saoPauloDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Dias inteiros de a até b ("YYYY-MM-DD"); negativo se b já passou. */
function daysBetweenDates(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY);
}

/** Hora (0–23) em São Paulo. O servidor roda em UTC. */
export function saoPauloHour(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(hour) % 24;
}

export function isWithinSendWindow(now: Date): boolean {
  const h = saoPauloHour(now);
  return h >= AUTOMATION_RULES.windowStartHour && h < AUTOMATION_RULES.windowEndHour;
}

function record(history: AutomationRecord[], kind: AutomationKind, step: number) {
  return history.find((r) => r.kind === kind && r.step === step) ?? null;
}

/**
 * Situação de um passo:
 *  - "sent": já enviado → seguir para o próximo passo;
 *  - "due": pode enviar agora (nunca tentado, ou falhou e já passou o tempo de nova tentativa);
 *  - "wait": ainda não (falhou há pouco) ou desistiu (3 tentativas) → parar.
 */
function stepState(rec: AutomationRecord | null, now: Date): "sent" | "due" | "retry" | "wait" {
  if (!rec) return "due";
  if (rec.sentAt) return "sent";
  if (rec.attempts >= AUTOMATION_RULES.maxAttempts) return "wait";
  const last = rec.lastAttemptAt?.getTime() ?? 0;
  return now.getTime() - last >= AUTOMATION_RULES.retryAfterHours * HOUR ? "retry" : "wait";
}

/** Próxima mensagem que deve sair para este cliente agora, ou null. Não olha a janela de horário. */
export function nextAutomation(
  c: AutomationCandidate,
  history: AutomationRecord[],
  now: Date,
  startAt: Date = new Date(AUTOMATIONS_DEFAULT_START)
): PlannedAutomation | null {
  if (c.role !== "user" || !c.hasPhone || c.optedOut) return null;
  const t = now.getTime();

  if (c.status === "active") {
    if (!c.approvedAt || c.approvedAt.getTime() < startAt.getTime() || c.hasUsage) return null;
    const base = c.approvedAt.getTime();
    let prevSent: Date | null = null;
    for (let i = 0; i < AUTOMATION_RULES.semUsoDays.length; i++) {
      const step = i + 1;
      const rec = record(history, "sem_uso", step);
      const state = stepState(rec, now);
      if (state === "sent") {
        prevSent = rec!.sentAt;
        continue;
      }
      if (state === "wait") return null;
      let dueAt = base + AUTOMATION_RULES.semUsoDays[i] * DAY;
      if (prevSent) dueAt = Math.max(dueAt, prevSent.getTime() + AUTOMATION_RULES.semUsoMinGapDays * DAY);
      return t >= dueAt ? { kind: "sem_uso", step, retry: state === "retry" } : null;
    }
    return null;
  }

  if (c.status === "pending") {
    if (c.billingCanceledAt || c.createdAt.getTime() < startAt.getTime()) return null;

    // Teste grátis ainda valendo: dicas de uso no 2º, 4º e 6º dia e os dois
    // avisos de fim de teste (véspera e último dia), cada um no seu dia.
    // Passou o dia sem enviar (servidor fora do ar, fora do horário)? Não
    // manda atrasado.
    const trialDaysLeft = c.trialEndsAt ? daysBetweenDates(saoPauloDate(now), c.trialEndsAt) : null;
    if (trialDaysLeft !== null && trialDaysLeft >= 0) {
      const tipIndex = (AUTOMATION_RULES.trialTipsDaysLeft as readonly number[]).indexOf(trialDaysLeft);
      // dica = passos 3, 4, 5; quem já cadastrou o cartão (já contratou) não recebe dicas
      const step = trialDaysLeft === 1 ? 1 : trialDaysLeft === 0 ? 2 : tipIndex >= 0 && !c.cardOnFile ? 3 + tipIndex : null;
      if (step === null) return null;
      const state = stepState(record(history, "teste", step), now);
      if (state === "sent" || state === "wait") return null;
      return { kind: "teste", step, retry: state === "retry" };
    }

    let prevSent: Date | null = null;
    // Quem teve teste grátis não recebe o passo 0 ("começou o cadastro e não
    // pagou", 1 hora depois): vai direto para as ofertas, contadas do fim do teste.
    const firstStep = c.trialEndsAt ? 1 : 0;
    const trialEndTime = c.trialEndsAt ? new Date(`${c.trialEndsAt}T12:00:00-03:00`).getTime() : null;
    for (let step = firstStep; step <= AUTOMATION_RULES.naoPagouMaxOffers; step++) {
      const rec = record(history, "nao_pagou", step);
      const state = stepState(rec, now);
      if (state === "sent") {
        prevSent = rec!.sentAt;
        continue;
      }
      if (state === "wait") return null;
      const dueAt =
        step === 0
          ? c.createdAt.getTime() + AUTOMATION_RULES.naoPagouFirstAfterMinutes * 60 * 1000
          : (prevSent?.getTime() ?? trialEndTime ?? c.createdAt.getTime()) + AUTOMATION_RULES.naoPagouEveryDays * DAY;
      return t >= dueAt ? { kind: "nao_pagou", step, retry: state === "retry" } : null;
    }
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Textos. Regras de cuidado: nada de afirmar a situação financeira da pessoa
// nem prometer resultado; oferta sempre com a saída "responda SAIR".
// ---------------------------------------------------------------------------

function hello(name: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  const who = first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "";
  return `Oi${who ? `, ${who}` : ""}! 👋`;
}

const OPT_OUT_LINE = "Se não quiser mais receber estas mensagens, responda *SAIR*.";

export function buildAutomationMessage(input: {
  kind: AutomationKind;
  step: number;
  name: string | null;
  appUrl: string;
  /** Só para kind "teste": último dia do teste ("YYYY-MM-DD"). */
  trialEndsAt?: string | null;
  /** Só para kind "teste": a pessoa já deixou o cartão cadastrado (a 1ª mensalidade será cobrada nele). */
  cardOnFile?: boolean;
  /** Só para kind "teste": já fez algum lançamento durante o teste. */
  hasUsage?: boolean;
}): string {
  const { kind, step, name, appUrl } = input;

  if (kind === "teste" && step >= 3) return buildTrialTip(step - 2, input);

  if (kind === "teste") {
    const lastDay = step >= 2;
    const end = input.trialEndsAt ? ` (${input.trialEndsAt.slice(8, 10)}/${input.trialEndsAt.slice(5, 7)})` : "";
    const when = lastDay ? `termina *hoje*${end}` : `termina *amanhã*${end}`;
    if (input.cardOnFile) {
      return [
        `${hello(name)} Seu teste grátis do *Contay* ${when}.`,
        "",
        `Como você já cadastrou o cartão, não precisa fazer nada: a 1ª mensalidade de R$ 29,90 será cobrada nele ${lastDay ? "hoje" : "amanhã"} e o app continua liberado, sem interrupção.`,
        "",
        `Mudou de ideia? Fale com o suporte por aqui antes da cobrança que a gente cancela. Para ver a assinatura: ${appUrl}/assinatura`,
        "",
        OPT_OUT_LINE,
      ].join("\n");
    }
    return [
      `${hello(name)} Seu teste grátis do *Contay* ${when}.`,
      "",
      input.hasUsage
        ? "Seus lançamentos, cartões e contas continuam guardados. Para seguir usando sem interrupção, é só assinar:"
        : "Para continuar com o app e lançar seus gastos pelo WhatsApp, é só assinar:",
      `👉 ${appUrl}/assinatura`,
      "",
      "São R$ 29,90 por mês, no Pix ou no cartão de crédito, sem fidelidade: cancela quando quiser. No plano anual tem 15% de desconto (R$ 304,98 por ano).",
      lastDay
        ? "A partir de amanhã o acesso fica pausado até a assinatura (nada é apagado)."
        : "Assinando hoje você não perde nenhum dia: a mensalidade só começa a contar no fim do teste.",
      "",
      "Dúvidas? Responda aqui.",
      OPT_OUT_LINE,
    ].join("\n");
  }

  if (kind === "sem_uso" && step === 1) {
    return [
      `${hello(name)} Aqui é o *Contay*.`,
      "",
      "Vi que você ainda não fez nenhum lançamento. Começar leva menos de 1 minuto: é só mandar aqui mesmo, do seu jeito:",
      "• gastei 45 no mercado",
      "• uber 18,50",
      "• 300 no cartão Nubank em 3x",
      "",
      "Com os gastos lançados, o painel mostra para onde vai o dinheiro, quanto já está comprometido com cartões e parcelas e quanto ainda sobra no mês.",
      "",
      "❓ Ficou alguma dúvida? Pergunte aqui que eu respondo.",
      `📘 Manual: ${appUrl}/manual`,
    ].join("\n");
  }

  if (kind === "sem_uso") {
    return [
      `${hello(name)} Seu *Contay* está pronto, esperando o primeiro lançamento. 🙂`,
      "",
      "Uma dica para começar com o mês inteiro à vista:",
      "• cadastre seus cartões com o dia do fechamento e do vencimento;",
      "• inclua as contas fixas (aluguel, luz, internet);",
      "• lance os gastos do dia pelo WhatsApp, por exemplo: \"gastei 30 na farmácia\".",
      "",
      "Se travou em alguma parte, me conte aqui que eu te ajudo.",
      `Para abrir o app: ${appUrl}`,
    ].join("\n");
  }

  if (step === 0) {
    return [
      `${hello(name)} Aqui é o *Contay*.`,
      "",
      "Vi que você começou seu cadastro, mas o pagamento ainda não foi concluído. Ficou alguma dúvida sobre o Contay? Pergunte aqui que eu respondo na hora.",
      "",
      `Para concluir, entre em ${appUrl}/assinatura com o e-mail e a senha do cadastro e escolha Pix ou cartão. São R$ 29,90 por mês, sem fidelidade.`,
      "",
      OPT_OUT_LINE,
    ].join("\n");
  }

  const offers = [
    [
      `${hello(name)} Ainda dá tempo de organizar o mês com o *Contay*. 💙`,
      "",
      "• lance gastos pelo WhatsApp em segundos;",
      "• cartões, parcelas e contas fixas num lugar só;",
      "• veja quanto ainda sobra no mês.",
    ],
    [
      `${hello(name)} Sabe quanto das próximas faturas já está comprometido com parcelas?`,
      "",
      "No *Contay* você vê mês a mês o que ainda vai vencer em cada cartão, sem planilha. E lança os gastos mandando uma mensagem aqui.",
    ],
    [
      `${hello(name)} Planilha dá trabalho; mensagem não. 😉`,
      "",
      "No *Contay* você escreve \"gastei 45 no mercado\" e pronto: o gasto entra na categoria certa e aparece no painel do mês.",
    ],
  ];
  const body = offers[(step - 1) % offers.length];
  return [
    ...body,
    "",
    `R$ 29,90 por mês, sem fidelidade. Para concluir: ${appUrl}/assinatura`,
    "Dúvidas? Responda aqui.",
    OPT_OUT_LINE,
  ].join("\n");
}

/**
 * Dicas do teste grátis (13/10/2026, pedido do Marcelo): uma mensagem
 * diferente no 2º, 4º e 6º dia, lembrando os benefícios de usar o app.
 * Sem prometer resultado financeiro; sempre com a saída SAIR.
 */
function buildTrialTip(
  n: number,
  input: { name: string | null; appUrl: string; trialEndsAt?: string | null; hasUsage?: boolean }
): string {
  const { name, appUrl } = input;
  const host = appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const end = input.trialEndsAt ? `${input.trialEndsAt.slice(8, 10)}/${input.trialEndsAt.slice(5, 7)}` : null;
  const until = end ? `Seu teste grátis vai até ${end}.` : "Seu teste grátis continua liberado.";

  if (n === 1) {
    return [
      `${hello(name)} Dica do *Contay* para o seu 2º dia:`,
      "",
      "Você não precisa nem abrir o app para lançar um gasto. Aqui no WhatsApp vale de 3 jeitos:",
      "✍️ escrever: \"gastei 45 no mercado\"",
      "🎙️ mandar um áudio: \"trinta reais na farmácia\"",
      "📸 mandar a foto do cupom",
      "",
      "O Contay lança na categoria certa e o painel já mostra para onde está indo o seu dinheiro no mês.",
      "",
      input.hasUsage
        ? "Você já começou 👏 Quanto mais lançamentos, mais completo fica o retrato do seu mês."
        : "Que tal testar agora com o último gasto que você fez? Leva 5 segundos. 😉",
      "",
      until,
      OPT_OUT_LINE,
    ].join("\n");
  }

  if (n === 2) {
    return [
      `${hello(name)} Pergunta rápida: você sabe quanto das próximas faturas do cartão já está comprometido? 💳`,
      "",
      "No *Contay* é só mandar \"400 no cartão Nubank em 4x\": ele cria as parcelas, coloca cada uma na fatura certa e já soma tudo nos próximos meses. Você vê antes quanto cada mês já tem de compromisso, sem ser pego de surpresa na fatura.",
      "",
      "💡 Cadastre também as contas fixas (aluguel, luz, internet). Assim o painel mostra quanto da sua renda já está reservado e quanto ainda fica livre.",
      "",
      `Abrir o app: ${host}`,
      until,
      OPT_OUT_LINE,
    ].join("\n");
  }

  return [
    `${hello(name)} Faltam 2 dias para o fim do seu teste grátis do *Contay*${end ? ` (${end})` : ""}. 📊`,
    "",
    "Já experimentou estes recursos?",
    "🎯 Limites por categoria: o Contay avisa quando você chega perto do limite de mercado, lazer ou compras;",
    "📄 Fechamento do mês em PDF, com quanto da renda cada categoria consumiu;",
    "📈 Metas de investimento com a barra de progresso;",
    "🙈 Modo discreto: um toque no olho e os valores somem da tela.",
    "",
    `Gostou? Para continuar sem interrupção: 👉 ${appUrl}/assinatura`,
    "R$ 29,90 por mês, ou o anual com 15% de desconto em até 12x no cartão. Sem fidelidade.",
    "",
    OPT_OUT_LINE,
  ].join("\n");
}

/** Mensagem recebida é um pedido para parar as ofertas? (SAIR, PARAR, STOP…) */
export function isOptOutMessage(text: string | null | undefined): boolean {
  const t = (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/g, "");
  return ["sair", "parar", "pare", "stop", "nao quero mais receber", "nao quero receber mensagens"].includes(t);
}
