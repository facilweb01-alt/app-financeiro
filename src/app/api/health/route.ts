import { NextResponse } from "next/server";

// Resposta leve (sem banco) para o "despertador" em
// .github/workflows/keepalive.yml: no plano gratuito do Render o app dorme
// depois de 15 min sem acesso e a 1ª requisição recebe uma página de
// "carregando" (503) — foi isso que fez o WhatsApp responder "Tive um
// problema para registrar" no teste de 26/09/2026.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
