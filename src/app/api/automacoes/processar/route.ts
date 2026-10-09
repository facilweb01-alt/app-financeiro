import { NextResponse } from "next/server";
import { processAutomations } from "@/lib/whatsapp/automations";

// "Cutucão" para enviar as mensagens automáticas que já estão na hora (sem
// uso há 7/14 dias; cadastro sem pagamento — ver
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
    return NextResponse.json({ ok: true, skipped: skipped ?? null, checked, sent, failed });
  } catch (err) {
    console.error("[automacoes] erro:", err);
    return NextResponse.json({ ok: false, error: "Erro ao processar." }, { status: 500 });
  }
}
