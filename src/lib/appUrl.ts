// Endereço público do app, para links em mensagens enviadas fora de uma
// requisição do cliente (ex.: boas-vindas pelo WhatsApp). Usa APP_URL quando
// configurada (ex.: depois de ligar o domínio próprio); senão, o endereço do
// serviço no Render.
export function publicAppUrl(): string {
  return (process.env.APP_URL || "https://app-financeiro-yswn.onrender.com").replace(/\/$/, "");
}
