import * as z from "zod";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { CUSTOM_CATEGORY_COLORS } from "@/lib/categories";
import { db, withRLS, withServiceMode } from "@/db/client";
import {
  users,
  categories,
  transactions,
  creditCards,
  cardPurchases,
  cardInstallments,
  monthClosings,
} from "@/db/schema";
import { addMonthsClamped, toYearMonth } from "@/lib/business/dates";
import { settleInstallmentsInClosedPeriods } from "@/lib/cardStatements";
import { sumAmounts } from "@/lib/business/cardStatements";
import { formatBRL, formatDateBR } from "@/lib/format";
import { formatYearMonthBR } from "@/lib/format";
import { generateInstallments } from "@/lib/business/installments";
import {
  displayCardName,
  isCardPurchase,
  matchCard,
  normalizeFlexibleDate,
  resolveWhatsappCategory,
} from "@/lib/business/whatsappInput";
import { todayInSaoPaulo, whatsappPhoneVariants } from "@/lib/billing/core";

// Bug real encontrado testando com mensagens de WhatsApp de verdade: o Z-API
// entrega o telefone como "55" (DDI) + DDD + 8 dígitos (sem o "9" do celular
// brasileiro), enquanto o número fica salvo no cadastro (aba Fechamento) só
// como DDD + 9 dígitos, sem DDI (ex.: cadastro "83982004873", Z-API manda
// "558382004873"). Em vez de exigir um formato fixo, geramos as variações
// plausíveis do número recebido (com/sem DDI, com/sem o "9") e comparamos
// com o que está vinculado usando qualquer uma delas.
function phoneCandidates(rawDigits: string): string[] {
  // Inclui também as formas com "55" na frente, para quem vinculou o número
  // com DDI (ex.: "5583982004873") — ver billing/core.ts#whatsappPhoneVariants.
  return whatsappPhoneVariants(rawDigits);
}

// ---------------------------------------------------------------------------
// Endpoint pensado para ser chamado por uma automação externa (ex: um fluxo
// n8n que já recebe e interpreta mensagens do WhatsApp — a mesma peça usada
// no Webfacilita) depois que ela já entendeu o comando do usuário. Este
// endpoint NÃO fala com o WhatsApp diretamente nem faz interpretação de
// linguagem natural — só recebe os campos já estruturados e grava o
// lançamento. Isso mantém a parte de "entender a mensagem" na automação que
// já sabe fazer isso, e a parte de "gravar no banco" aqui, isolada e testável
// sem depender de nenhuma conta do WhatsApp de verdade.
//
// Autenticação: header "Authorization: Bearer <WHATSAPP_WEBHOOK_SECRET>".
// Sem essa variável de ambiente configurada, o endpoint recusa toda chamada
// (fail-closed) — ver .env.local / variáveis de ambiente de produção.
//
// Como vincular um número: o usuário loga no app normalmente e cadastra o
// próprio número na aba Fechamento (ver src/app/actions/settings.ts). Este
// endpoint só sabe de quem é o lançamento porque o número bate com o que foi
// vinculado ali — nunca por um número enviado "confiando" no payload sozinho
// sem essa vinculação prévia.

// Campos opcionais aceitam null (a IA do n8n às vezes manda null em vez de
// omitir) e datas em "YYYY-MM-DD", "15/10" ou "15/10/2026" — a conversão e a
// validação de data real ficam em lib/business/whatsappInput.ts.
const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()));

const BodySchema = z.object({
  // Telefone ("5583...") ou identificador LID do WhatsApp ("1847...@lid")
  phone: z
    .string()
    .trim()
    .refine((v) => /^\d{10,15}$/.test(v.replace(/\D/g, "")), "Telefone inválido."),
  description: z.string().trim().min(1, "Informe a descrição."),
  amount: z.coerce.number().positive("Valor precisa ser maior que zero."),
  categoryKey: optionalText,
  // Nome de categoria dito pelo cliente (ou sugerido pela IA quando nenhuma
  // das padrão serve): casa com uma existente ou cria uma nova.
  categoryName: optionalText,
  purchaseDate: optionalText,
  dueDate: optionalText,
  // Compra no cartão (opcional): qualquer um destes indica cartão.
  paymentMethod: optionalText, // ex.: "cartao", "credito", "pix", "dinheiro"
  cardName: optionalText, // ex.: "Mercado Pago", "azul"
  installments: z
    .union([z.coerce.number().int().min(1, "Parcelas inválidas.").max(48, "Máximo de 48 parcelas."), z.null()])
    .optional()
    .transform((v) => v ?? undefined),
});

