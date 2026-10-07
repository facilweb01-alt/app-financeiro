import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { verifySession } from "@/lib/dal";
import { db, withRLS } from "@/db/client";
import { users } from "@/db/schema";
import { loadClosingInputsForUser, listMonthClosingsForUser } from "@/lib/queries/monthClosing";
import { resolveMonthSnapshot } from "@/lib/business/monthClosing";
import { currentYearMonth } from "@/lib/business/dates";
import { buildMonthClosingPdf } from "@/lib/pdf/monthClosingPdf";

// Exporta em PDF o fechamento de um mês — ou um mês já fechado (usa o
// snapshot salvo no histórico, igual ao que aparece na tela) ou, se nenhum
// yearMonth for passado (ou o mês pedido ainda não foi fechado), a prévia
// ao vivo do mês atual, calculada igual à tela de Fechamento.
export async function GET(request: NextRequest) {
  const session = await verifySession();

  const requestedYearMonth = request.nextUrl.searchParams.get("yearMonth")?.trim() || null;

  const [user, inputs, closings] = await withRLS(session.userId, () =>
    Promise.all([
      db
        .select({ name: users.name, monthlyIncome: users.monthlyIncome })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1),
      loadClosingInputsForUser(session.userId),
      listMonthClosingsForUser(session.userId),
    ])
  );

  const liveIncome = Number(user[0]?.monthlyIncome ?? 0);
  const userName = user[0]?.name ?? "Usuário";

  // Mês já fechado: o relatório daquele mês. Sem yearMonth (ou mês ainda
  // não fechado): a prévia do mês atual. Nos dois casos a conta é a mesma
  // da tela de Fechamento e do painel (resolveMonthSnapshot).
  const closedMatch = requestedYearMonth ? closings.find((c) => c.yearMonth === requestedYearMonth) : undefined;
  const yearMonth = closedMatch ? closedMatch.yearMonth : currentYearMonth();
  const snapshot = resolveMonthSnapshot({
    yearMonth,
    liveIncome,
    transactions: inputs.transactions,
    cardInstallments: inputs.cardInstallments,
    liveFixedAccountsTotal: inputs.fixedAccountsTotal,
    investmentsTotal: inputs.investmentsByYearMonth(yearMonth),
    closing: closings.find((c) => c.yearMonth === yearMonth) ?? null,
  });
  const income = snapshot.income;

  const pdfBuffer = await buildMonthClosingPdf({
    userName,
    yearMonth,
    income,
    snapshot,
    generatedAt: new Date(),
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fechamento-${yearMonth}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
