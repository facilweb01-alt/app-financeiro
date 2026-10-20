import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, withServiceMode } from "@/db/client";
import { users } from "@/db/schema";
import { hasAppAccess, todayInSaoPaulo, whatsappPhoneVariants } from "@/lib/billing/core";
import {
  MEDIA_MAX_BYTES,
  buildMediaPrompt,
  normalizeMediaMime,
  parseMediaAnswer,
  validateMediaUrl,
  type MediaAnswer,
  type MediaKind,
} from "@/lib/business/whatsappMedia";

// Parte de rede do áudio/imagem pelo WhatsApp: baixa o arquivo que o Z-API
// guardou e pergunta ao Gemini o que a pessoa disse/mostrou.
//
// Variáveis de ambiente (Render → app-financeiro → Environment):
//   GEMINI_API_KEY — chave do Google AI Studio (a mesma usada no n8n). Sem
//     ela, o recurso fica desligado e a rota avisa o cliente para mandar texto.
//   GEMINI_MODEL — opcional; padrão "gemini-2.5-flash-lite".
//   WHATSAPP_MIDIA_HOSTS — opcional; domínios de onde o arquivo pode ser
//     baixado, separados por vírgula (ex.: "z-api.io,backblazeb2.com").
//   GEMINI_BASE_URL — só para os testes apontarem para um Gemini falso.

export class MediaError extends Error {
  constructor(
    message: string,
    /** "arquivo" = problema com o arquivo; "ia" = a IA não respondeu */
    public readonly where: "arquivo" | "ia"
  ) {
    super(message);
  }
}

export function isMediaConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function allowedHosts(): string[] {
  return (process.env.WHATSAPP_MIDIA_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
}

/** Quem mandou a mensagem tem conta e pode usar o app agora? (mesma regra do lançamento por texto) */
export async function senderAccess(rawPhone: string): Promise<"sem_conta" | "sem_acesso" | "teste_encerrado" | "sem_cartao" | "ok"> {
  const isLid = /@lid\b/i.test(rawPhone);
  const digits = rawPhone.replace(/\D/g, "");
  const [user] = await withServiceMode(() =>
    db
      .select({
        status: users.status,
        billingEnabled: users.billingEnabled,
        subscriptionDueDate: users.subscriptionDueDate,
        billingCanceledAt: users.billingCanceledAt,
        trialEndsAt: users.trialEndsAt,
        billingMethod: users.billingMethod,
        cardRequired: users.cardRequired,
      })
      .from(users)
      .where(isLid ? eq(users.whatsappLid, digits) : inArray(users.whatsappPhone, whatsappPhoneVariants(digits)))
      .limit(1)
  );
  if (!user) return "sem_conta";
  const ok = hasAppAccess({
    billingEnabled: user.billingEnabled,
    status: user.status,
    subscriptionDueDate: user.subscriptionDueDate,
    today: todayInSaoPaulo(),
    canceledAt: user.billingCanceledAt,
    trialEndsAt: user.trialEndsAt,
    billingMethod: user.billingMethod,
    cardRequired: user.cardRequired,
  });
  if (ok) return "ok";
  if (user.status === "pending" && user.cardRequired && !user.billingCanceledAt && user.billingMethod === "PIX") return "sem_cartao";
  return user.status === "pending" && user.trialEndsAt ? "teste_encerrado" : "sem_acesso";
}

/**
 * Baixa o arquivo (com limite de tamanho e de tempo). Redirecionamentos são
 * seguidos à mão, no máximo 3, e cada endereço novo passa pela mesma
 * conferência do primeiro (nunca para dentro da rede do servidor).
 */
export async function downloadMedia(kind: MediaKind, rawUrl: string, declaredMime?: string | null): Promise<{ base64: string; mime: string; bytes: number }> {
  const checked = validateMediaUrl(rawUrl, allowedHosts());
  if (!checked.ok) throw new MediaError(checked.error, "arquivo");

  let res: Response;
  let current = checked.url;
  for (let hop = 0; ; hop++) {
    try {
      res = await fetch(current, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new MediaError("Não consegui baixar o arquivo.", "arquivo");
    }
    if (res.status < 300 || res.status >= 400) break;
    const location = res.headers.get("location");
    if (!location || hop >= 3) throw new MediaError("Não consegui baixar o arquivo (redirecionamento demais).", "arquivo");
    const next = validateMediaUrl(new URL(location, current).toString(), allowedHosts());
    if (!next.ok) throw new MediaError(next.error, "arquivo");
    current = next.url;
  }
  if (!res.ok) throw new MediaError(`Não consegui baixar o arquivo (HTTP ${res.status}).`, "arquivo");

  const max = MEDIA_MAX_BYTES[kind];
  const declaredLength = Number(res.headers.get("content-length") ?? "0");
  if (declaredLength > max) throw new MediaError("Arquivo grande demais.", "arquivo");

  // Lê aos poucos e para assim que passar do limite (não confia no cabeçalho).
  const reader = res.body?.getReader();
  if (!reader) throw new MediaError("Arquivo vazio.", "arquivo");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      await reader.cancel().catch(() => {});
      throw new MediaError("Arquivo grande demais.", "arquivo");
    }
    chunks.push(value);
  }
  if (bytes === 0) throw new MediaError("Arquivo vazio.", "arquivo");

  // O tipo informado pelo WhatsApp vale mais que o do servidor de arquivos.
  const mime = normalizeMediaMime(kind, declaredMime || res.headers.get("content-type"));
  if (!mime) throw new MediaError(kind === "audio" ? "Formato de áudio não aceito." : "Formato de imagem não aceito.", "arquivo");
  return { base64: Buffer.concat(chunks).toString("base64"), mime, bytes };
}

/** Pede ao Gemini para ouvir/ler o arquivo e devolver o gasto estruturado. */
export async function interpretMedia(input: { kind: MediaKind; base64: string; mime: string; caption?: string | null }): Promise<MediaAnswer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new MediaError("Áudio e imagem ainda não estão ligados.", "ia");
  const base = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  let res: Response;
  try {
    res = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      // A chave vai no cabeçalho (não no endereço) para nunca aparecer em log de URL.
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: buildMediaPrompt({ kind: input.kind, today: todayInSaoPaulo(), caption: input.caption }) },
              { inline_data: { mime_type: input.mime, data: input.base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new MediaError("A inteligência artificial não respondeu a tempo.", "ia");
  }
  if (!res.ok) {
    // Nunca devolve o corpo inteiro (pode citar a chave); só o código.
    throw new MediaError(`A inteligência artificial recusou o pedido (HTTP ${res.status}).`, "ia");
  }
  const json = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const answer = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return parseMediaAnswer(answer);
}
