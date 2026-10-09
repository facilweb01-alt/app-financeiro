// Mensagens automáticas pelo WhatsApp (pedidos do Marcelo em 09/10/2026).
// Regras puras (sem banco nem Z-API), testadas em __tests__/run-tests.ts.
//
//  • "sem_uso": cliente que pagou (conta ativa) e ainda não lançou nada.
//      passo 1 — 7 dias depois de a conta ser liberada;
//      passo 2 — 14 dias depois (reforço), pelo menos 5 dias após o passo 1.
//    Para assim que houver qualquer lançamento (gasto, compra no cartão ou
//    conta fixa).
//  • "nao_pagou": fez o cadastro na página de vendas e não pagou.
//      passo 0 — 1 hora depois do cadastro ("ficou alguma dúvida?");
//      passos 1 a 6 — uma oferta curta a cada 15 dias (a contar do envio
//      anterior). Para quando pagar, quando responder SAIR ou depois da 6ª.
//  • Só sai mensagem das 8h às 22h (horário de Brasília); fora disso espera.
//  • Envio que falhou é tentado de novo depois de 6 horas, até 3 tentativas.
//  • Só entra quem se cadastrou/foi liberado a partir da data de início
//    (AUTOMATIONS_DEFAULT_START), para clientes e cadastros antigos não
//    receberem tudo de uma vez no dia em que a função entrar no ar.

export type AutomationKind = "sem_uso" | "nao_pagou";

export const AUTOMATION_RULES = {
  semUsoDays: [7, 14] as const,
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
};

export type AutomationRecord = {
  kind: AutomationKind;
  step: number;
  attempts: number;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
};

export type PlannedAutomation = { kind: AutomationKind; step: number; retry: boolean };

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
    let prevSent: Date | null = null;
    for (let step = 0; step <= AUTOMATION_RULES.naoPagouMaxOffers; step++) {
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
          : (prevSent?.getTime() ?? c.createdAt.getTime()) + AUTOMATION_RULES.naoPagouEveryDays * DAY;
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

export function buildAutomationMessage(input: { kind: AutomationKind; step: number; name: string | null; appUrl: string }): string {
  const { kind, step, name, appUrl } = input;

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
