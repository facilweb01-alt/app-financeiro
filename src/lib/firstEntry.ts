import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, withServiceMode } from "@/db/client";
import { users } from "@/db/schema";
import { sendMetaServerEvent } from "@/lib/metaCapi";

// 1º registro da conta (estratégia de conversão, 04/11/2026): grava
// users.first_entry_at na primeira vez que a pessoa lança um gasto, uma
// compra no cartão ou uma conta fixa — pelo app ou pelo WhatsApp — e avisa a
// Meta (evento PrimeiroRegistro), só se a pessoa aceitou os cookies no
// cadastro. Chamado depois do registro gravado; nunca derruba o lançamento.

export async function noteFirstEntry(userId: string): Promise<void> {
  try {
    const [marked] = await withServiceMode(() =>
      db
        .update(users)
        .set({ firstEntryAt: new Date() })
        .where(and(eq(users.id, userId), isNull(users.firstEntryAt)))
        .returning({
          id: users.id,
          adsConsentAt: users.adsConsentAt,
          metaFbp: users.metaFbp,
          metaFbc: users.metaFbc,
          metaUa: users.metaUa,
        })
    );
    if (!marked) return; // já tinha registro antes
    await sendMetaServerEvent({ eventName: "PrimeiroRegistro", eventId: `primeiro-registro-${userId}`, user: marked });
  } catch (err) {
    console.error("[primeiro-registro]", userId, err instanceof Error ? err.message : err);
  }
}
