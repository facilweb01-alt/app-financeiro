import { NextResponse } from "next/server";
import { processAutomations, processReactivations } from "@/lib/whatsapp/automations";

// "Cutucão" para enviar as mensagens automáticas que já estão na hora (sem
// uso há 5/10 dias; cadastro sem pagamento — ver
// src/lib/business/automations.ts). Quem chama é a rotina agendada do
// próprio servidor (src/instrumentation.ts). Não recebe nenhum dado, respeita
// o horário (8h–22h) e nunca repete uma mensagem já enviada — por isso não
// precisa de segredo: chamar de fora só adianta o que já estava na hora.
// A resposta traz só contagens (nenhum dado de cliente).
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { skipped, checked, sent, failed } = await processAutomations();
    if (sent || failed) console.log(`[automacoes] enviadas ${sent}, falharam ${failed}`);
    // Reativação de cadastros antigos (04/11/2026): só com REATIVACAO_WHATSAPP=1, até 20 por dia.
    const re = await processReactivations();
    if (re.sent || re.failed) console.log(`[reativacao] enviadas ${re.sent}, falharam ${re.failed}`);
    return NextResponse.json({
      ok: true,
      skipped: skipped ?? null,
      checked,
      sent,
      failed,
      reactivation: { skipped: re.skipped ?? null, sent: re.sent, failed: re.failed },
    });
  } catch (err) {
    console.error("[automacoes] erro:", err);
    return NextResponse.json({ ok: false, error: "Erro ao processar." }, { status: 500 });
  }
}
