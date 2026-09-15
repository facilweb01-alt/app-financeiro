import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";

// Versão "leve" da leitura de sessão, usada só pelo proxy.ts (checagem
// otimista): decodifica o JWT do cookie sem tocar no banco. Fica em arquivo
// separado de src/lib/session.ts de propósito, para o proxy nunca puxar o
// driver do Postgres (não precisamos de uma conexão de banco por request só
// para decidir se redireciona para /login).

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET não configurada (ou curta demais).");
  }
  return new TextEncoder().encode(secret);
}

export async function readOptimisticSessionForProxy(
  req: NextRequest
): Promise<{ sessionId: string } | null> {
  const cookieValue = req.cookies.get("session")?.value;
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, getSecretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sessionId !== "string") return null;
    return { sessionId: payload.sessionId };
  } catch {
    return null;
  }
}
