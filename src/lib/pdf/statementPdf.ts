import "server-only";
import PDFDocument from "pdfkit";
import { formatBRL, formatDateBR } from "@/lib/format";

const BLUE = "#2563eb";
const SLATE_900 = "#0f172a";
const SLATE_500 = "#64748b";
const SLATE_200 = "#e2e8f0";

type StatementItemRow = {
  description: string;
  categoryLabel: string | null;
  purchaseDate: string;
  installmentNumber: number;
  installmentsTotal: number;
  dueDate: string;
  amount: string | number;
};

type BuildInput = {
  userName: string;
  cardName: string;
  periodStart: string;
  periodEnd: string;
  closingDate: string;
  totalAmount: string | number;
  items: StatementItemRow[];
  generatedAt: Date;
};

/**
 * Relatório em PDF de UMA fatura fechada do cartão: período, total e cada
 * parcela que entrou nela. Gerado em memória, como os outros PDFs do app.
 */
export function buildStatementPdf(input: BuildInput): Promise<Buffer> {
  const { userName, cardName, periodStart, periodEnd, closingDate, totalAmount, items, generatedAt } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor(BLUE).fontSize(20).font("Helvetica-Bold").text("Contay");
    doc.fillColor(SLATE_500).fontSize(10).font("Helvetica").text(`Fatura fechada do cartão — ${userName}`);
    doc.moveDown(0.3);
    doc.fillColor(SLATE_900).fontSize(16).font("Helvetica-Bold").text(cardName);
    doc
      .fillColor(SLATE_500)
      .fontSize(8)
      .font("Helvetica")
      .text(`Gerado em ${generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
    doc.moveDown(1);
    drawDivider(doc);

    doc.moveDown(0.8);
    doc.fillColor(SLATE_900).fontSize(12).font("Helvetica-Bold").text("Resumo da fatura");
    doc.moveDown(0.4);
    const rows: [string, string][] = [
      ["Período (vencimentos)", `${formatDateBR(periodStart)} a ${formatDateBR(periodEnd)}`],
      ["Fechada em", formatDateBR(closingDate)],
      ["Quantidade de parcelas", String(items.length)],
      ["TOTAL DA FATURA", formatBRL(Number(totalAmount))],
    ];
    for (const [label, value] of rows) {
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(SLATE_500)
        .text(label, { continued: true })
        .fillColor(SLATE_900)
        .font("Helvetica-Bold")
        .text(`  ${value}`, { align: "left" });
    }

    doc.moveDown(1);
    doc.fillColor(SLATE_900).fontSize(12).font("Helvetica-Bold").text("Parcelas da fatura");
    doc.moveDown(0.4);
    if (items.length === 0) {
      doc.fontSize(10).font("Helvetica").fillColor(SLATE_500).text("Nenhuma parcela nesta fatura.");
    } else {
      for (const item of items) {
        const category = item.categoryLabel ? ` · ${item.categoryLabel}` : "";
        doc
          .fontSize(10)
          .font("Helvetica-Bold")
          .fillColor(SLATE_900)
          .text(`${item.description} (${item.installmentNumber}/${item.installmentsTotal})`, { continued: true })
          .font("Helvetica")
          .fillColor(SLATE_500)
          .text(`  ${formatBRL(Number(item.amount))}`, { align: "left" });
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor(SLATE_500)
          .text(`   Vencimento ${formatDateBR(item.dueDate)} · compra em ${formatDateBR(item.purchaseDate)}${category}`);
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
      .text("Documento gerado automaticamente pelo Contay.");

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
