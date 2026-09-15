// Service worker mínimo — só o necessário para o navegador considerar o app
// "instalável" (PWA) e dar uma resiliência básica a assets estáticos.
// De propósito NÃO cacheia respostas de navegação/API: este é um app com
// dados que mudam a todo momento (lançamentos, parcelas...), então cache
// agressivo de página só causaria dados desatualizados na tela.

const CACHE_NAME = "app-financeiro-shell-v1";
const SHELL_ASSETS = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Assets estáticos do Next e da pasta /icons: cache-first (raramente mudam).
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
        return res;
      }))
    );
  }
  // Todo o resto (páginas, dados) segue direto pra rede, sem interceptar —
  // este app precisa sempre dos dados mais recentes do usuário.
});
