// Endereço público do app, para links em mensagens enviadas fora de uma
// requisição do cliente (ex.: boas-vindas pelo WhatsApp) e para os links
// absolutos das páginas. Usa APP_URL quando configurada; senão, o domínio
// oficial. O endereço antigo do Render (app-financeiro-yswn.onrender.com)
// continua funcionando e é o que os webhooks usam.
export function publicAppUrl(): string {
  return (process.env.APP_URL || "https://contay.com.br").replace(/\/$/, "");
}
