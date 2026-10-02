import "server-only";

// Envio de mensagens pelo Z-API (o mesmo número do bot que recebe os
// lançamentos). Usado só para a mensagem de boas-vindas com o manual — as
// respostas aos lançamentos continuam saindo pelo n8n.
//
// Variáveis de ambiente (Render → app-financeiro → Environment):
//   ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN — "ID da instância" e "Token da
//     instância" no painel do Z-API;
//   ZAPI_CLIENT_TOKEN — token de segurança da conta (Z-API → Segurança);
//   ZAPI_BASE_URL — opcional, só para os testes apontarem para um Z-API falso.
// Sem as três primeiras, nada é enviado e o erro fica registrado no cliente
// (o painel admin mostra e permite reenviar).

export class ZapiError extends Error {}

function config() {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_INSTANCE_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instanceId || !token || !clientToken) {
    throw new ZapiError("Z-API não configurado no app (faltam as variáveis ZAPI_*).");
  }
  const base = (process.env.ZAPI_BASE_URL || "https://api.z-api.io").replace(/\/$/, "");
  return { url: `${base}/instances/${instanceId}/token/${token}`, clientToken };
}

async function post(path: string, body: Record<string, unknown>): Promise<void> {
  const { url, clientToken } = config();
  let res: Response;
  try {
    res = await fetch(`${url}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new ZapiError(`Z-API não respondeu (${err instanceof Error ? err.name : "erro de rede"}).`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Nunca devolve a URL (ela contém o token da instância).
    throw new ZapiError(`Z-API recusou o envio (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

export function sendWhatsappText(phone: string, message: string): Promise<void> {
  return post("send-text", { phone, message });
}

export function sendWhatsappPdf(phone: string, pdf: Buffer, fileName: string, caption?: string): Promise<void> {
  return post("send-document/pdf", {
    phone,
    document: `data:application/pdf;base64,${pdf.toString("base64")}`,
    fileName,
    ...(caption ? { caption } : {}),
  });
}
