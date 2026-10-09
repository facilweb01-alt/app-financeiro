// Número do WhatsApp do Contay (o número conectado no Z-API), só
// para exibir nas telas. Pode ser trocado pela variável
// NEXT_PUBLIC_WHATSAPP_BOT_NUMBER sem mexer no código.
export const WHATSAPP_BOT_DISPLAY = process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER ?? "(83) 98199-5301";

/** Link wa.me do mesmo número (55 + DDD + número, só dígitos). */
export function whatsappSupportLink(text?: string): string {
  const digits = WHATSAPP_BOT_DISPLAY.replace(/\D/g, "");
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
