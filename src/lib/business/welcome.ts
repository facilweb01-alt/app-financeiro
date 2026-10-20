// Regras puras da mensagem de boas-vindas pelo WhatsApp (pedido do Marcelo
// em 02/10/2026): dar as boas-vindas, mandar o manual junto e pedir para o
// cliente salvar o contato — é por esse número que ele lança os gastos e
// tira dúvidas. Testado em __tests__/run-tests.ts.

/**
 * Telefone no formato que o Z-API espera: DDI + DDD + número, só dígitos.
 * O cadastro guarda "83999998888" (sem 55) ou já com DDI; devolve null se
 * não parecer um celular/fixo brasileiro.
 */
export function zapiPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  return null;
}

/** "marcelo martins" → "Marcelo" (primeiro nome, para a saudação). */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "";
}

/** "2026-10-18" → "18/10" (dia e mês, para mensagens curtas). */
export function shortDateBR(date: string): string {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}

export function buildWelcomeMessage(input: {
  name: string | null;
  appUrl: string;
  botNumber: string;
  /** Último dia do teste grátis ("YYYY-MM-DD") quando a conta acabou de entrar em teste; nulo para quem já pagou. */
  trialEndsAt?: string | null;
  /** O cartão já está cadastrado no teste (fluxo "cartão obrigatório", 20/10/2026). */
  cardOnFile?: boolean;
}): string {
  const who = firstName(input.name);
  const released = input.trialEndsAt
    ? `🎁 Seu *teste grátis de 7 dias está liberado*: use tudo à vontade até ${shortDateBR(input.trialEndsAt)}, sem pagar nada. É por este número que você lança seus gastos e tira suas dúvidas.`
    : "Sua conta está liberada. É por este número que você lança seus gastos e tira suas dúvidas.";
  return [
    `Olá${who ? `, ${who}` : ""}! 👋 Seja bem-vindo(a) ao *Contay*.`,
    "",
    released,
    "",
    `📌 *Salve este contato* na sua agenda como *Contay*, número ${input.botNumber}. Assim você acha a conversa rápido e as suas mensagens chegam certinho.`,
    "",
    "💬 *Para lançar um gasto*, é só escrever do seu jeito:",
    "• gastei 45 no mercado",
    "• uber 18,50",
    "• 300 no cartão Nubank em 3x",
    "",
    `📘 *Manual do Contay*: estou enviando o PDF logo abaixo, com cada função do app explicada. Ele também fica em ${input.appUrl}/manual`,
    "",
    "❓ *Ficou com dúvida?* Pergunte aqui mesmo, a qualquer hora.",
    "",
    `Para abrir o app: ${input.appUrl}`,
    ...(input.trialEndsAt && input.cardOnFile
      ? [
          "",
          `💳 Seu cartão já está cadastrado: no dia ${shortDateBR(input.trialEndsAt)} começa a assinatura mensal de R$ 29,90, cobrada automaticamente no cartão (sem fidelidade). Para cancelar antes, é só falar aqui.`,
        ]
      : input.trialEndsAt
        ? ["", `Um dia antes de o teste terminar eu aviso por aqui e mando o link para continuar (R$ 29,90 por mês, sem fidelidade).`]
        : []),
  ].join("\n");
}
