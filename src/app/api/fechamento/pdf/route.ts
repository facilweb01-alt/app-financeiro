import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { verifySession } from "@/lib/dal";
import { db, withRLS } from "@/db/client";
import { users } from "@/db/schema";
import { loadClosingInputsForUser, listMonthClosingsForUser } from "@/lib/queries/monthClosing";
import { computeMonthClosingSnapshot, type MonthClosingSnapshot } from "@/lib/business/monthClosing";
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

  const income = Number(user[0]?.monthlyIncome ?? 0);
  const userName = user[0]?.name ?? "Usuário";

  let yearMonth = requestedYearMonth ?? currentYearMonth();
  let snapshot: MonthClosingSnapshot;

  const closedMatch = closings.find((c) => c.yearMonth === yearMonth);
  if (closedMatch) {
    snapshot = JSON.parse(closedMatch.snapshot) as MonthClosingSnapshot;
  } else {
    // Mês ainda não fechado (ou nenhum yearMonth foi passado): gera a
    // prévia ao vivo do mês atual, mesma lógica da tela de Fechamento.
    yearMonth = currentYearMonth();
    snapshot = computeMonthClosingSnapshot({
      yearMonth,
      income,
      transactions: inputs.transactions,
      cardInstallments: inputs.cardInstallments,
      fixedAccountsTotal: inputs.fixedAccountsTotal,
      investmentsTotal: inputs.investmentsByYearMonth(yearMonth),
    });
  }

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
