// De onde veio o cadastro (qual anúncio/link). Regras puras, testadas em
// __tests__/run-tests.ts.
//
// Os anúncios do Contay levam para a página de vendas com parâmetros "utm_*"
// no endereço (utm_source=meta, utm_campaign=<campanha>, utm_content=<anúncio>).
// A página de vendas repassa esses parâmetros no link do botão de cadastro e o
// cadastro grava o resultado em users.signup_source. Assim o painel sabe qual
// anúncio trouxe cada cadastro e cada assinatura, mesmo quando a pessoa recusa
// os cookies da Meta.
//
// De propósito NÃO guardamos identificadores de clique (fbclid, gclid): só o
// nome da origem, da campanha e do anúncio. Nada fica gravado no navegador.

export const SIGNUP_SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;
export type SignupSourceKey = (typeof SIGNUP_SOURCE_KEYS)[number];

// Cada valor tem no máximo 80 caracteres e o texto final, já codificado, cabe
// em 400 (limite da coluna, migração 0014). Acentos e símbolos ocupam mais
// espaço depois de codificados; se passar do limite, os valores são encurtados
// até caber. O cadastro nunca pode falhar por causa da origem.
const VALUE_LIMITS = [80, 40, 20, 10] as const;
export const SIGNUP_SOURCE_MAX_LENGTH = 400;

type RawSource = string | URLSearchParams | Record<string, string | string[] | undefined | null> | null | undefined;

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ") // caracteres de controle
    .replace(/\s+/g, " ")
    .trim();
}

function read(raw: RawSource, key: string): string {
  if (!raw) return "";
  if (typeof raw === "string") return clean(new URLSearchParams(raw.replace(/^[?#]/, "")).get(key));
  if (raw instanceof URLSearchParams) return clean(raw.get(key));
  const v = raw[key];
  return clean(Array.isArray(v) ? v[0] : v);
}

/**
 * Devolve a origem em formato fixo ("utm_source=meta&utm_campaign=...") só com
 * as chaves conhecidas, ou null quando não há nenhuma. Aceita o texto do
 * endereço ("?utm_source=..."), URLSearchParams ou o objeto searchParams do Next.
 */
export function normalizeSignupSource(raw: RawSource): string | null {
  const values = SIGNUP_SOURCE_KEYS.map((key) => [key, read(raw, key)] as const).filter(([, v]) => v);
  if (values.length === 0) return null;
  for (const limit of VALUE_LIMITS) {
    const out = new URLSearchParams();
    // Array.from corta por caractere inteiro (não parte um emoji ao meio).
    for (const [key, value] of values) out.set(key, Array.from(value).slice(0, limit).join("").trim());
    const text = out.toString();
    if (text.length <= SIGNUP_SOURCE_MAX_LENGTH) return text;
  }
  return null;
}

/** Endereço do cadastro levando a origem junto ("/registrar?utm_source=..."). */
export function registerHrefWithSource(raw: RawSource): string {
  const source = normalizeSignupSource(raw);
  return source ? `/registrar?${source}` : "/registrar";
}

/** Texto curto para telas e relatórios: "meta · C1 Vendas · VID REAL 1". */
export function describeSignupSource(stored: string | null | undefined): string {
  const source = normalizeSignupSource(stored ?? null);
  if (!source) return "Direto (sem anúncio identificado)";
  const p = new URLSearchParams(source);
  return [p.get("utm_source"), p.get("utm_campaign"), p.get("utm_content")].filter(Boolean).join(" · ") || "Direto (sem anúncio identificado)";
}
