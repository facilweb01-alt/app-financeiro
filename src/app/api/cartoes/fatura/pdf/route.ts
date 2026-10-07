import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { verifySession } from "@/lib/dal";
import { db, withRLS } from "@/db/client";
import { users } from "@/db/schema";
import { getStatementWithItemsForUser } from "@/lib/queries/cards";
import { buildStatementPdf } from "@/lib/pdf/statementPdf";

// Relatório em PDF de uma fatura fechada do cartão. A fatura é sempre
// buscada escopada ao usuário logado (RLS + conferência do dono do cartão):
// trocar o statementId na URL não dá acesso à fatura de outra pessoa.
export async function GET(request: NextRequest) {
  const session = await verifySession();

  const statementId = request.nextUrl.searchParams.get("statementId")?.trim();
  if (!statementId) {
    return NextResponse.json({ error: "Informe a fatura (statementId)." }, { status: 400 });
  }

  const [user, statement] = await withRLS(session.userId, () =>
    Promise.all([
      db.select({ name: users.name }).from(users).where(eq(users.id, session.userId)).limit(1),
      getStatementWithItemsForUser(session.userId, statementId),
    ])
  );

  if (!statement) {
    return NextResponse.json({ error: "Fatura não encontrada." }, { status: 404 });
  }

  const pdfBuffer = await buildStatementPdf({
    userName: user[0]?.name ?? "Usuário",
    cardName: statement.card.name,
    periodStart: statement.periodStart,
    periodEnd: statement.periodEnd,
    closingDate: statement.closingDate,
    totalAmount: statement.totalAmount,
    items: statement.installments.map((i) => ({
      description: i.purchase.description,
      categoryLabel: i.purchase.category?.label ?? null,
      purchaseDate: i.purchase.purchaseDate,
      installmentNumber: i.installmentNumber,
      installmentsTotal: i.purchase.installmentsTotal,
      dueDate: i.dueDate,
      amount: i.amount,
    })),
    generatedAt: new Date(),
  });

  const safeCard = statement.card.name.replace(/[^a-zA-Z0-9-]+/g, "-");
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fatura-${safeCard}-${statement.periodStart}-a-${statement.periodEnd}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
