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

export function buildWelcomeMessage(input: { name: string | null; appUrl: string; botNumber: string }): string {
  const who = firstName(input.name);
  return [
    `Olá${who ? `, ${who}` : ""}! 👋 Seja bem-vindo(a) ao *Contay*.`,
    "",
    "Sua conta está liberada. É por este número que você lança seus gastos e tira suas dúvidas.",
    "",
    `📌 *Salve este contato* na sua agenda como *Contay* (${input.botNumber}). Assim você acha a conversa rápido e as suas mensagens chegam certinho.`,
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
  ].join("\n");
}
