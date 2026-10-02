import { buildManualPdf } from "@/lib/pdf/manualPdf";
import { publicAppUrl } from "@/lib/appUrl";

// PDF do manual do usuário — público (não tem dado de cliente): é o mesmo
// arquivo enviado nas boas-vindas pelo WhatsApp e linkado na página /manual.
export const dynamic = "force-dynamic";

export async function GET() {
  const pdf = await buildManualPdf({ appUrl: publicAppUrl() });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Manual-Contay.pdf"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
