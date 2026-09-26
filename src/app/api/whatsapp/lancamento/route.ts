import * as z from "zod";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, withRLS, withServiceMode } from "@/db/client";
import { users, categories, transactions } from "@/db/schema";
import { currentYearMonth } from "@/lib/business/dates";

// Bug real encontrado testando com mensagens de WhatsApp de verdade: o Z-API
// entrega o telefone como "55" (DDI) + DDD + 8 dígitos (sem o "9" do celular
// brasileiro), enquanto o número fica salvo no cadastro (aba Fechamento) só
// como DDD + 9 dígitos, sem DDI (ex.: cadastro "83982004873", Z-API manda
// "558382004873"). Em vez de exigir um formato fixo, geramos as variações
// plausíveis do número recebido (com/sem DDI, com/sem o "9") e comparamos
// com o que está vinculado usando qualquer uma delas.
function phoneCandidates(rawDigits: string): string[] {
  const candidates = new Set<string>([rawDigits]);
  let d = rawDigits;
  if (d.length >= 12 && d.startsWith("55")) {
    d = d.slice(2);
    candidates.add(d);
  }
  if (d.length === 10) {
    // DDD (2) + 8 dígitos: falta o "9" do celular — adiciona a variante com ele.
    candidates.add(d.slice(0, 2) + "9" + d.slice(2));
  } else if (d.length === 11 && d[2] === "9") {
    // DDD (2) + 9 + 8 dígitos: adiciona a variante sem o "9", caso tenha sido
    // cadastrado nesse formato mais antigo.
    candidates.add(d.slice(0, 2) + d.slice(3));
  }
  return Array.from(candidates);
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

const BodySchema = z.object({
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{10,15}$/, "Telefone inválido.")),
  description: z.string().trim().min(1, "Informe a descrição."),
  amount: z.coerce.number().positive("Valor precisa ser maior que zero."),
  categoryKey: z.string().trim().optional(),
  purchaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
    // Diagnóstico temporário: nunca loga o segredo inteiro, só o suficiente
    // (tamanho e alguns caracteres de cada ponta) pra identificar se é um
    // espaço/quebra de linha a mais, truncamento, ou valor totalmente
    // diferente. Remover depois de entender a causa da falha real via n8n.
    console.error(
      "[whatsapp-auth] segredo não bateu:",
      JSON.stringify({
        headerPresente: authHeader.length > 0,
        comecaComBearer: authHeader.startsWith("Bearer "),
        tamanhoRecebido: providedSecret.length,
        tamanhoEsperado: expectedSecret.length,
        inicioRecebido: providedSecret.slice(0, 6),
        inicioEsperado: expectedSecret.slice(0, 6),
        fimRecebido: providedSecret.slice(-6),
        fimEsperado: expectedSecret.slice(-6),
      })
    );
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição precisa ser JSON." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const data = parsed.data;

  // Ainda não sabemos de qual usuário é essa mensagem — é justamente o que
  // esta busca por telefone descobre — então roda em modo serviço; quem
  // autoriza essa chamada é o segredo compartilhado já conferido acima.
  const [user] = await withServiceMode(() =>
    db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(inArray(users.whatsappPhone, phoneCandidates(data.phone)))
      .limit(1)
  );

  if (!user) {
    return NextResponse.json(
      { error: "Nenhuma conta vinculada a este número. Vincule o número na aba Fechamento do app primeiro." },
      { status: 404 }
    );
  }

  // Mesma regra do resto do app (ver src/lib/dal.ts, verifySession): conta
  // pendente de aprovação ou suspensa não grava lançamento por nenhum canal.
  if (user.status !== "active") {
    return NextResponse.json({ error: "Acesso a esta conta não está ativo no momento." }, { status: 403 });
  }

  const categoryKey = data.categoryKey?.trim() || "outros";
  const purchaseDate = data.purchaseDate ?? todayIso();
  const dueDate = data.dueDate ?? purchaseDate;

  const result = await withRLS(user.id, async () => {
    const [category] = await db
      .select({ id: categories.id, label: categories.label })
      .from(categories)
      .where(and(eq(categories.key, categoryKey), or(isNull(categories.userId), eq(categories.userId, user.id))))
      .limit(1);

    if (!category) {
      return { error: `Categoria "${categoryKey}" não encontrada.` as const };
    }

    const [created] = await db
      .insert(transactions)
      .values({
        userId: user.id,
        purchaseDate,
        dueDate,
        description: data.description,
        categoryId: category.id,
        amount: data.amount.toString(),
      })
      .returning({ id: transactions.id });

    return { created, category };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { created, category } = result;

  return NextResponse.json(
    {
      ok: true,
      id: created.id,
      category: category.label,
      amount: data.amount,
      description: data.description,
      yearMonth: currentYearMonth(),
    },
    { status: 201 }
  );
}
