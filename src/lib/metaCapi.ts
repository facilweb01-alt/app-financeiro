import "server-only";
import { createHash } from "node:crypto";
import { metaPixelId } from "@/lib/metaPixelId";
import { publicAppUrl } from "@/lib/appUrl";

// Eventos de conversão enviados pelo SERVIDOR para a Meta (Conversions API),
// estratégia de conversão de 04/11/2026. Servem para a campanha aprender com
// quem de fato usa e paga, e não só com quem se cadastra:
//  - "PrimeiroRegistro": a conta fez o 1º gasto/compra/conta fixa (inclusive
//    pelo WhatsApp, onde o pixel do navegador não existe);
//  - "Purchase": o 1º pagamento foi confirmado (Pix pago no celular também conta).
//
// Regras, todas de propósito:
//  - Só para quem ACEITOU os cookies da Meta na página de vendas antes de se
//    cadastrar (users.ads_consent_at). Sem consentimento, nada é enviado.
//  - Não envia nome, e-mail, CPF, WhatsApp nem lançamentos: só os
//    identificadores dos cookies da própria Meta (_fbp/_fbc), o navegador do
//    cadastro e o id interno da conta embaralhado (sha256).
//  - Desligado sem META_PIXEL_ID e META_CAPI_TOKEN (token gerado no
//    Gerenciador de Eventos; quem coloca no Render é o Marcelo).
//  - Nunca derruba o fluxo: falhou, registra no log e segue.

export type MetaServerUser = {
  id: string;
  adsConsentAt: Date | null;
  metaFbp: string | null;
  metaFbc: string | null;
  metaUa: string | null;
};

function capiConfig(): { pixelId: string; token: string; base: string; testCode: string | null } | null {
  const pixelId = metaPixelId();
  const token = (process.env.META_CAPI_TOKEN ?? "").trim();
  if (!pixelId || !token) return null;
  const base = (process.env.META_CAPI_BASE_URL ?? "https://graph.facebook.com/v21.0").replace(/\/$/, "");
  const testCode = (process.env.META_CAPI_TEST_CODE ?? "").trim() || null;
  return { pixelId, token, base, testCode };
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Monta o corpo do evento (exportado para os testes). */
export function buildServerEvent(input: {
  eventName: string;
  eventId: string;
  user: MetaServerUser;
  customData?: Record<string, unknown>;
  eventSourceUrl: string;
  now?: Date;
}) {
  const userData: Record<string, unknown> = { external_id: [sha256(input.user.id)] };
  if (input.user.metaFbp) userData.fbp = input.user.metaFbp;
  if (input.user.metaFbc) userData.fbc = input.user.metaFbc;
  if (input.user.metaUa) userData.client_user_agent = input.user.metaUa;
  return {
    event_name: input.eventName,
    event_time: Math.floor((input.now ?? new Date()).getTime() / 1000),
    event_id: input.eventId,
    action_source: "website",
    event_source_url: input.eventSourceUrl,
    user_data: userData,
    ...(input.customData ? { custom_data: input.customData } : {}),
  };
}

export async function sendMetaServerEvent(input: {
  eventName: "PrimeiroRegistro" | "Purchase";
  eventId: string;
  user: MetaServerUser;
  customData?: Record<string, unknown>;
}): Promise<boolean> {
  if (!input.user.adsConsentAt) return false;
  const cfg = capiConfig();
  if (!cfg) return false;
  const event = buildServerEvent({ ...input, eventSourceUrl: `${publicAppUrl()}/` });
  try {
    const res = await fetch(`${cfg.base}/${cfg.pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event], access_token: cfg.token, ...(cfg.testCode ? { test_event_code: cfg.testCode } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[meta-capi]", input.eventName, "HTTP", res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[meta-capi]", input.eventName, err instanceof Error ? err.message : err);
    return false;
  }
}
