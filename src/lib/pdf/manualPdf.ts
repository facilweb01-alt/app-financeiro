import "server-only";
import path from "node:path";
import { readFileSync } from "node:fs";
import PDFDocument from "pdfkit";
import { MANUAL_SECTIONS, MANUAL_SUBTITLE, MANUAL_TITLE, MANUAL_UPDATED } from "@/lib/manual";
import { WHATSAPP_BOT_DISPLAY } from "@/lib/whatsappBot";

const NAVY = "#0a1f44";
const BLUE = "#1d6fe0";
const TEXT = "#1e293b";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const TIP_BG = "#eff6ff";

// A fonte padrão do PDF (Helvetica) não desenha emoji nem alguns símbolos:
// o conteúdo do manual é o mesmo da página, só trocando as aspas curvas.
function pdfText(value: string): string {
  return value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/•/g, "*");
}

function logoBuffer(): Buffer | null {
  try {
    return readFileSync(path.join(process.cwd(), "public", "logo-contay.png"));
  } catch {
    return null; // sem a imagem o manual sai só com o nome
  }
}

/**
 * Gera o PDF do manual em memória (mesmo padrão dos outros PDFs do app).
 * `appUrl` aparece na capa e no rodapé para o cliente achar o app.
 */
export function buildManualPdf(input: { appUrl: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: MANUAL_TITLE, Author: "Contay" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Capa (faixa azul-marinho no topo da primeira página)
    doc.rect(0, 0, doc.page.width, 150).fill(NAVY);
    const logo = logoBuffer();
    if (logo) doc.image(logo, left, 42, { width: 64, height: 64 });
    const titleX = logo ? left + 82 : left;
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(26).text("Contay", titleX, 48);
    doc.fillColor("#b9c6e8").font("Helvetica").fontSize(12).text("Seu dinheiro do seu jeito", titleX, 80);
    doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(22).text(pdfText(MANUAL_TITLE), left, 178);
    doc.fillColor(MUTED).font("Helvetica").fontSize(11).text(pdfText(MANUAL_SUBTITLE));
    doc.moveDown(0.6);
    doc
      .fillColor(TEXT)
      .fontSize(10.5)
      .text(`WhatsApp do Contay (lançamentos e suporte): ${WHATSAPP_BOT_DISPLAY}`)
      .text(`App: ${input.appUrl}`);
    doc.moveDown(1);

    for (const section of MANUAL_SECTIONS) {
      // Não deixa um título sozinho no fim da página.
      if (doc.y > doc.page.height - doc.page.margins.bottom - 110) doc.addPage();

      const y = doc.y;
      doc.strokeColor(LINE).lineWidth(1).moveTo(left, y).lineTo(left + width, y).stroke();
      doc.moveDown(0.7);
      doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(14).text(pdfText(section.title), left);
      doc.moveDown(0.25);
      doc.fillColor(TEXT).font("Helvetica").fontSize(10.5).text(pdfText(section.intro), { width, lineGap: 2 });
      doc.moveDown(0.4);

      for (const item of section.items) {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 40) doc.addPage();
        const itemY = doc.y;
        doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(10.5).text("-", left + 4, itemY);
        doc.fillColor(TEXT).font("Helvetica").fontSize(10.5).text(pdfText(item), left + 16, itemY, { width: width - 16, lineGap: 2 });
        doc.moveDown(0.3);
      }

      if (section.tip) {
        const tip = pdfText(`Dica: ${section.tip}`);
        doc.font("Helvetica").fontSize(10);
        const h = doc.heightOfString(tip, { width: width - 24, lineGap: 2 }) + 16;
        if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
        const boxY = doc.y + 2;
        doc.roundedRect(left, boxY, width, h, 6).fill(TIP_BG);
        doc.fillColor(TEXT).text(tip, left + 12, boxY + 8, { width: width - 24, lineGap: 2 });
        doc.y = boxY + h;
        doc.moveDown(0.3);
      }
      doc.x = left;
      doc.moveDown(0.6);
    }

    doc.moveDown(0.5);
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8.5)
      .text(`Manual atualizado em ${MANUAL_UPDATED}. A versão mais recente fica em ${input.appUrl}/manual`, left, doc.y, { width });

    doc.end();
  });
}
