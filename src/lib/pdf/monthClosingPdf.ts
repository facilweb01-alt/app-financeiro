import "server-only";
import PDFDocument from "pdfkit";
import type { MonthClosingSnapshot } from "@/lib/business/monthClosing";
import { formatBRL, formatDateBR, formatYearMonthBR } from "@/lib/format";

const BLUE = "#2563eb";
const SLATE_900 = "#0f172a";
const SLATE_500 = "#64748b";
const SLATE_200 = "#e2e8f0";

type BuildInput = {
  userName: string;
  yearMonth: string;
  income: number;
  snapshot: MonthClosingSnapshot;
  generatedAt: Date;
};

/**
 * Gera o PDF do fechamento mensal em memória (sem tocar em disco — importante
 * porque o ambiente de produção não tem um filesystem gravável persistente).
 * Retorna um Buffer pronto para ser devolvido como resposta HTTP.
 */
export function buildMonthClosingPdf(input: BuildInput): Promise<Buffer> {
  const { userName, yearMonth, income, snapshot, generatedAt } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Cabeçalho
    doc.fillColor(BLUE).fontSize(20).font("Helvetica-Bold").text("App Financeiro");
    doc.fillColor(SLATE_500).fontSize(10).font("Helvetica").text(`Fechamento mensal — ${userName}`);
    doc.moveDown(0.3);
    doc
      .fillColor(SLATE_900)
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(formatYearMonthBR(yearMonth));
    doc
      .fillColor(SLATE_500)
      .fontSize(8)
      .font("Helvetica")
      .text(`Gerado em ${generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
    doc.moveDown(1);
    drawDivider(doc);

    // Resumo
    doc.moveDown(0.8);
    doc.fillColor(SLATE_900).fontSize(12).font("Helvetica-Bold").text("Resumo do mês");
    doc.moveDown(0.4);

    const percentText =
      snapshot.totalPercentOfIncome === null ? "—" : `${snapshot.totalPercentOfIncome}%`;
    const summaryRows: [string, string][] = [
      ["Renda mensal informada", formatBRL(income)],
      ["Total gasto no mês", formatBRL(snapshot.totalSpent)],
      ["Contas fixas", formatBRL(snapshot.fixedAccountsTotal)],
      ["% da renda comprometida (gastos + contas fixas)", percentText],
      ["Investido no mês", formatBRL(snapshot.investmentsTotal)],
    ];
    for (const [label, value] of summaryRows) {
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(SLATE_500)
        .text(label, { continued: true })
        .fillColor(SLATE_900)
        .font("Helvetica-Bold")
        .text(`  ${value}`, { align: "left" });
    }

    // Por categoria
    doc.moveDown(1);
    doc.fillColor(SLATE_900).fontSize(12).font("Helvetica-Bold").text("Gastos por categoria");
    doc.moveDown(0.4);
    if (snapshot.categoryTotals.length === 0) {
      doc.fontSize(10).font("Helvetica").fillColor(SLATE_500).text("Sem lançamentos nesse mês.");
    } else {
      for (const c of snapshot.categoryTotals) {
        const pct = c.percentOfIncome !== null ? ` (${c.percentOfIncome}% da renda)` : "";
        doc
          .fontSize(10)
          .font("Helvetica")
          .fillColor(SLATE_900)
          .text(c.categoryLabel, { continued: true })
          .fillColor(SLATE_500)
          .text(`  ${formatBRL(c.amount)}${pct}`, { align: "left" });
      }
    }

    // Parcelas e valores a vencer
    doc.moveDown(1);
    doc.fillColor(SLATE_900).fontSize(12).font("Helvetica-Bold").text("Parcelas e valores a vencer nos próximos meses");
    doc.moveDown(0.4);
    if (snapshot.pendingByFutureMonth.length === 0) {
      doc.fontSize(10).font("Helvetica").fillColor(SLATE_500).text("Nenhuma parcela pendente para os próximos meses.");
    } else {
      for (const bucket of snapshot.pendingByFutureMonth) {
        doc
          .fontSize(10)
          .font("Helvetica-Bold")
          .fillColor(SLATE_900)
          .text(`${formatYearMonthBR(bucket.yearMonth)}  —  ${formatBRL(bucket.amount)}`);
        for (const item of bucket.items) {
          doc
            .fontSize(9)
            .font("Helvetica")
            .fillColor(SLATE_500)
            .text(
              `   ${item.cardName} · ${item.purchaseDescription} (${item.installmentNumber}/${item.installmentsTotal}) — ${formatBRL(item.amount)}`
            );
        }
        doc.moveDown(0.2);
      }
    }

    doc.moveDown(1.5);
    drawDivider(doc);
    doc.moveDown(0.4);
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(SLATE_500)
      .text(`Documento gerado automaticamente pelo App Financeiro em ${formatDateBR(toIsoDate(generatedAt))}.`);

    doc.end();
  });
}

function drawDivider(doc: PDFKit.PDFDocument) {
  const y = doc.y;
  doc
    .strokeColor(SLATE_200)
    .lineWidth(1)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke();
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
