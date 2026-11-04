import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db, withServiceMode } from "@/db/client";
import { automationMessages, users } from "@/db/schema";
import {
  AUTOMATIONS_DEFAULT_START,
  buildAutomationMessage,
  isWithinSendWindow,
  nextAutomation,
  type ActivationSummary,
  type AutomationKind,
  type AutomationRecord,
  type PlannedAutomation,
} from "@/lib/business/automations";
import { zapiPhone } from "@/lib/business/welcome";
import { publicAppUrl } from "@/lib/appUrl";
import { sendWhatsappText } from "./zapi";
import { reactivateWithNewTrial } from "@/lib/billing/service";
import { todayInSaoPaulo } from "@/lib/billing/core";

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
        trialEndsAt: users.trialEndsAt,
        billingMethod: users.billingMethod,
        cardRequired: users.cardRequired,
        reactivatedAt: users.reactivatedAt,
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
            and(eq(users.status, "pending"), or(gte(users.createdAt, start), isNotNull(users.reactivatedAt)), isNull(users.billingCanceledAt)),
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
        trialEndsAt: c.trialEndsAt,
        cardOnFile: c.billingMethod === "CREDIT_CARD",
        cardRequired: c.cardRequired,
        reactivatedAt: c.reactivatedAt,
      },
      own,
      now,
      start,
      { eveningHour: ignoreWindow ? 0 : undefined }
    );
    if (!plan) continue;

    const previous = own.find((r) => r.kind === plan.kind && r.step === plan.step) ?? null;
    if (!(await claim(c.id, plan, previous, now))) continue;

    if (result.sent + result.failed > 0 && delayMs > 0) await sleep(delayMs);
    try {
      const phone = zapiPhone(c.whatsappPhone);
      if (!phone) throw new Error("Número de WhatsApp do cadastro inválido.");
      const summary = plan.kind === "ativacao" && plan.step === 3 ? await activationSummary(c.id) : null;
      await sendWhatsappText(phone, buildAutomationMessage({
          summary,
          kind: plan.kind,
          step: plan.step,
          name: c.name,
          appUrl,
          trialEndsAt: c.trialEndsAt,
          cardOnFile: c.billingMethod === "CREDIT_CARD",
          cardRequired: c.cardRequired,
          hasUsage: Boolean(c.hasUsage),
        }));
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


// --- Resumo do 3º dia do teste (04/11/2026) ---------------------------------

/** O que a pessoa já lançou: registros, gastos do mês, maior categoria e parcelas futuras. */
async function activationSummary(userId: string): Promise<ActivationSummary | null> {
  try {
    const today = todayInSaoPaulo();
    const monthStart = `${today.slice(0, 7)}-01`;
    const rows = await withServiceMode(() =>
      db.execute<{ entries: string; month_total: string; top_name: string | null; top_total: string | null; future_total: string; future_months: string }>(sql`
        with month_items as (
          select coalesce(c.label, 'Outros') as cat, t.amount::numeric as amount
            from transactions t left join categories c on c.id = t.category_id
           where t.user_id = ${userId} and t.due_date >= ${monthStart}::date and t.due_date < (${monthStart}::date + interval '1 month')
          union all
          select coalesce(c.label, 'Cartão') as cat, i.amount::numeric
            from card_installments i
            join card_purchases p on p.id = i.card_purchase_id
            join credit_cards cc on cc.id = p.card_id
            left join categories c on c.id = p.category_id
           where cc.user_id = ${userId} and i.due_date >= ${monthStart}::date and i.due_date < (${monthStart}::date + interval '1 month')
        ),
        top as (select cat, sum(amount) as total from month_items group by cat order by total desc limit 1),
        future as (
          select coalesce(sum(i.amount::numeric), 0) as total,
                 count(distinct date_trunc('month', i.due_date)) as months
            from card_installments i
            join card_purchases p on p.id = i.card_purchase_id
            join credit_cards cc on cc.id = p.card_id
           where cc.user_id = ${userId} and i.due_date >= (${monthStart}::date + interval '1 month')
        )
        select
          ((select count(*) from transactions where user_id = ${userId})
            + (select count(*) from card_purchases p join credit_cards cc on cc.id = p.card_id where cc.user_id = ${userId}))::text as entries,
          (select coalesce(sum(amount), 0) from month_items)::text as month_total,
          (select cat from top) as top_name,
          (select total from top)::text as top_total,
          (select total from future)::text as future_total,
          (select months from future)::text as future_months
      `)
    );
    const r = (rows as unknown as { entries: string; month_total: string; top_name: string | null; top_total: string | null; future_total: string; future_months: string }[])[0];
    if (!r) return null;
    return {
      entries: Number(r.entries),
      monthTotal: Number(r.month_total),
      topCategory: r.top_name ? { name: r.top_name, total: Number(r.top_total) } : null,
      futureInstallments: Number(r.future_total),
      futureMonths: Number(r.future_months),
    };
  } catch (err) {
    console.error("[automacoes] resumo do teste", userId, err instanceof Error ? err.message : err);
    return null;
  }
}

// --- Reativação de cadastros antigos (04/11/2026) ----------------------------
//
// Liga com REATIVACAO_WHATSAPP=1. Quem entra: conta que se cadastrou pelo site
// ANTES de REATIVACAO_ATE (padrão: 05/11/2026), nunca pagou, não cancelou, não
// respondeu SAIR, tem WhatsApp e está com o teste encerrado ou parada no
// "cartão obrigatório". Por dia, no máximo REATIVACAO_POR_DIA (padrão 20)
// mensagens, para não parecer disparo em massa (o número do WhatsApp pode ser
// bloqueado). Antes de mandar, a conta ganha 7 dias de teste novo, sem cartão.
// Cada conta recebe uma vez só (automation_messages "reativacao", passo 1).

export const REACTIVATION_DEFAULT_UNTIL = "2026-11-05T00:00:00-03:00";

export async function processReactivations(
  options: { now?: Date; perDay?: number; delayMs?: number; ignoreWindow?: boolean } = {}
): Promise<AutomationRunResult> {
  const now = options.now ?? new Date();
  const result: AutomationRunResult = { checked: 0, sent: 0, failed: 0, details: [] };
  if (process.env.REATIVACAO_WHATSAPP !== "1") return { ...result, skipped: "Reativação desligada." };
  const ignoreWindow = options.ignoreWindow ?? process.env.AUTOMACOES_IGNORAR_HORARIO === "1";
  if (!ignoreWindow && !isWithinSendWindow(now)) return { ...result, skipped: "Fora do horário de envio (8h às 22h, Brasília)." };
  const perDay = options.perDay ?? Math.max(0, Number(process.env.REATIVACAO_POR_DIA ?? 20) || 0);
  const delayMs = options.delayMs ?? Number(process.env.AUTOMACOES_INTERVALO_MS ?? 2500);
  const untilRaw = process.env.REATIVACAO_ATE ? new Date(process.env.REATIVACAO_ATE) : new Date(REACTIVATION_DEFAULT_UNTIL);
  const until = Number.isNaN(untilRaw.getTime()) ? new Date(REACTIVATION_DEFAULT_UNTIL) : untilRaw;
  const today = todayInSaoPaulo(now);

  // Quantas já saíram hoje (horário de Brasília).
  const [{ count }] = (await withServiceMode(() =>
    db.execute(sql`
      select count(*)::int as count from automation_messages
       where kind = 'reativacao'
         and (last_attempt_at at time zone 'America/Sao_Paulo')::date = ${today}::date
    `)
  )) as unknown as { count: number }[];
  let left = perDay - Number(count ?? 0);
  if (left <= 0) return { ...result, skipped: "Limite de hoje já atingido." };

  const candidates = await withServiceMode(() =>
    db
      .select({ id: users.id, name: users.name, whatsappPhone: users.whatsappPhone })
      .from(users)
      .where(
        and(
          eq(users.role, "user"),
          eq(users.status, "pending"),
          eq(users.billingEnabled, true),
          eq(users.billingMethod, "PIX"),
          isNull(users.billingCanceledAt),
          isNull(users.marketingOptOutAt),
          isNull(users.reactivatedAt),
          isNotNull(users.whatsappPhone),
          lt(users.createdAt, until),
          or(eq(users.cardRequired, true), lt(users.trialEndsAt, today)),
          sql`not exists (select 1 from automation_messages a where a.user_id = "users"."id" and a.kind = 'reativacao')`,
          sql`not exists (select 1 from billing_payments b where b.user_id = "users"."id" and b.status in ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH'))`
        )
      )
      .orderBy(sql`${users.createdAt} desc`)
      .limit(Math.min(left, 50))
  );
  result.checked = candidates.length;
  const appUrl = publicAppUrl();
  const plan: PlannedAutomation = { kind: "reativacao", step: 1, retry: false };

  for (const c of candidates) {
    if (left <= 0) break;
    const phone = zapiPhone(c.whatsappPhone);
    if (!phone) continue;
    if (!(await claim(c.id, plan, null, now))) continue;
    left -= 1;
    if (result.sent + result.failed > 0 && delayMs > 0) await sleep(delayMs);
    try {
      if (!(await reactivateWithNewTrial(c.id, today))) throw new Error("Conta não pôde ser reativada (já pagou, cancelou ou mudou).");
      await sendWhatsappText(phone, buildAutomationMessage({ kind: "reativacao", step: 1, name: c.name, appUrl }));
      await markResult(c.id, plan, null);
      result.sent += 1;
      result.details.push({ userId: c.id, kind: "reativacao", step: 1, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido.";
      console.error("[reativacao] falha", c.id, message);
      // não tenta de novo sozinho: marca 3 tentativas
      await withServiceMode(() =>
        db
          .update(automationMessages)
          .set({ error: message.slice(0, 300), attempts: 3 })
          .where(and(eq(automationMessages.userId, c.id), eq(automationMessages.kind, "reativacao"), eq(automationMessages.step, 1)))
      );
      result.failed += 1;
      result.details.push({ userId: c.id, kind: "reativacao", step: 1, ok: false, error: message });
    }
  }
  return result;
}
