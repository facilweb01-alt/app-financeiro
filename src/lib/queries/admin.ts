import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { users, monthClosings } from "@/db/schema";

// Consultas do painel administrativo. Sempre chamadas de dentro de
// withServiceMode() (ver src/db/client.ts) depois de src/lib/dal.ts#
// verifyAdminSession() já ter confirmado que quem está pedindo é admin —
// esta função em si não faz nenhuma checagem de permissão.

export type UsageHealth = "ativo" | "baixo_uso" | "inativo" | "nunca_acessou";

export type AdminClientRow = {
    id: string;
    name: string | null;
    email: string;
    role: string;
    status: string;
    subscriptionDueDate: string | null;
    daysUntilDue: number | null; // negativo = vencido
    lastLoginAt: Date | null;
    createdAt: Date;
    approvedAt: Date | null;
    lastClosedYearMonth: string | null; // último mês que o cliente fechou (engajamento)
    usageHealth: UsageHealth;
    // Aceite dos Termos de Uso / Política de Privacidade (LGPD) — ver
    // src/lib/terms.ts. null = ainda não aceitou (ou aceitou uma versão
    // antiga do termo — comparar com CURRENT_TERMS_VERSION na UI).
    termsAcceptedAt: Date | null;
    termsVersion: string | null;
};

/** Diferença em dias entre hoje e uma data "YYYY-MM-DD" (positivo = no futuro). */
function daysUntil(dateStr: string): number {
    const [y, m, d] = dateStr.split("-").map(Number);
    const target = Date.UTC(y, m - 1, d);
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((target - today) / 86_400_000);
}

function computeUsageHealth(lastLoginAt: Date | null): UsageHealth {
    if (!lastLoginAt) return "nunca_acessou";
    const daysSince = Math.floor((Date.now() - lastLoginAt.getTime()) / 86_400_000);
    if (daysSince <= 7) return "ativo";
    if (daysSince <= 30) return "baixo_uso";
    return "inativo";
}

export async function listClientsForAdmin(): Promise<AdminClientRow[]> {
    const [userRows, closingRows] = await Promise.all([
          db
            .select({
                      id: users.id,
                      name: users.name,
                      email: users.email,
                      role: users.role,
                      status: users.status,
                      subscriptionDueDate: users.subscriptionDueDate,
                      lastLoginAt: users.lastLoginAt,
                      createdAt: users.createdAt,
                      approvedAt: users.approvedAt,
                      termsAcceptedAt: users.termsAcceptedAt,
                      termsVersion: users.termsVersion,
            })
            .from(users)
            .orderBy(desc(users.createdAt)),
          db.select({ userId: monthClosings.userId, yearMonth: monthClosings.yearMonth }).from(monthClosings),
        ]);

  // Último mês fechado por usuário (yearMonth "YYYY-MM" ordena certo como string).
  const lastClosedByUser = new Map<string, string>();
    for (const row of closingRows) {
          const current = lastClosedByUser.get(row.userId);
          if (!current || row.yearMonth > current) {
                  lastClosedByUser.set(row.userId, row.yearMonth);
          }
    }

  return userRows.map((u) => ({
        ...u,
        daysUntilDue: u.subscriptionDueDate ? daysUntil(u.subscriptionDueDate) : null,
        lastClosedYearMonth: lastClosedByUser.get(u.id) ?? null,
        usageHealth: computeUsageHealth(u.lastLoginAt),
  }));
}
