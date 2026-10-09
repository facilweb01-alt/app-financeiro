import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db, withServiceMode } from "@/db/client";
import { automationMessages, users } from "@/db/schema";
import {
  AUTOMATIONS_DEFAULT_START,
  buildAutomationMessage,
  isWithinSendWindow,
  nextAutomation,
  type AutomationKind,
  type AutomationRecord,
  type PlannedAutomation,
} from "@/lib/business/automations";
import { zapiPhone } from "@/lib/business/welcome";
import { publicAppUrl } from "@/lib/appUrl";
import { sendWhatsappText } from "./zapi";

// Envio das mensagens automáticas (regras em src/lib/business/automations.ts).
//
// Quem chama: a rotina agendada do próprio servidor (src/instrumentation.ts,
// a cada 10 minutos, só com AUTOMACOES_WHATSAPP=1) e a rota
// POST /api/automacoes/processar (sem dados de entrada: só envia o que já
// estiver na hora — chamar várias vezes não repete mensagem).
//
// Nunca duplica: antes de mandar, grava a linha (user_id, kind, step) em
// automation_messages; a chave única faz a segunda rodada simultânea
// desistir. Falhou? Grava o erro; a regra tenta de novo depois de 6 horas,
// até 3 tentativas.

export type AutomationRunResult = {
  skipped?: string;
  checked: number;
  sent: number;
  failed: number;
  details: { userId: string; kind: AutomationKind; step: number; ok: boolean; error?: string }[];
};

