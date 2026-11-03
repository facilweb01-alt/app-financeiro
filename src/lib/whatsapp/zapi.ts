import "server-only";

// Envio de mensagens pelo número do bot (boas-vindas com o manual e as
// automações). As respostas aos lançamentos continuam saindo pelo n8n.
//
// Dois provedores, escolhidos pelas variáveis de ambiente (Render →
// app-financeiro → Environment):
//
// 1) Evolution API (padrão desde 03/11/2026 — gratuita, instalada no VPS):
//      EVOLUTION_API_URL   — ex.: http://2.25.102.73:8080
//      EVOLUTION_INSTANCE  — nome da instância (ex.: contay)
//      EVOLUTION_API_KEY   — token da instância (Evolution Manager → instância)
// 2) Z-API (legado; usado só se as três EVOLUTION_* não estiverem definidas):
//      ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN
//      ZAPI_BASE_URL — opcional, só para os testes apontarem para um Z-API falso.
// Sem nenhum dos dois, nada é enviado e o erro fica registrado no cliente
// (o painel admin mostra e permite reenviar).

export class ZapiError extends Error {}

type Provider =
  | { kind: "evolution"; base: string; instance: string; apiKey: string }
  | { kind: "zapi"; url: string; clientToken: string };

export function whatsappProvider(env: Record<string, string | undefined> = process.env): Provider {
  const evoUrl = env.EVOLUTION_API_URL?.trim();
  const evoInstance = env.EVOLUTION_INSTANCE?.trim();
  const evoKey = env.EVOLUTION_API_KEY?.trim();
  if (evoUrl && evoInstance && evoKey) {
    return { kind: "evolution", base: evoUrl.replace(/\/$/, ""), instance: evoInstance, apiKey: evoKey };
  }
  const instanceId = env.ZAPI_INSTANCE_ID;
  const token = env.ZAPI_INSTANCE_TOKEN;
  const clientToken = env.ZAPI_CLIENT_TOKEN;
  if (!instanceId || !token || !clientToken) {
    throw new ZapiError("WhatsApp não configurado no app (faltam as variáveis EVOLUTION_* ou ZAPI_*).");
  }
  const base = (env.ZAPI_BASE_URL || "https://api.z-api.io").replace(/\/$/, "");
  return { kind: "zapi", url: `${base}/instances/${instanceId}/token/${token}`, clientToken };
}

async function postJson(url: string, headers: Record<string, string>, body: Record<string, unknown>, label: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new ZapiError(`${label} não respondeu (${err instanceof Error ? err.name : "erro de rede"}).`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Nunca devolve a URL nem os cabeçalhos (têm o token).
    throw new ZapiError(`${label} recusou o envio (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

export function sendWhatsappText(phone: string, message: string): Promise<void> {
  const p = whatsappProvider();
  if (p.kind === "evolution") {
    return postJson(`${p.base}/message/sendText/${encodeURIComponent(p.instance)}`, { apikey: p.apiKey }, { number: phone, text: message }, "Evolution API");
  }
  return postJson(`${p.url}/send-text`, { "Client-Token": p.clientToken }, { phone, message }, "Z-API");
}

export function sendWhatsappPdf(phone: string, pdf: Buffer, fileName: string, caption?: string): Promise<void> {
  const p = whatsappProvider();
  if (p.kind === "evolution") {
    return postJson(
      `${p.base}/message/sendMedia/${encodeURIComponent(p.instance)}`,
      { apikey: p.apiKey },
      {
        number: phone,
        mediatype: "document",
        mimetype: "application/pdf",
        media: pdf.toString("base64"),
        fileName: fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`,
        ...(caption ? { caption } : {}),
      },
      "Evolution API"
    );
  }
  return postJson(
    `${p.url}/send-document/pdf`,
    { "Client-Token": p.clientToken },
    { phone, document: `data:application/pdf;base64,${pdf.toString("base64")}`, fileName, ...(caption ? { caption } : {}) },
    "Z-API"
  );
}
