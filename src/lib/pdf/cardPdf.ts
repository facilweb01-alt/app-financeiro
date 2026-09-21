import "server-only";
import PDFDocument from "pdfkit";
import { formatBRL, formatDateBR } from "@/lib/format";

const BLUE = "#2563eb";
const SLATE_900 = "#0f172a";
const SLATE_500 = "#64748b";
const SLATE_200 = "#e2e8f0";

type InstallmentRow = {
  installmentNumber: number;
  installmentsTotal: number;
  dueDate: string;
  amount: string | number;
  paid: boolean;
};

type PurchaseRow = {
  description: string;
  purchaseDate: string;
  totalAmount: string | number;
  categoryLabel: string | null;
  installments: InstallmentRow[];
};

type BuildInput = {
  userName: string;
  cardName: string;
  purchases: PurchaseRow[];
  generatedAt: Date;
};

/**
 * Gera o relatório em PDF de um cartão específico: valor total de todas as
 * compras cadastradas nesse cartão + a lista detalhada de cada parcela
 * lançada — pedido do Marcelo: "monstar o valor total de cada cartão
 * cadastrado e um relatórios das parcelas lançadas". Assim como o PDF de
 * fechamento mensal, é gerado inteiramente em memória (sem tocar em disco).
 */
export function buildCardStatementPdf(input: BuildInput): Promise<Buffer> {
  const { userName, cardName, purchases, generatedAt } = input;

  const totalValue = purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Cabeçalho
    doc.fillColor(BLUE).fontSize(20).font("Helvetica-Bold").text("App Financeiro");
    doc.fillColor(SLATE_500).fontSize(10).font("Helvetica").text(`Relatório de cartão — ${userName}`);
    doc.moveDown(0.3);
    doc.fillColor(SLATE_900).fontSize(16).font("Helvetica-Bold").text(cardName);
    doc
      .fillColor(SLATE_500)
      .fontSize(8)
      .font("Helvetica")
      .text(`Gerado em ${generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
    doc.moveDown(1);
    drawDivider(doc);

    // Resumo
    doc.moveDown(0.8);
    doc.fillColor(SLATE_900).fontSize(12).font("Helvetica-Bold").text("Resumo");
    doc.moveDown(0.4);
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor(SLATE_500)
      .text("Valor total das compras cadastradas", { continued: true })
      .fillColor(SLATE_900)
      .font("Helvetica-Bold")
      .text(`  ${formatBRL(totalValue)}`, { align: "left" });
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor(SLATE_500)
      .text("Quantidade de compras", { continued: true })
      .fillColor(SLATE_900)
      .font("Helvetica-Bold")
      .text(`  ${purchases.length}`, { align: "left" });

    // Compras e parcelas
    doc.moveDown(1);
    doc.fillColor(SLATE_900).fontSize(12).font("Helvetica-Bold").text("Compras e parcelas lançadas");
    doc.moveDown(0.4);

    if (purchases.length === 0) {
      doc.fontSize(10).font("Helvetica").fillColor(SLATE_500).text("Nenhuma compra cadastrada nesse cartão.");
    } else {
      for (const purchase of purchases) {
        const categoryText = purchase.categoryLabel ? ` · ${purchase.categoryLabel}` : "";
        doc
          .fontSize(10)
          .font("Helvetica-Bold")
          .fillColor(SLATE_900)
          .text(`${purchase.description}${categoryText}`, { continued: true })
          .font("Helvetica")
          .fillColor(SLATE_500)
          .text(`  ${formatDateBR(purchase.purchaseDate)} — ${formatBRL(Number(purchase.totalAmount))}`, {
            align: "left",
          });

        for (const inst of purchase.installments) {
          const status = inst.paid ? "paga" : "pendente";
          doc
            .fontSize(9)
            .font("Helvetica")
            .fillColor(SLATE_500)
            .text(
              `   Parcela ${inst.installmentNumber}/${inst.installmentsTotal} — vencimento ${formatDateBR(
                inst.dueDate
              )} — ${formatBRL(Number(inst.amount))} (${status})`
            );
        }
        doc.moveDown(0.3);
      }
    }

    doc.moveDown(1);
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
