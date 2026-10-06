import "server-only";

// ID do pixel da Meta (Facebook/Instagram) usado para medir os anúncios.
// Vem da variável META_PIXEL_ID (no Render: Environment). Sem ela — ou com
// um valor que não seja só números — a medição fica DESLIGADA: nenhum
// script da Meta é carregado e o aviso de cookies nem aparece.
//
// O ID do pixel não é segredo (ele aparece no código da página de qualquer
// site que usa o pixel), mas fica em variável de ambiente para o mesmo
// código rodar em teste sem medir nada.
export function metaPixelId(): string | null {
  const raw = (process.env.META_PIXEL_ID ?? "").trim();
  return /^\d{5,20}$/.test(raw) ? raw : null;
}
