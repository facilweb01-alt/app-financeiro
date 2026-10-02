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

// ---------------------------------------------------------------------------
// Categoria do lançamento que chega pelo WhatsApp (pedido do Marcelo em
// 02/10/2026): "mercado" tem que cair em Compra de alimentos; categoria que
// o cliente já tem é mantida; categoria nova, dita na mensagem, é criada
// automaticamente.
// ---------------------------------------------------------------------------

export type WhatsappCategory = { id: string; key: string; label: string; isCustom: boolean };

export type WhatsappCategoryDecision =
  | { kind: "existing"; category: WhatsappCategory }
  | { kind: "create"; label: string; key: string }
  | { kind: "none" };

/** Sem acento, minúsculo, só letras/números separados por um espaço. */
export function normalizeCategoryText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Palavras do dia a dia → categoria padrão do sistema. Usado tanto para o
// nome de categoria dito pelo cliente quanto para a descrição do gasto,
// quando a IA devolve algo genérico ("produto"/"outros").
const DEFAULT_CATEGORY_WORDS: Record<string, string[]> = {
  alimentacao: [
    "alimentacao", "alimentos", "alimento", "comida", "mercado", "supermercado", "mercadinho", "mercearia",
    "atacadao", "atacado", "feira", "padaria", "acougue", "hortifruti", "sacolao", "restaurante", "lanche",
    "lanchonete", "ifood", "delivery", "refeicao", "almoco", "jantar", "pizza", "pizzaria", "hamburguer",
  ],
  saude: [
    "saude", "farmacia", "drogaria", "remedio", "remedios", "medico", "medica", "consulta", "dentista",
    "exame", "exames", "hospital", "clinica",
  ],
  gasolina: ["gasolina", "combustivel", "posto", "etanol", "diesel", "abastecimento", "abasteci"],
  lazer: ["lazer", "cinema", "show", "passeio", "festa", "diversao", "balada", "parque"],
  viagem: ["viagem", "hotel", "passagem", "passagens", "hospedagem", "pousada"],
  compras_pessoais: ["roupa", "roupas", "sapato", "sapatos", "calcado", "tenis", "perfume", "cosmetico", "cosmeticos"],
};

const GENERIC_KEYS = new Set(["", "outros", "produto", "servico"]);

function slugKey(text: string): string {
  return normalizeCategoryText(text).replace(/ /g, "_");
}

function containsWords(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

// "Mercado Pago"/"Mercado Livre" são banco e loja, não compra de alimentos.
const NOT_FOOD_PHRASES = /\bmercado (pago|livre)\b/g;

function defaultKeyForWords(rawText: string): string | null {
  const text = rawText.replace(NOT_FOOD_PHRASES, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  for (const [key, words] of Object.entries(DEFAULT_CATEGORY_WORDS)) {
    if (words.some((w) => containsWords(text, w))) return key;
  }
  return null;
}

/** "  pet  shop " → "Pet shop" (até 40 caracteres); null se não for um nome de verdade. */
export function prettyCategoryLabel(name: string | null | undefined): string | null {
  const clean = (name ?? "").replace(/\s+/g, " ").trim().slice(0, 40).trim();
  if (normalizeCategoryText(clean).replace(/[^a-z]/g, "").length < 2) return null;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Decide em qual categoria gravar. Ordem:
 * 1. nome dito na mensagem bate com uma categoria do cliente (própria ou do
 *    sistema) → mantém a que já existe;
 * 2. a descrição cita uma categoria que o próprio cliente criou → usa ela;
 * 3. a IA devolveu uma categoria padrão específica → usa ela; se devolveu
 *    algo genérico (produto/serviço/outros), tenta pelas palavras do dia a
 *    dia ("mercado" → Compra de alimentos);
 * 4. o cliente disse um nome de categoria que não existe → cria;
 * 5. senão, a categoria genérica da IA, ou "Outros".
 */
export function resolveWhatsappCategory(input: {
  categories: WhatsappCategory[];
  categoryKey?: string | null;
  categoryName?: string | null;
  description?: string | null;
}): WhatsappCategoryDecision {
  const { categories } = input;
  const byKey = (key: string | null) => (key ? categories.find((c) => !c.isCustom && c.key === key) ?? null : null);
  const custom = categories.filter((c) => c.isCustom);
  const name = normalizeCategoryText(input.categoryName);
  const description = normalizeCategoryText(input.description);
  const aiKey = slugKey(input.categoryKey ?? "");

  if (name) {
    const sameName = (c: WhatsappCategory) => normalizeCategoryText(c.label) === name || c.key === slugKey(name);
    const found = custom.find(sameName) ?? categories.find(sameName) ?? byKey(defaultKeyForWords(name));
    if (found) return { kind: "existing", category: found };
  }

  const mentioned = custom.find((c) => {
    const label = normalizeCategoryText(c.label);
    return label.length >= 3 && containsWords(description, label);
  });
  if (mentioned) return { kind: "existing", category: mentioned };

  const aiCategory = categories.find((c) => c.key === aiKey) ?? null;
  if (aiCategory && !GENERIC_KEYS.has(aiKey)) return { kind: "existing", category: aiCategory };

  const fromDescription = byKey(defaultKeyForWords(description));
  if (fromDescription) return { kind: "existing", category: fromDescription };

  if (name && (!aiCategory || aiKey === "outros")) {
    const label = prettyCategoryLabel(input.categoryName);
    if (label) return { kind: "create", label, key: slugKey(label) || "categoria" };
  }

  const fallback = aiCategory ?? byKey("outros");
  return fallback ? { kind: "existing", category: fallback } : { kind: "none" };
}
