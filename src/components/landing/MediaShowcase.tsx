"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

// "Escreva, fale ou fotografe" (página de vendas, 12/10/2026): os três jeitos
// de lançar pelo WhatsApp num carrossel 3D (cartão da frente no centro e os
// outros dois inclinados dos lados, com luzes orbitando em volta). Cada cartão mostra o que a pessoa
// manda (texto, áudio com a onda de voz animada, foto do cupom sendo "lida"
// por uma linha de leitura) e o lançamento que o Contay registra.
//
// - O carrossel gira sozinho enquanto está na tela; tocar numa aba (ou num
//   cartão) escolhe o modo e para o giro automático.
// - No computador, o conjunto inclina seguindo o mouse.
// - Sem JavaScript, ou com "reduzir movimento", aparece o primeiro cartão
//   parado e as abas continuam trocando o cartão da frente.
// - Ilustrativo: os textos seguem o que o Contay de verdade responde.

type Mode = {
  key: "texto" | "audio" | "foto";
  tab: string;
  icon: string;
  title: string;
  result: { title: string; line: string; cat: string };
};

const MODES: Mode[] = [
  {
    key: "texto",
    tab: "Escreva",
    icon: "✍️",
    title: "Do seu jeito, como para um amigo",
    result: {
      title: "✅ Lançamento registrado!",
      line: "Mercado · R$ 45,00",
      cat: "Compra de alimentos",
    },
  },
  {
    key: "audio",
    tab: "Fale",
    icon: "🎙️",
    title: "Grave um áudio de 3 segundos",
    result: {
      title: "✅ Lançamento registrado!",
      line: "Farmácia · R$ 30,00",
      cat: "Saúde",
    },
  },
  {
    key: "foto",
    tab: "Fotografe",
    icon: "📸",
    title: "Mande a foto do cupom",
    result: {
      title: "🧾 Cupom lido e lançado!",
      line: "Supermercado Bom Preço · R$ 87,40",
      cat: "Compra de alimentos · 12/10",
    },
  },
];

// Luzes que orbitam os cartões: ângulo inicial, altura e cor.
const ORBS = [
  { o: 0, y: -150, b: false },
  { o: 72, y: 120, b: true },
  { o: 150, y: -40, b: false },
  { o: 215, y: 160, b: true },
  { o: 290, y: 30, b: false },
];
const AUTO_EVERY = 4600;
const WAVE = [
  6, 14, 22, 12, 28, 18, 9, 24, 30, 16, 8, 20, 26, 12, 6, 18, 24, 10,
];

function Input({ mode }: { mode: Mode }) {
  if (mode.key === "texto") {
    return (
      <div className="ms-bubble">
        gastei 45 no mercado<small>12:41 ✓✓</small>
      </div>
    );
  }
  if (mode.key === "audio") {
    return (
      <div
        className="ms-bubble ms-voice"
        aria-label="Mensagem de voz: gastei trinta reais na farmácia"
      >
        <span className="ms-play" aria-hidden="true">
          ▶
        </span>
        <span className="ms-wave" aria-hidden="true">
          {WAVE.map((h, i) => (
            <i
              key={i}
              style={
                {
                  "--h": `${h}px`,
                  "--d": `${(i % 6) * 0.11}s`,
                } as CSSProperties
              }
            />
          ))}
        </span>
        <small>0:03</small>
        <em className="ms-transcript">“gastei trinta reais na farmácia”</em>
      </div>
    );
  }
  return (
    <div
      className="ms-receipt"
      aria-label="Foto de um cupom fiscal de supermercado, total R$ 87,40"
    >
      <div className="ms-rc-head">SUPERMERCADO BOM PREÇO</div>
      <div className="ms-rc-sub">CUPOM FISCAL · 12/10/2026</div>
      <div className="ms-rc-line">
        <span>ARROZ 5KG</span>
        <span>27,90</span>
      </div>
      <div className="ms-rc-line">
        <span>FEIJÃO 1KG</span>
        <span>8,49</span>
      </div>
      <div className="ms-rc-line">
        <span>CAFÉ 500G</span>
        <span>19,90</span>
      </div>
      <div className="ms-rc-line">
        <span>LEITE 1L x6</span>
        <span>31,11</span>
      </div>
      <div className="ms-rc-total">
        <span>TOTAL</span>
        <span>R$ 87,40</span>
      </div>
      <i className="ms-scan" aria-hidden="true" />
    </div>
  );
}

