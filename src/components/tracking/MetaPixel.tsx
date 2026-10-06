"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONSENT_EVENT, readConsent, trackMeta, writeConsent, type Consent } from "./metaPixel";

export type MetaEventSpec = {
  name: string;
  params?: Record<string, unknown>;
  // Só uma vez por navegador.
  onceKey?: string;
  // Só dispara se este cookie existir (e apaga o cookie em seguida). Usado
  // para o "cadastro concluído": o servidor deixa o cookie ao criar a conta.
  cookieFlag?: string;
};

function takeCookieFlag(name: string): boolean {
  const has = document.cookie.split("; ").some((c) => c.startsWith(`${name}=`));
  if (has) document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  return has;
}

// Coloca a medição de anúncios numa página pública: conta a visita e os
// eventos pedidos — mas só se a pessoa aceitou os cookies. Ver metaPixel.ts.
export function MetaPixel({ pixelId, events = [] }: { pixelId: string | null; events?: MetaEventSpec[] }) {
  const key = JSON.stringify(events);
  useEffect(() => {
    if (!pixelId) return;
    const list: MetaEventSpec[] = JSON.parse(key);
    // O cookie de "acabou de se cadastrar" é consumido mesmo sem
    // consentimento, para não sobrar e contar um cadastro velho depois.
    const flags = new Map(list.filter((e) => e.cookieFlag).map((e) => [e.cookieFlag!, takeCookieFlag(e.cookieFlag!)]));
    let sent = false;
    const send = () => {
      if (sent || readConsent() !== "aceito") return;
      sent = true;
      trackMeta(pixelId, "PageView");
      for (const e of list) {
        if (e.cookieFlag && !flags.get(e.cookieFlag)) continue;
        trackMeta(pixelId, e.name, e.params, e.onceKey);
      }
    };
    send();
    window.addEventListener(CONSENT_EVENT, send);
    return () => window.removeEventListener(CONSENT_EVENT, send);
  }, [pixelId, key]);
  return null;
}

// Aviso de cookies: aparece só enquanto a pessoa não escolheu. "Recusar"
// tem o mesmo destaque de leitura que "Aceitar" e nada é medido antes da
// escolha.
export function CookieBanner({ pixelId }: { pixelId: string | null }) {
  const [consent, setConsent] = useState<Consent | "carregando">("carregando");

  useEffect(() => {
    // Lido depois de montar: o servidor não sabe a escolha guardada no navegador.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsent(readConsent());
    const onChange = (ev: Event) => setConsent((ev as CustomEvent<Consent>).detail);
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  if (!pixelId || consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      data-testid="cookie-banner"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-navy-700 bg-navy-900/95 px-4 py-4 text-navy-100 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <p className="text-sm leading-relaxed text-navy-200">
          Com a sua permissão, usamos cookies da Meta (Facebook e Instagram) para saber se os nossos anúncios trouxeram
          visitas, cadastros e assinaturas. Seus lançamentos, nome, e-mail, CPF e WhatsApp não são enviados.{" "}
          <Link href="/termos" className="text-blue-400 underline">
            Saiba mais
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => writeConsent("recusado")}
            className="flex-1 rounded-xl border border-navy-600 px-5 py-2.5 text-sm font-semibold text-navy-100 transition-colors hover:bg-navy-800 sm:flex-none"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => writeConsent("aceito")}
            className="flex-1 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 sm:flex-none"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}

// Link "Preferências de cookies" do rodapé: apaga a escolha e mostra o
// aviso de novo (é assim que a pessoa muda de ideia).
export function CookiePrefsLink({ pixelId }: { pixelId: string | null }) {
  if (!pixelId) return null;
  return (
    <button
      type="button"
      data-testid="cookie-prefs"
      onClick={() => writeConsent(null)}
      style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
    >
      Cookies
    </button>
  );
}
