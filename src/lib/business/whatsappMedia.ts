// Áudio e imagem pelo WhatsApp (pedido do Marcelo em 11/10/2026).
// Regras PURAS (sem rede nem banco), testadas em __tests__/run-tests.ts.
//
// Como funciona: o n8n recebe do Z-API a mensagem de áudio ou imagem e manda
// para POST /api/whatsapp/midia só o endereço do arquivo. O app baixa o
// arquivo, pede à inteligência artificial (Gemini) para ouvir/ler e devolver
// o gasto já estruturado, grava o lançamento pelo mesmo caminho das mensagens
// de texto e devolve a resposta pronta para o n8n mandar ao cliente.

export type MediaKind = "audio" | "image";

/** Tamanho máximo do arquivo aceito (um áudio de WhatsApp de 3 min tem ~0,4 MB). */
export const MEDIA_MAX_BYTES: Record<MediaKind, number> = {
  audio: 8 * 1024 * 1024,
  image: 6 * 1024 * 1024,
};

const AUDIO_MIMES = ["audio/ogg", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/webm", "audio/flac", "audio/aiff"];
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Tipo do arquivo no formato que a IA aceita, ou null se não servir.
 * "audio/ogg; codecs=opus" (áudio de voz do WhatsApp) vira "audio/ogg".
 */
export function normalizeMediaMime(kind: MediaKind, raw: string | null | undefined): string | null {
  const mime = (raw ?? "").split(";")[0].trim().toLowerCase();
  if (kind === "audio") {
    if (!mime || mime === "application/octet-stream" || mime === "application/ogg") return "audio/ogg"; // padrão do WhatsApp
    if (mime === "audio/mp3") return "audio/mpeg";
    if (mime === "audio/x-wav") return "audio/wav";
    return AUDIO_MIMES.includes(mime) ? mime : null;
  }
  if (!mime || mime === "application/octet-stream") return "image/jpeg"; // padrão do WhatsApp
  if (mime === "image/jpg") return "image/jpeg";
  return IMAGE_MIMES.includes(mime) ? mime : null;
}

/**
 * Confere o endereço do arquivo antes de baixar. Só https; nunca endereços
 * internos (localhost, IP literal, nomes sem ponto). `allowedHosts` (variável
 * WHATSAPP_MIDIA_HOSTS, separada por vírgula) restringe aos domínios
 * informados e seus subdomínios; nos testes locais, "localhost" na lista
 * libera também http://localhost.
 */
export function validateMediaUrl(raw: string, allowedHosts: string[] = []): { ok: true; url: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Endereço do arquivo inválido." };
  }
  const host = url.hostname.toLowerCase();
  const allowed = allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
  const inList = allowed.some((h) => host === h || host.endsWith(`.${h}`));
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (isLocal) {
    // só nos testes locais, com "localhost" na lista
    return allowed.includes("localhost") && (url.protocol === "http:" || url.protocol === "https:")
      ? { ok: true, url: url.toString() }
      : { ok: false, error: "Endereço do arquivo não permitido." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "O arquivo precisa estar em um endereço https." };
  if (url.username || url.password) return { ok: false, error: "Endereço do arquivo não permitido." };
  // IP literal (v4 ou v6) ou nome sem ponto = rede interna; nunca baixar.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[") || !host.includes(".")) {
    return { ok: false, error: "Endereço do arquivo não permitido." };
  }
  if (/\.(internal|local|lan|localhost)$/.test(host)) return { ok: false, error: "Endereço do arquivo não permitido." };
  if (allowed.length > 0 && !inList) return { ok: false, error: "Endereço do arquivo fora dos domínios permitidos." };
  return { ok: true, url: url.toString() };
}

export const MEDIA_CATEGORY_KEYS = ["produto", "servico", "lazer", "saude", "alimentacao", "compras_pessoais", "viagem", "gasolina", "outros"] as const;