export function MediaShowcase() {
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const [animate, setAnimate] = useState(false);
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Lido depois de montar: a preferência só existe no navegador.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnimate(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((e) => setInView(e[0].isIntersecting), {
      threshold: 0.3,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Giro automático: só na tela, só com movimento liberado e até a pessoa tocar.
  useEffect(() => {
    if (!animate || !inView || !auto) return;
    const t = setTimeout(
      () => setIndex((i) => (i + 1) % MODES.length),
      AUTO_EVERY,
    );
    return () => clearTimeout(t);
  }, [animate, inView, auto, index]);

  // Inclinação seguindo o mouse (só computador).
  useEffect(() => {
    const root = rootRef.current;
    const tilt = tiltRef.current;
    if (
      !root ||
      !tilt ||
      !animate ||
      !window.matchMedia("(hover: hover)").matches
    )
      return;
    const onMove = (ev: MouseEvent) => {
      const r = root.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width - 0.5;
      const y = (ev.clientY - r.top) / r.height - 0.5;
      tilt.style.transform = `rotateX(${6 - y * 10}deg) rotateY(${x * 14}deg)`;
    };
    const onLeave = () => {
      tilt.style.transform = "";
    };
    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseleave", onLeave);
    return () => {
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseleave", onLeave);
    };
  }, [animate]);

  const choose = (i: number) => {
    setAuto(false);
    setIndex(i);
  };

  return (
    <div
      className={`ms${animate ? " ms-anim" : ""}`}
      ref={rootRef}
      data-testid="media-showcase"
      data-mode={MODES[index].key}
    >
      <div
        className="ms-tabs"
        role="tablist"
        aria-label="Jeitos de lançar um gasto pelo WhatsApp"
      >
        {MODES.map((m, i) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`ms-tab${i === index ? " on" : ""}`}
            onClick={() => choose(i)}
          >
            <span aria-hidden="true">{m.icon}</span> {m.tab}
          </button>
        ))}
      </div>

      <div className="ms-stage">
        <div className="ms-tilt" ref={tiltRef}>
          <div className="ms-ring">
            {MODES.map((m, i) => {
              // posição em relação ao cartão da frente: -1 esquerda, 0 frente, 1 direita
              const off = ((i - index + MODES.length + 1) % MODES.length) - 1;
              return (
                <article
                  key={m.key}
                  className={`ms-card ms-${m.key}${i === index ? " front" : ""}`}
                  style={
                    { "--off": off, "--abs": Math.abs(off) } as CSSProperties
                  }
                  aria-hidden={i !== index}
                  onClick={() => i !== index && choose(i)}
                >
                  <header>
                    <span className="ms-ico" aria-hidden="true">
                      {m.icon}
                    </span>
                    <b>{m.title}</b>
                  </header>
                  <div className="ms-flow">
                    <Input mode={m} />
                    <span className="ms-arrow" aria-hidden="true">
                      ↓
                    </span>
                    <div className="ms-result">
                      <strong>{m.result.title}</strong>
                      <span>{m.result.line}</span>
                      <em>{m.result.cat}</em>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="ms-orbit" aria-hidden="true">
            {ORBS.map((orb, i) => (
              <i
                key={i}
                className={`ms-orb${orb.b ? " b" : ""}`}
                style={
                  { "--o": `${orb.o}deg`, "--y": `${orb.y}px` } as CSSProperties
                }
              />
            ))}
          </div>
          <div className="ms-floor" aria-hidden="true" />
        </div>
      </div>

      <p className="ms-live" aria-live="polite">
        {MODES[index].tab}: {MODES[index].result.line} lançado em{" "}
        {MODES[index].result.cat}.
      </p>
      <p className="ms-note">
        Demonstração ilustrativa. Os valores são exemplos.
      </p>
    </div>
  );
}