// "Hoje" no fuso de São Paulo (o servidor do Render roda em UTC — perto da
// meia-noite isso mudaria o dia da compra).
function todayIso(): string {
  return todayInSaoPaulo();
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Integração com WhatsApp ainda não configurada neste ambiente (WHATSAPP_WEBHOOK_SECRET ausente)." },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const providedSecret = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição precisa ser JSON." }, { status: 400 });
  }

  // "VINCULAR 123456" enviado no WhatsApp (o n8n manda linkCode): grava o
  // vínculo entre este remetente e a conta que gerou o código no app.
  if (json && typeof json === "object" && "linkCode" in json && (json as { linkCode?: unknown }).linkCode) {
    return linkSender(json as Record<string, unknown>);
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const data = parsed.data;

  // Ainda não sabemos de qual usuário é essa mensagem — é justamente o que
  // esta busca por telefone descobre — então roda em modo serviço; quem
  // autoriza essa chamada é o segredo compartilhado já conferido acima.
  const sender = parseSender(data.phone);
  const [user] = await withServiceMode(() =>
    db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(
        sender.isLid
          ? eq(users.whatsappLid, sender.digits)
          : inArray(users.whatsappPhone, phoneCandidates(sender.digits))
      )
      .limit(1)
  );

  if (!user) {
    return NextResponse.json(
      {
        error: "Nenhuma conta vinculada a este WhatsApp. No app, vá na aba Fechamento e toque em \"Vincular pelo WhatsApp\".",
        needsLink: true,
      },
      { status: 404 }
    );
  }

  // Mesma regra do resto do app (ver src/lib/dal.ts, verifySession): conta
  // pendente de aprovação ou suspensa não grava lançamento por nenhum canal.
  if (user.status !== "active") {
    return NextResponse.json({ error: "Acesso a esta conta não está ativo no momento." }, { status: 403 });
  }

  const categoryKey = data.categoryKey || "outros";
  const today = todayIso();
  const purchaseDate = data.purchaseDate ? normalizeFlexibleDate(data.purchaseDate, today) : today;
  if (!purchaseDate) {
    return NextResponse.json({ error: `Data da compra inválida: "${data.purchaseDate}".` }, { status: 400 });
  }
  const dueDate = data.dueDate ? normalizeFlexibleDate(data.dueDate, today) : null;
  if (data.dueDate && !dueDate) {
    return NextResponse.json({ error: `Data de vencimento inválida: "${data.dueDate}".` }, { status: 400 });
  }

  try {
    if (isCardPurchase(data)) {
      return await registerCardPurchase({ userId: user.id, data, categoryKey, purchaseDate, dueDate });
    }

    const result = await withRLS(user.id, async () => {
      // O lançamento vale para o mês que o cliente indicou. Se esse mês já
      // foi encerrado, ele entra direto no fechamento daquele mês (não vai
      // para o mês seguinte nem soma no atual) — a resposta avisa isso.
      const dueMonth = toYearMonth(dueDate ?? purchaseDate);
      const [closed] = await db
        .select({ id: monthClosings.id })
        .from(monthClosings)
        .where(and(eq(monthClosings.userId, user.id), eq(monthClosings.yearMonth, dueMonth)))
        .limit(1);
      const closedMonthNotice = closed
        ? `${formatYearMonthBR(dueMonth)} já está encerrado: o lançamento entrou direto no fechamento desse mês.`
        : null;

      const resolved = await resolveCategory(user.id, data, categoryKey);
      if (!resolved) {
        return { error: `Categoria "${categoryKey}" não encontrada.` };
      }
      const { category } = resolved;

      const [created] = await db
        .insert(transactions)
        .values({
          userId: user.id,
          purchaseDate,
          dueDate: dueDate ?? purchaseDate,
          description: data.description,
          categoryId: category.id,
          amount: data.amount.toString(),
        })
        .returning({ id: transactions.id });

      return { created, category, categoryCreated: resolved.created, closedMonthNotice };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const { created, category, categoryCreated, closedMonthNotice } = result;

    return NextResponse.json(
      {
        ok: true,
        kind: "lancamento",
        id: created.id,
        category: category.label,
        categoryCreated,
        amount: data.amount,
        description: data.description,
        dueDate: dueDate ?? purchaseDate,
        yearMonth: toYearMonth(dueDate ?? purchaseDate),
        closedMonth: Boolean(closedMonthNotice),
        notice: closedMonthNotice,
      },
      { status: 201 }
    );
  } catch (err) {
    // Nunca devolver 500 sem corpo: o n8n precisa de um JSON para montar a
    // resposta ao cliente, e o log do Render precisa do motivo real.
    console.error("[whatsapp-lancamento] erro ao gravar:", err);
    return NextResponse.json({ error: "Erro interno ao gravar o lançamento." }, { status: 500 });
  }
}

type ParsedBody = z.infer<typeof BodySchema>;

// O Z-API manda o remetente como telefone ("558399...") ou, quando o WhatsApp
// esconde o número, como LID ("184713742393347@lid").
function parseSender(raw: string): { isLid: boolean; digits: string } {
  return { isLid: /@lid\b/i.test(raw), digits: raw.replace(/\D/g, "") };
}

const LinkSchema = z.object({
  phone: z.string().trim().min(5, "Remetente inválido."),
  linkCode: z.coerce.string().trim().regex(/^\d{6}$/, "Código inválido."),
});

async function linkSender(json: Record<string, unknown>) {
  const parsed = LinkSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const sender = parseSender(parsed.data.phone);
  if (!/^\d{10,20}$/.test(sender.digits)) {
    return NextResponse.json({ error: "Remetente inválido." }, { status: 400 });
  }

  try {
    const result = await withServiceMode(async () => {
      const [owner] = await db
        .select({ id: users.id, name: users.name, expiresAt: users.whatsappLinkCodeExpiresAt })
        .from(users)
        .where(eq(users.whatsappLinkCode, parsed.data.linkCode))
        .limit(1);
      if (!owner || !owner.expiresAt || owner.expiresAt.getTime() < Date.now()) {
        return null;
      }
      // Um WhatsApp só pode estar em uma conta: tira de quem tinha antes.
      if (sender.isLid) {
        await db.update(users).set({ whatsappLid: null }).where(eq(users.whatsappLid, sender.digits));
        await db
          .update(users)
          .set({ whatsappLid: sender.digits, whatsappLinkCode: null, whatsappLinkCodeExpiresAt: null })
          .where(eq(users.id, owner.id));
      } else {
        await db
          .update(users)
          .set({ whatsappPhone: null })
          .where(inArray(users.whatsappPhone, phoneCandidates(sender.digits)));
        await db
          .update(users)
          .set({ whatsappPhone: sender.digits, whatsappLinkCode: null, whatsappLinkCodeExpiresAt: null })
          .where(eq(users.id, owner.id));
      }
      return owner;
    });

    if (!result) {
      return NextResponse.json(
        { error: "Código inválido ou expirado. Gere um novo na aba Fechamento do app." },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, kind: "vinculo", name: result.name }, { status: 200 });
  } catch (err) {
    console.error("[whatsapp-vincular] erro:", err);
    return NextResponse.json({ error: "Erro interno ao vincular." }, { status: 500 });
  }
}

// Decide a categoria (regra em lib/business/whatsappInput.ts) e, quando o
// cliente disse uma categoria que ainda não existe, cria como categoria
// própria dele — igual ao botão "nova categoria" da tela de lançamentos.
// Precisa rodar dentro de withRLS(userId).
async function resolveCategory(
  userId: string,
  data: ParsedBody,
  categoryKey: string
): Promise<{ category: { id: string; label: string }; created: boolean } | null> {
  const rows = await db
    .select({ id: categories.id, key: categories.key, label: categories.label, userId: categories.userId })
    .from(categories)
    .where(or(isNull(categories.userId), eq(categories.userId, userId)));

  const decision = resolveWhatsappCategory({
    categories: rows.map((c) => ({ id: c.id, key: c.key, label: c.label, isCustom: c.userId !== null })),
    categoryKey,
    categoryName: data.categoryName,
    description: data.description,
  });

  if (decision.kind === "existing") {
    return { category: { id: decision.category.id, label: decision.category.label }, created: false };
  }
  if (decision.kind === "none") return null;

  const color = CUSTOM_CATEGORY_COLORS[Math.floor(Math.random() * CUSTOM_CATEGORY_COLORS.length)];
  const [created] = await db
    .insert(categories)
    .values({ userId, key: decision.key, label: decision.label, color })
    .onConflictDoNothing()
    .returning({ id: categories.id, label: categories.label });
  if (created) return { category: created, created: true };

  // Corrida (duas mensagens ao mesmo tempo): a categoria acabou de ser criada.
  const [existing] = await db
    .select({ id: categories.id, label: categories.label })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.key, decision.key)))
    .limit(1);
  return existing ? { category: existing, created: false } : null;
}

