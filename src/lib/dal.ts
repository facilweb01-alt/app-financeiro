import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, withRLS } from "@/db/client";
import { users } from "@/db/schema";
import { verifySessionInDb } from "@/lib/session";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";
import { computeBillingState, todayInSaoPaulo } from "@/lib/billing/core";

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
          // Cadastro pela página de vendas ainda sem o 1º Pix pago -> tela de
          // pagamento; conta suspensa (ou do fluxo antigo, aguardando
          // aprovação manual) -> tela de espera.
          redirect(session.status === "pending" && session.billingEnabled ? "/assinatura" : "/conta-pendente");
    }
    // Mensalidade vencida há mais de GRACE_DAYS dias: só a tela de pagamento
    // abre, até o Pix ser pago (o webhook do Asaas libera na hora). Vale
    // também para qualquer Server Action, já que todas passam por aqui.
    if (
          computeBillingState({
                billingEnabled: session.billingEnabled,
                status: session.status,
                subscriptionDueDate: session.subscriptionDueDate,
                today: todayInSaoPaulo(),
          }).kind === "blocked"
    ) {
          redirect("/assinatura");
    }
    // Consentimento LGPD ausente ou de uma versão antiga do termo (ver
                                     // src/lib/terms.ts) — barra o resto do app até a pessoa aceitar de novo,
                                     // mesma lógica do gate de aprovação acima, só que para o aceite.
                                     if (session.termsAcceptedAt === null || session.termsVersion !== CURRENT_TERMS_VERSION) {
                                           redirect("/aceitar-termos");
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

// verifyAdminSession() foi removida daqui — o painel administrativo agora é
// um app separado (app-financeiro-admin, outro deploy, outra role de banco:
// app_admin_runtime, ver drizzle/migrations/0006_admin_isolation.sql), de
// propósito para reduzir o que um eventual problema neste app conseguiria
// alcançar. Este app não faz mais nenhuma checagem "é admin?" nem tem
// nenhum caminho de código que leia/grave dado de outro usuário.

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
                                                                                   billingEnabled: users.billingEnabled,
                                                                                   subscriptionDueDate: users.subscriptionDueDate,
                                                                         })
                                                                         .from(users)
                                                                         .where(eq(users.id, session.userId))
                                                                         .limit(1)
                                                                     );

                                      return user ?? null;
});
