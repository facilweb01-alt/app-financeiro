import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, withRLS } from "@/db/client";
import { users } from "@/db/schema";
import { verifySessionInDb } from "@/lib/session";

/**
 * Data Access Layer — centraliza a checagem "de verdade" (contra o banco) de
 * que existe um usuário logado. Toda Server Action e toda página que lê
 * dado do usuário deve passar por aqui primeiro (nunca confiar só no cookie
 * — isso é feito de propósito no proxy.ts, que é só uma checagem otimista).
 *
 * Também é aqui que uma conta 'pending' (aguardando aprovação do admin) ou
 * 'suspended' é barrada — não só nas páginas, mas em qualquer Server Action,
 * já que toda Server Action deste app chama verifySession() como primeira
 * linha. Sem isso, alguém com uma conta suspensa ainda conseguiria chamar
 * uma Server Action diretamente (fora da UI) mesmo sendo redirecionado nas
 * páginas.
 *
 * cache() garante que, dentro do mesmo request/render, várias chamadas a
 * verifySession() não repitam a consulta ao banco.
 */
export const verifySession = cache(async (): Promise<{ userId: string }> => {
  const session = await verifySessionInDb();
  if (!session) {
    redirect("/login");
  }
  if (session.status !== "active") {
    redirect("/conta-pendente");
  }
  return { userId: session.userId };
});

/**
 * Como verifySessionInDb(), mas cacheada por request — para usar em lugares
 * que precisam decidir algo com base no status SEM cair no redirect
 * automático de verifySession() (hoje só a própria página /conta-pendente,
 * que senão entraria num loop de redirect para si mesma).
 */
export const getRawSession = cache(async () => verifySessionInDb());

/** Como verifySession(), mas não redireciona — para usar em lugares como o layout raiz. */
export const getOptionalSession = cache(async (): Promise<{ userId: string } | null> => {
  const session = await verifySessionInDb();
  return session ? { userId: session.userId } : null;
});

/**
 * Confirma sessão + que a conta é admin (role lido fresco do banco a cada
 * chamada dentro de verifySessionInDb — nunca confiar num "role" que viesse
 * só do cookie/JWT). Quem não é admin é mandado pro dashboard normal, não
 * pro login — para não revelar se a rota existe.
 */
export const verifyAdminSession = cache(async (): Promise<{ userId: string }> => {
  const session = await verifySessionInDb();
  if (!session) {
    redirect("/login");
  }
  if (session.status !== "active" || session.role !== "admin") {
    redirect("/dashboard");
  }
  return { userId: session.userId };
});

export const getCurrentUser = cache(async () => {
  const session = await verifySession();

  const [user] = await withRLS(session.userId, () =>
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        monthlyIncome: users.monthlyIncome,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1)
  );

  return user ?? null;
});
