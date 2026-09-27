// Regras puras (sem banco) para interpretar o que chega do WhatsApp (via n8n)
// em POST /api/whatsapp/lancamento. Ficam aqui para serem testadas de
// verdade em run-tests.ts.
//
// Bugs reais que motivaram este arquivo (teste do Marcelo em 26/09/2026):
// 1. "Gastei 19,90 ... para vencimento dia 15/10" → a IA do n8n mandou a
//    data num formato que passava na validação mas não era uma data real
//    (dia/mês trocados), o banco recusou e o cliente recebeu só "Tive um
//    problema para registrar". Agora a data é validada de verdade e aceita
//    também "15/10" e "15/10/2026".
// 2. "Gastei 300 no cartão Mercado Pago parcelado em 3x" → virava um
//    lançamento avulso de R$ 300 no mês, sem parcelas. Agora, quando a
//    mensagem é de cartão, vira compra no cartão com as parcelas geradas
//    (mesma regra da tela Cartões).

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= last;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Converte a data que veio do WhatsApp para "YYYY-MM-DD".
 * Aceita "2026-10-15", "15/10/2026", "15-10-2026", "15/10/26" e "15/10"
 * (sem ano: usa o ano de `today`, ou o seguinte se a data já passou há mais
 * de 2 meses — "vence 15/01" dito em dezembro é janeiro do ano que vem).
 * Devolve null quando não é uma data real.
 */
export function normalizeFlexibleDate(value: string | null | undefined, today: string): string | null {
  if (value == null) return null;
  const v = String(value).trim();
  if (!v) return null;

  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? iso(y, mo, d) : null;
  }

  m = v.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const [ty, tm, td] = today.split("-").map(Number);
    let y: number;
    if (m[3]) {
      y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    } else {
      y = ty;
      if (isRealDate(y, mo, d)) {
        const diffDays = (Date.UTC(y, mo - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000;
        if (diffDays < -60) y += 1;
      }
    }
    return isRealDate(y, mo, d) ? iso(y, mo, d) : null;
  }

  return null;
}

/** "Cartão Mercado Pago" → "mercado pago"; ignora acentos, caixa e a palavra "cartão". */
export function normalizeCardName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(cartao|cartoes|card|de credito|credito|do|da|de|no|na)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nome bonito para um cartão criado pelo WhatsApp: "mercado pago" → "Mercado Pago". */
export function displayCardName(name: string): string {
  const base = normalizeCardName(name) || name.trim();
  return base
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Acha o cartão do usuário pelo nome dito na mensagem. Primeiro nome igual
 * (sem acento/caixa/"cartão"); depois "um contém o outro" — só se for um
 * único candidato, para nunca lançar no cartão errado.
 */
export function matchCard<T extends { id: string; name: string }>(cards: T[], spoken: string): T | null {
  const target = normalizeCardName(spoken);
  if (!target) return null;
  const exact = cards.filter((c) => normalizeCardName(c.name) === target);
  if (exact.length >= 1) return exact[0];
  const partial = cards.filter((c) => {
    const n = normalizeCardName(c.name);
    return n && (n.includes(target) || target.includes(n));
  });
  return partial.length === 1 ? partial[0] : null;
}

/** A mensagem é de compra no cartão? */
export function isCardPurchase(input: {
  paymentMethod?: string | null;
  cardName?: string | null;
  installments?: number | null;
}): boolean {
  const pm = (input.paymentMethod ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/cart|credit/.test(pm)) return true;
  if (input.cardName && input.cardName.trim()) return true;
  return (input.installments ?? 1) > 1;
}