/** Instrução enviada à IA junto com o áudio ou a imagem. */
export function buildMediaPrompt(input: { kind: MediaKind; today: string; caption?: string | null }): string {
  const what =
    input.kind === "audio"
      ? "Você vai ouvir um áudio de WhatsApp, em português do Brasil, enviado por um cliente de um app de controle de gastos."
      : "Você vai ver uma imagem enviada por WhatsApp por um cliente de um app de controle de gastos (normalmente foto de nota, cupom fiscal, comprovante de pagamento ou print de compra).";
  return [
    what,
    `Hoje é ${input.today}.`,
    input.caption ? `Legenda escrita pelo cliente junto com a imagem: "${input.caption.slice(0, 300)}".` : "",
    "",
    "Responda SOMENTE com um objeto JSON, sem texto antes ou depois, com estes campos:",
    '- "tipo": "lancamento" se a pessoa está informando UM gasto com valor; "duvida" se está fazendo uma pergunta ou pedido que não é um gasto; "nada" se não deu para entender, não há valor, ou há vários gastos diferentes.',
    input.kind === "audio"
      ? '- "transcricao": o que a pessoa falou, por escrito, em uma frase curta.'
      : '- "transcricao": uma frase curta dizendo o que a imagem mostra (ex.: "Cupom do Supermercado Bom Preço, total R$ 87,40").',
    '- "description": nome curto do gasto (ex.: "Mercado", "Uber", "Farmácia"). Só para tipo "lancamento".',
    '- "amount": valor TOTAL em reais, número com ponto decimal (ex.: 45.9). Em nota ou cupom use o TOTAL pago, não os itens.',
    `- "categoryKey": uma destas: ${MEDIA_CATEGORY_KEYS.join(", ")}.`,
    '- "categoryName": só se a pessoa disse o nome de uma categoria própria (ex.: "categoria pet"); senão null.',
    '- "purchaseDate": data da compra em "YYYY-MM-DD" se foi dita ou aparece na imagem; senão null.',
    '- "dueDate": data de vencimento em "YYYY-MM-DD" se foi dita; senão null.',
    '- "paymentMethod": "cartao" se foi no cartão de crédito; senão null.',
    '- "cardName": nome do cartão se foi dito (ex.: "azul", "Nubank"); senão null.',
    '- "installments": número de parcelas se foi dito (ex.: 3); senão null.',
    "",
    "Não invente valor: se o valor não foi dito ou não está legível, use tipo \"nada\". Nunca inclua números de cartão, CPF ou senhas na resposta.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export type MediaAnswer =
  | {
      type: "lancamento";
      transcript: string;
      description: string;
      amount: number;
      categoryKey: string | null;
      categoryName: string | null;
      purchaseDate: string | null;
      dueDate: string | null;
      paymentMethod: string | null;
      cardName: string | null;
      installments: number | null;
    }
  | { type: "duvida"; transcript: string }
  | { type: "nada"; transcript: string };

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** "45,90", "R$ 1.234,56", 45.9 → número; inválido ou não positivo → null. */
export function parseMediaAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d.,-]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // formato brasileiro
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Lê a resposta da IA (JSON, às vezes dentro de ```json ... ```) e devolve só
 * o que é seguro usar. Qualquer coisa fora do esperado vira "nada" — nunca
 * grava um lançamento com valor duvidoso.
 */
export function parseMediaAnswer(raw: string | null | undefined): MediaAnswer {
  const nothing = (transcript = ""): MediaAnswer => ({ type: "nada", transcript });
  if (!raw) return nothing();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return nothing();
  let obj: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return nothing();
    obj = parsed as Record<string, unknown>;
  } catch {
    return nothing();
  }
  const transcript = text(obj.transcricao, 400) ?? "";
  const tipo = text(obj.tipo, 20)?.toLowerCase();
  if (tipo === "duvida") return { type: "duvida", transcript };
  if (tipo !== "lancamento") return nothing(transcript);

  const description = text(obj.description, 80);
  const amount = parseMediaAmount(obj.amount);
  // valor absurdo (erro de leitura) também não é gravado
  if (!description || amount === null || amount > 1_000_000) return nothing(transcript);

  const key = text(obj.categoryKey, 40)?.toLowerCase() ?? null;
  const date = (v: unknown) => {
    const d = text(v, 10);
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  };
  const inst = typeof obj.installments === "number" ? obj.installments : Number(text(obj.installments, 3) ?? NaN);
  return {
    type: "lancamento",
    transcript,
    description,
    amount,
    categoryKey: key && (MEDIA_CATEGORY_KEYS as readonly string[]).includes(key) ? key : null,
    categoryName: text(obj.categoryName, 40),
    purchaseDate: date(obj.purchaseDate),
    dueDate: date(obj.dueDate),
    paymentMethod: text(obj.paymentMethod, 20),
    cardName: text(obj.cardName, 40),
    installments: Number.isInteger(inst) && inst >= 1 && inst <= 48 ? inst : null,
  };
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** O que o endpoint de lançamento devolve (só os campos usados na resposta). */
export type LaunchResult = {
  kind?: string;
  category?: string;
  categoryCreated?: boolean;
  amount?: number;
  description?: string;
  cardName?: string;
  installments?: number;
  installmentAmount?: string | number;
  firstDueDate?: string;
  notice?: string | null;
};

/** Texto que o n8n manda ao cliente depois de um áudio/imagem. */
export function buildMediaReply(input: {
  kind: MediaKind;
  outcome: "lancado" | "duvida" | "nada" | "erro";
  transcript?: string;
  launch?: LaunchResult;
  error?: string;
}): string {
  const heard = input.transcript ? `${input.kind === "audio" ? "🎙️ Entendi" : "🖼️ Li na imagem"}: “${input.transcript}”` : "";
  if (input.outcome === "lancado" && input.launch) {
    const l = input.launch;
    const lines =
      l.kind === "cartao"
        ? [
            "💳 *Compra no cartão registrada!*",
            `${l.description} · ${brl(Number(l.amount ?? 0))}`,
            `Cartão ${l.cardName}${l.installments && l.installments > 1 ? ` · ${l.installments}x de ${brl(Number(l.installmentAmount ?? 0))}` : ""}`,
            l.firstDueDate ? `1º vencimento: ${dateBR(l.firstDueDate)}` : "",
          ]
        : [
            "✅ *Lançamento registrado!*",
            `${l.description} · ${brl(Number(l.amount ?? 0))}`,
            `Categoria: ${l.category}${l.categoryCreated ? " (criada agora)" : ""}`,
          ];
    return [...lines, l.notice ?? "", heard, "Se algo ficou errado, corrija no app em Lançamentos."].filter(Boolean).join("\n");
  }
  if (input.outcome === "duvida") {
    return [heard, "Isso parece uma dúvida. Por enquanto eu respondo dúvidas por texto: escreva a pergunta aqui que eu respondo na hora."].filter(Boolean).join("\n");
  }
  if (input.outcome === "erro") {
    return [heard, input.error ?? "Não consegui gravar esse lançamento.", "Se preferir, mande por texto: por exemplo, “gastei 45 no mercado”."].filter(Boolean).join("\n");
  }
  return [
    input.kind === "audio" ? "Não consegui entender o gasto nesse áudio." : "Não consegui ler um gasto com valor nessa imagem.",
    heard,
    "Mande de novo dizendo o que foi e o valor, um gasto por mensagem. Exemplo: “gastei 45 no mercado”.",
  ]
    .filter(Boolean)
    .join("\n");
}
