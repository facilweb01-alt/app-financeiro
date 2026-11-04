"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// "Veja funcionando em 15 segundos" (página de vendas, repaginada de 04/11/2026):
// os três Reels 3D da campanha (parcelas do cartão, áudio e foto do cupom),
// cada um dentro de um celular. Regras:
// - os vídeos só carregam quando a seção chega perto da tela (preload="none"
//   + IntersectionObserver), então não pesam no carregamento da página;
// - tocam sem som, em loop, enquanto estão visíveis, e pausam fora da tela;
// - tocar no vídeo liga o som daquele vídeo (e desliga o dos outros);
// - com "reduzir movimento", nada toca sozinho: aparece a capa e o botão
//   de play (controles do navegador); sem JavaScript, fica a capa de cada vídeo.

type Reel = { key: string; src: string; poster: string; label: string; text: string };

const REELS: Reel[] = [
  { key: "parcelas", src: "/landing/reel-r1.mp4", poster: "/landing/r1-capa.webp", label: "Parcelas do cartão", text: "“400 no cartão em 4x” vira 4 parcelas, cada uma na fatura certa." },
  { key: "audio", src: "/landing/reel-r2.mp4", poster: "/landing/r2-capa.webp", label: "Áudio no WhatsApp", text: "Aperte o microfone, fale o gasto e pronto: lançado na categoria." },
  { key: "foto", src: "/landing/reel-r3.mp4", poster: "/landing/r3-capa.webp", label: "Foto do cupom", text: "Mande a foto: o Contay lê o valor, a data e o lugar sozinho." },
];

const RM = "(prefers-reduced-motion: reduce)";
function subscribeReduce(cb: () => void) {
  const mq = window.matchMedia(RM);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function ReelsShowcase() {
  const wrap = useRef<HTMLDivElement>(null);
  const vids = useRef<(HTMLVideoElement | null)[]>([]);
  const [sound, setSound] = useState<string | null>(null);
  const reduce = useSyncExternalStore(subscribeReduce, () => window.matchMedia(RM).matches, () => false);

  useEffect(() => {
    const el = wrap.current;
    if (!el || reduce || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) {
            v.preload = "auto";
            v.play().catch(() => {});
          } else {
            v.pause();
          }
        }
      },
      { threshold: 0.35 }
    );
    vids.current.forEach((v) => v && io.observe(v));
    return () => io.disconnect();
  }, [reduce]);

  function toggle(i: number) {
    const v = vids.current[i];
    if (!v) return;
    const key = REELS[i].key;
    if (sound === key) {
      v.muted = true;
      setSound(null);
      return;
    }
    vids.current.forEach((o, j) => {
      if (o && j !== i) o.muted = true;
    });
    v.muted = false;
    v.currentTime = 0;
    v.play().catch(() => {});
    setSound(key);
  }

  return (
    <div className="reels" ref={wrap} data-testid="landing-reels">
      {REELS.map((r, i) => (
        <figure className="reel" key={r.key}>
          <div className="reel-phone">
            <video
              ref={(el) => {
                vids.current[i] = el;
              }}
              src={r.src}
              poster={r.poster}
              muted
              loop
              playsInline
              preload="none"
              controls={reduce}
              width={540}
              height={960}
              aria-label={`Vídeo: ${r.label}`}
              onClick={() => toggle(i)}
            />
            {!reduce && (
              <button type="button" className={`snd${sound === r.key ? " on" : ""}`} onClick={() => toggle(i)} aria-pressed={sound === r.key} aria-label={sound === r.key ? `Tirar o som: ${r.label}` : `Ouvir: ${r.label}`}>
                {sound === r.key ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M22 9l-6 6M16 9l6 6" /></svg>
                )}
              </button>
            )}
          </div>
          <figcaption>
            <b>{r.label}</b>
            <span>{r.text}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