// Compra no cartão pelo WhatsApp: mesma regra da tela Cartões
// (src/app/actions/cards.ts#createCardPurchase) — grava a compra e já gera
// todas as parcelas, uma por mês, a partir do 1º vencimento. Sem vencimento
// informado, a 1ª parcela vence um mês depois da compra.
async function registerCardPurchase(params: {
  userId: string;
  data: ParsedBody;
  categoryKey: string;
  purchaseDate: string;
  dueDate: string | null;
}) {
  const { userId, data, categoryKey, purchaseDate } = params;
  const installmentsTotal = data.installments ?? 1;
  const firstDueDate = params.dueDate ?? addMonthsClamped(purchaseDate, 1);
  const generated = generateInstallments({
    totalAmount: data.amount,
    installmentsTotal,
    firstDueDate,
  });

  const result = await withRLS(userId, async () => {
    const resolved = await resolveCategory(userId, data, categoryKey);
    if (!resolved) {
      return { status: 400, error: `Categoria "${categoryKey}" não encontrada.` } as const;
    }
    const { category } = resolved;

    const cards = await db
      .select({ id: creditCards.id, name: creditCards.name })
      .from(creditCards)
      .where(eq(creditCards.userId, userId));

    let card: { id: string; name: string } | null = null;
    let cardCreated = false;
    if (data.cardName) {
      card = matchCard(cards, data.cardName);
      if (!card) {
        // Cartão ainda não cadastrado: cria na hora com o nome falado, para o
        // cliente não perder o lançamento (ele pode renomear na aba Cartões).
        const name = displayCardName(data.cardName) || data.cardName;
        const [created] = await db
          .insert(creditCards)
          .values({ userId, name })
          .returning({ id: creditCards.id, name: creditCards.name });
        card = created;
        cardCreated = true;
      }
    } else if (cards.length === 1) {
      card = cards[0];
    } else if (cards.length === 0) {
      return {
        status: 400,
        error: 'Qual cartão? Diga o nome, por exemplo: "gastei 300 no cartão Nubank em 3x".',
      } as const;
    } else {
      return {
        status: 400,
        error: `Qual cartão? Você tem: ${cards.map((c) => c.name).join(", ")}.`,
      } as const;
    }

    const [purchase] = await db
      .insert(cardPurchases)
      .values({
        cardId: card.id,
        purchaseDate,
        description: data.description,
        categoryId: category.id,
        totalAmount: data.amount.toString(),
        installmentsTotal,
      })
      .returning({ id: cardPurchases.id });

    await db.insert(cardInstallments).values(
      generated.map((inst) => ({
        cardPurchaseId: purchase.id,
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDate,
        amount: inst.amount.toString(),
      }))
    );

    // Parcela que vence em período já fechado (fatura do cartão ou mês
    // encerrado) recebe baixa na hora nesse mesmo período.
    const settled = await settleInstallmentsInClosedPeriods({
      userId,
      cardId: card.id,
      purchaseId: purchase.id,
      closingDate: todayIso(),
    });

    return {
      status: 201,
      purchaseId: purchase.id,
      settled,
      card,
      cardCreated,
      category,
      categoryCreated: resolved.created,
    } as const;
  });

  if (result.status !== 201) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const settledNotice =
    result.settled.length > 0
      ? `${result.settled.length === installmentsTotal ? "A compra entrou" : `${result.settled.length} de ${installmentsTotal} parcelas (${formatBRL(sumAmounts(result.settled.map((s) => s.amount)))}) entraram`} direto em fatura já fechada (${formatDateBR(result.settled[0].periodStart)} a ${formatDateBR(result.settled[0].periodEnd)}).`
      : null;

  return NextResponse.json(
    {
      ok: true,
      kind: "cartao",
      settledInstallments: result.settled.length,
      notice: settledNotice,
      id: result.purchaseId,
      category: result.category.label,
      categoryCreated: result.categoryCreated,
      amount: data.amount,
      description: data.description,
      cardName: result.card.name,
      cardCreated: result.cardCreated,
      installments: installmentsTotal,
      installmentAmount: generated[0].amount,
      firstDueDate,
      lastDueDate: generated[generated.length - 1].dueDate,
    },
    { status: 201 }
  );
}
