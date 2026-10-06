// Parte do navegador da medição de anúncios (pixel da Meta).
//
// Regras, todas de propósito:
// - Só carrega DEPOIS que a pessoa clica em "Aceitar" no aviso de cookies
//   (a escolha fica guardada no navegador dela). Recusou ou ainda não
//   escolheu: nenhum script da Meta é baixado e nenhum evento é enviado.
// - Só existe nas páginas públicas de venda: "/", "/registrar" e
//   "/assinatura". Nunca dentro do app (painel, lançamentos, cartões...).
// - Não envia nome, e-mail, CPF, WhatsApp nem dado financeiro: só o nome
//   do evento (visita, cadastro concluído, assinatura paga) e, na
//   assinatura, o valor do plano.

export const CONSENT_KEY = "contay_cookies";
export const CONSENT_EVENT = "contay:cookies";
export type Consent = "aceito" | "recusado" | null;

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  disablePushState?: boolean;
  push?: unknown;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
    __contayPixel?: string;
  }
}

export function readConsent(): Consent {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "aceito" || v === "recusado" ? v : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: Consent) {
  try {
    if (value) window.localStorage.setItem(CONSENT_KEY, value);
    else window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    // navegador sem armazenamento (aba anônima restrita): vale só nesta página
  }
  if (value !== "aceito" && window.fbq) window.fbq("consent", "revoke");
  if (value === "aceito" && window.fbq) window.fbq("consent", "grant");
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
}

// Carrega o pixel uma única vez por página. Devolve false (e não faz nada)
// se não houver consentimento.
export function ensurePixel(pixelId: string): boolean {
  if (readConsent() !== "aceito") return false;
  if (window.__contayPixel === pixelId && window.fbq) return true;

  if (!window.fbq) {
    const fbq: Fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue!.push(args);
    };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    // Não deixa o script da Meta contar sozinho as trocas de tela do site:
    // só sai o que este arquivo manda.
    fbq.disablePushState = true;
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    s.setAttribute("data-contay-pixel", "1");
    document.head.appendChild(s);
  }
  // Desliga os "eventos automáticos" (cliques em botões e leitura do
  // conteúdo da página) antes de iniciar.
  window.fbq!("set", "autoConfig", false, pixelId);
  window.fbq!("init", pixelId);
  window.__contayPixel = pixelId;
  return true;
}

// Envia um evento. Com `onceKey`, o mesmo evento só sai uma vez por
// navegador (ex.: a assinatura não é contada de novo se a pessoa recarregar
// a página).
export function trackMeta(
  pixelId: string,
  name: string,
  params?: Record<string, unknown>,
  onceKey?: string
): boolean {
  if (!ensurePixel(pixelId)) return false;
  if (onceKey) {
    try {
      const k = `contay_px_${onceKey}`;
      if (window.localStorage.getItem(k)) return false;
      window.localStorage.setItem(k, "1");
    } catch {
      // sem armazenamento: envia mesmo assim
    }
  }
  if (params) window.fbq!("track", name, params);
  else window.fbq!("track", name);
  return true;
}
