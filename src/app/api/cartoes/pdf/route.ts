import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { verifySession } from "@/lib/dal";
import { db, withRLS } from "@/db/client";
import { users } from "@/db/schema";
import { getCardWithDetailsForUser } from "@/lib/queries/cards";
import { buildCardStatementPdf } from "@/lib/pdf/cardPdf";

// Exporta em PDF o relatório de um cartão específico: valor total das
// compras cadastradas + lista detalhada das parcelas lançadas. O cartão é
// sempre buscado escopado ao usuário logado (getCardWithDetailsForUser já
// filtra por userId), então não tem como um usuário baixar o relatório de
// um cartão de outra pessoa nem trocando o cardId na URL.
export async function GET(request: NextRequest) {
  const session = await verifySession();

  const cardId = request.nextUrl.searchParams.get("cardId")?.trim();
  if (!cardId) {
    return NextResponse.json({ error: "Informe o cartão (cardId)." }, { status: 400 });
  }

  const [user, card] = await withRLS(session.userId, () =>
    Promise.all([
      db.select({ name: users.name }).from(users).where(eq(users.id, session.userId)).limit(1),
      getCardWithDetailsForUser(session.userId, cardId),
    ])
  );

  if (!card) {
    return NextResponse.json({ error: "Cartão não encontrado." }, { status: 404 });
  }

  const userName = user[0]?.name ?? "Usuário";

  const pdfBuffer = await buildCardStatementPdf({
    userName,
    cardName: card.name,
    purchases: card.purchases.map((p) => ({
      description: p.description,
      purchaseDate: p.purchaseDate,
      totalAmount: p.totalAmount,
      categoryLabel: p.category?.label ?? null,
      installments: p.installments.map((i) => ({
        installmentNumber: i.installmentNumber,
        installmentsTotal: p.installmentsTotal,
        dueDate: i.dueDate,
        amount: i.amount,
        paid: i.paid,
      })),
    })),
    generatedAt: new Date(),
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cartao-${card.name.replace(/[^a-zA-Z0-9-]+/g, "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
