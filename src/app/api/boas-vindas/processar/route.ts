import { NextResponse } from "next/server";
import { processPendingWelcomes } from "@/lib/whatsapp/welcome";

// "Cutucão" para enviar as boas-vindas pendentes. Quem chama é o painel
// admin (app separado), logo depois de marcar um cliente em
// users.welcome_requested_at. Não recebe nenhum dado e só envia para quem
// já está marcado no banco, uma única vez — por isso não precisa de
// segredo: chamar de fora não faz nada além de adiantar um envio já pedido.
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await processPendingWelcomes();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[boas-vindas] erro:", err);
    return NextResponse.json({ ok: false, error: "Erro ao processar." }, { status: 500 });
  }
}
