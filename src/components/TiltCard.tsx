"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";

// Efeito de profundidade leve para os cards do painel: uma leve inclinação
// 3D acompanhando o toque/mouse (tilt), sem nenhuma lib de 3D — só CSS
// `transform: perspective(...) rotateX/rotateY` atualizado via
// `requestAnimationFrame`. Pedido do Marcelo: "elementos 3D" no layout,
// mas o app é mobile-first e precisa carregar rápido, então a escolha foi
// esse efeito leve em vez de renderização 3D de verdade (Three.js/WebGL) —
// confirmado com ele antes de construir.
//
// A inclinação é sutil (no máximo ~5deg) de propósito: o objetivo é dar
// sensação de profundidade/"objeto físico", não virar um efeito de jogo
// que distrai de números financeiros.
const MAX_TILT_DEG = 5;

export function TiltCard({
  children,
  className = "",
  glow = true,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    // Respeita quem pediu menos movimento no sistema (acessibilidade).
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height; // 0..1
    const rotateY = (px - 0.5) * MAX_TILT_DEG * 2;
    const rotateX = (0.5 - py) * MAX_TILT_DEG * 2;

    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--tilt-rx", `${rotateX.toFixed(2)}deg`);
      el.style.setProperty("--tilt-ry", `${rotateY.toFixed(2)}deg`);
      el.style.setProperty("--glow-x", `${(px * 100).toFixed(1)}%`);
      el.style.setProperty("--glow-y", `${(py * 100).toFixed(1)}%`);
    });
  };

  const handlePointerLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-rx", "0deg");
    el.style.setProperty("--tilt-ry", "0deg");
  };

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`tilt-card ${glow ? "tilt-card-glow" : ""}`}
    >
      <div className={`tilt-card-inner ${className}`}>{children}</div>
    </div>
  );
}
