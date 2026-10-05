import { NextResponse } from "next/server";

// Resposta leve (sem banco) para conferir se o app está no ar (usada nos
// testes e nas verificações depois de publicar). Nasceu como alvo de um
// "despertador" do plano gratuito do Render, que foi removido em 05/10/2026
// quando o app passou para um plano sempre ligado.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
