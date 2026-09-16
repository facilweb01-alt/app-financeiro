import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, withRLS, withServiceMode } from "@/db/client";
import { sessions, users } from "@/db/schema";

// Sessão de banco de dados (ver node_modules/next/dist/docs .../authentication.md
// "Database Sessions"): o cookie guarda só um JWT curto com o id da sessão;
// os dados reais (usuário, validade) ficam na tabela `sessions`, então dá pra
// revogar a qualquer momento apagando a linha no banco.

const SESSION_COOKIE = "session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function getSecretKey() {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 16) {
          throw new Error(
                  "AUTH_SECRET não configurada (ou curta demais). Defina em .env.local (dev) / variáveis de ambiente de produção."
                );
    }
    return new TextEncoder().encode(secret);
}

type SessionJwtPayload = {
    sessionId: string;
};

async function encryptSessionId(sessionId: string): Promise<string> {
    return new SignJWT({ sessionId } satisfies SessionJwtPayload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DURATION_MS / 1000}s`)
      .sign(getSecretKey());
}

async function decryptSessionCookie(cookieValue: string | undefined): Promise<SessionJwtPayload | null> {
    if (!cookieValue) return null;
    try {
          const { payload } = await jwtVerify(cookieValue, getSecretKey(), { algorithms: ["HS256"] });
          if (typeof payload.sessionId !== "string") return null;
          return { sessionId: payload.sessionId };
    } catch {
          return null;
    }
}

/** Cria uma sessão no banco para o usuário e grava o cookie assinado. */
export async function createSession(userId: string): Promise<void> {
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  // Aproveita a mesma transação (já com app.current_user_id definido) para
  // registrar o último acesso — é o que alimenta a coluna "último acesso"
  // do painel administrativo (ver src/lib/queries/admin.ts).
  const created = await withRLS(userId, async () => {
        const [row] = await db.insert(sessions).values({ userId, expiresAt }).returning({ id: sessions.id });
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
        return row;
  });

  const jwt = await encryptSessionId(created.id);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, jwt, {
      httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          expires: expiresAt,
          sameSite: "lax",
          path: "/",
    });
}

/** Apaga a sessão atual (banco + cookie) — usado no logout. */
export async function deleteSession(): Promise<void> {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(SESSION_COOKIE)?.value;
    const decoded = await decryptSessionCookie(cookieValue);
    if (decoded) {
          // Ainda não sabemos de quem é a sessão sem consultar o banco (é
      // justamente o que estamos apagando) — o próprio id de sessão
      // imprevisível já funciona como credencial aqui.
      await withServiceMode(() => db.delete(sessions).where(eq(sessions.id, decoded.sessionId)));
    }
    cookieStore.delete(SESSION_COOKIE);
}

/**
 * Lê o cookie e devolve o payload decodificado, sem consultar o banco —
 * usado só para checagem otimista (ex: no proxy.ts), nunca para autorizar
 * uma mutação de dado sensível.
 */
export async function readOptimisticSession(): Promise<SessionJwtPayload | null> {
    const cookieStore = await cookies();
    return decryptSessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
}

export type VerifiedSession = {
    userId: string;
    role: string;
    status: string;
    termsAcceptedAt: Date | null;
    termsVersion: string | null;
};

/**
 * Verificação "de verdade": confirma no banco que a sessão existe e não
 * expirou, e devolve o userId junto com role/status já lidos do banco (nunca
 * do JWT do cookie) — é o que permite ao DAL (src/lib/dal.ts) decidir, em um
 * só lugar, se a conta está ativa (senão manda pra /conta-pendente) e se é
 * admin (verifyAdminSession). Como já faz join com "users" mesmo, aproveita
 * para trazer os dois campos numa consulta só.
 */
export async function verifySessionInDb(): Promise<VerifiedSession | null> {
    const decoded = await readOptimisticSession();
    if (!decoded) return null;

  // Ainda não sabemos o userId — é exatamente o que esta consulta descobre —
  // então roda em modo serviço; o id de sessão imprevisível (vindo de um
  // cookie assinado) é a credencial que autoriza essa busca.
  return withServiceMode(async () => {
        const [row] = await db
          .select({
                    userId: sessions.userId,
                    expiresAt: sessions.expiresAt,
                    role: users.role,
                    status: users.status,
                    termsAcceptedAt: users.termsAcceptedAt,
                    termsVersion: users.termsVersion,
          })
          .from(sessions)
          .innerJoin(users, eq(sessions.userId, users.id))
          .where(eq(sessions.id, decoded.sessionId))
          .limit(1);

                             if (!row) return null;
        if (row.expiresAt.getTime() < Date.now()) {
                // sessão expirada — limpa para não ficar lixo
          await db.delete(sessions).where(eq(sessions.id, decoded.sessionId));
                return null;
        }

                             return {
                                     userId: row.userId,
                                     role: row.role,
                                     status: row.status,
                                     termsAcceptedAt: row.termsAcceptedAt,
                                     termsVersion: row.termsVersion,
                             };
  });
}