function startDate(): Date {
  const raw = process.env.AUTOMACOES_DESDE;
  const d = raw ? new Date(raw) : new Date(AUTOMATIONS_DEFAULT_START);
  return Number.isNaN(d.getTime()) ? new Date(AUTOMATIONS_DEFAULT_START) : d;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reserva o envio. Devolve false se outra rodada já reservou (ou o estado mudou). */
async function claim(userId: string, plan: PlannedAutomation, previous: AutomationRecord | null, now: Date): Promise<boolean> {
  return withServiceMode(async () => {
    if (!plan.retry) {
      const inserted = await db
        .insert(automationMessages)
        .values({ userId, kind: plan.kind, step: plan.step, attempts: 1, lastAttemptAt: now })
        .onConflictDoNothing()
        .returning({ id: automationMessages.id });
      return inserted.length > 0;
    }
    const updated = await db
      .update(automationMessages)
      .set({ attempts: sql`${automationMessages.attempts} + 1`, lastAttemptAt: now, error: null })
      .where(
        and(
          eq(automationMessages.userId, userId),
          eq(automationMessages.kind, plan.kind),
          eq(automationMessages.step, plan.step),
          isNull(automationMessages.sentAt),
          eq(automationMessages.attempts, previous?.attempts ?? 0)
        )
      )
      .returning({ id: automationMessages.id });
    return updated.length > 0;
  });
}

async function markResult(userId: string, plan: PlannedAutomation, error: string | null) {
  await withServiceMode(() =>
    db
      .update(automationMessages)
      .set(error ? { error: error.slice(0, 300) } : { sentAt: new Date(), error: null })
      .where(
        and(eq(automationMessages.userId, userId), eq(automationMessages.kind, plan.kind), eq(automationMessages.step, plan.step))
      )
  );
}

export async function processAutomations(options: { now?: Date; limit?: number; delayMs?: number; ignoreWindow?: boolean } = {}): Promise<AutomationRunResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 10;
  // Intervalo entre mensagens da mesma rodada (não disparar em rajada).
  const delayMs = options.delayMs ?? Number(process.env.AUTOMACOES_INTERVALO_MS ?? 2500);
  // Só para os testes locais: AUTOMACOES_IGNORAR_HORARIO=1 desliga a janela 8h–22h.
  const ignoreWindow = options.ignoreWindow ?? process.env.AUTOMACOES_IGNORAR_HORARIO === "1";
  const result: AutomationRunResult = { checked: 0, sent: 0, failed: 0, details: [] };

  if (!ignoreWindow && !isWithinSendWindow(now)) {
    return { ...result, skipped: "Fora do horário de envio (8h às 22h, Brasília)." };
  }

  const start = startDate();
  // Candidatos: cadastro sem pagamento ou conta ativa, com WhatsApp, sem SAIR,
  // a partir da data de início. "Já usou" = tem lançamento, compra no cartão
  // ou conta fixa.
  const candidates = await withServiceMode(() =>
    db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        status: users.status,
        whatsappPhone: users.whatsappPhone,
        createdAt: users.createdAt,
        approvedAt: users.approvedAt,
        billingCanceledAt: users.billingCanceledAt,
        marketingOptOutAt: users.marketingOptOutAt,
        hasUsage: sql<boolean>`(
          exists (select 1 from transactions t where t.user_id = "users"."id")
          or exists (select 1 from fixed_accounts f where f.user_id = "users"."id")
          or exists (select 1 from card_purchases p join credit_cards c on c.id = p.card_id where c.user_id = "users"."id")
        )`,
      })
      .from(users)
      .where(
        and(
          eq(users.role, "user"),
          isNotNull(users.whatsappPhone),
          isNull(users.marketingOptOutAt),
          or(
            and(eq(users.status, "pending"), gte(users.createdAt, start), isNull(users.billingCanceledAt)),
            and(eq(users.status, "active"), gte(users.approvedAt, start))
          )
        )
      )
      .limit(500)
  );
  result.checked = candidates.length;
  if (candidates.length === 0) return result;

  const history = await withServiceMode(() =>
    db
      .select({
        userId: automationMessages.userId,
        kind: automationMessages.kind,
        step: automationMessages.step,
        attempts: automationMessages.attempts,
        lastAttemptAt: automationMessages.lastAttemptAt,
        sentAt: automationMessages.sentAt,
      })
      .from(automationMessages)
      .where(inArray(automationMessages.userId, candidates.map((c) => c.id)))
  );

  const appUrl = publicAppUrl();
  for (const c of candidates) {
    if (result.sent + result.failed >= limit) break;
    const own: AutomationRecord[] = history
      .filter((h) => h.userId === c.id)
      .map((h) => ({ kind: h.kind as AutomationKind, step: h.step, attempts: h.attempts, lastAttemptAt: h.lastAttemptAt, sentAt: h.sentAt }));
    const plan = nextAutomation(
      {
        role: c.role,
        status: c.status,
        createdAt: c.createdAt,
        approvedAt: c.approvedAt,
        billingCanceledAt: c.billingCanceledAt,
        hasPhone: Boolean(c.whatsappPhone),
        optedOut: Boolean(c.marketingOptOutAt),
        hasUsage: Boolean(c.hasUsage),
      },
      own,
      now,
      start
    );
    if (!plan) continue;

    const previous = own.find((r) => r.kind === plan.kind && r.step === plan.step) ?? null;
    if (!(await claim(c.id, plan, previous, now))) continue;

    if (result.sent + result.failed > 0 && delayMs > 0) await sleep(delayMs);
    try {
      const phone = zapiPhone(c.whatsappPhone);
      if (!phone) throw new Error("Número de WhatsApp do cadastro inválido.");
      await sendWhatsappText(phone, buildAutomationMessage({ kind: plan.kind, step: plan.step, name: c.name, appUrl }));
      await markResult(c.id, plan, null);
      result.sent += 1;
      result.details.push({ userId: c.id, kind: plan.kind, step: plan.step, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido.";
      console.error("[automacoes] falha ao enviar", plan.kind, plan.step, "para", c.id, message);
      await markResult(c.id, plan, message);
      result.failed += 1;
      result.details.push({ userId: c.id, kind: plan.kind, step: plan.step, ok: false, error: message });
    }
  }
  return result;
}

