import { NextRequest, NextResponse } from "next/server";
import { readOptimisticSessionForProxy } from "@/lib/session-edge";

// Checagem OTIMISTA de rota (só lê o cookie assinado, sem consultar o banco —
// ver node_modules/next/dist/docs/.../authentication.md "Optimistic checks
// with Proxy"). A checagem de verdade acontece no DAL (src/lib/dal.ts) antes
// de qualquer leitura/escrita real de dado do usuário.
//
// Nota: a partir do Next.js 16 este arquivo se chama "proxy.ts" (era
// "middleware.ts" em versões anteriores).

const PROTECTED_PREFIXES = [
    "/dashboard",
    "/lancamentos",
    "/cartoes",
    "/investimentos",
    "/contas-fixas",
    "/fechamento",
    "/admin",
    "/conta-pendente",
    "/aceitar-termos",
  ];
const PUBLIC_ROUTES = ["/login", "/registrar"];

export async function proxy(req: NextRequest) {
    const path = req.nextUrl.pathname;
    const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
    const isPublic = PUBLIC_ROUTES.some((p) => path === p || path.startsWith(p + "/"));

  const session = await readOptimisticSessionForProxy(req);

  if (isProtected && !session) {
        const loginUrl = new URL("/login", req.nextUrl);
        loginUrl.searchParams.set("next", path);
        return NextResponse.redirect(loginUrl);
  }

  if (isPublic && session) {
        return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)"],
};
