"use client";

import { useEffect } from "react";

// Garante que o pixel de anúncios nunca fique carregado dentro do app.
//
// O pixel só é ligado nas páginas públicas de venda, mas quem vem delas
// para o app sem recarregar a página (o site troca de tela sem recarregar)
// traria o script junto, na memória. Se isso acontecer, recarrega a página
// uma vez: o app abre limpo, sem nenhum script da Meta.
export function NoPixelInApp() {
  useEffect(() => {
    if (typeof window !== "undefined" && (window as unknown as { fbq?: unknown }).fbq) {
      window.location.reload();
    }
  }, []);
  return null;
}
