"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Os dois efeitos da página de vendas que precisam de JavaScript:
//   1. barra fixa "Quero esse app" no celular: aparece depois que o topo
//      (#hero) sai da tela e some quando a seção de preço (#preco) entra;
//   2. o celular do topo (#stage dentro de #scene) inclina seguindo o mouse,
//      só em computador e só se a pessoa não pediu "reduzir movimento".
// Sem JavaScript a página continua completa; só perde esses dois detalhes.
export function LandingEffects() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero");
    const preco = document.getElementById("preco");
    if (!hero || !preco || !("IntersectionObserver" in window)) return;
    let heroOut = false;
    let precoIn = false;
    const update = () => setVisible(heroOut && !precoIn);
    const o1 = new IntersectionObserver((e) => {
      heroOut = !e[0].isIntersecting;
      update();
    });
    const o2 = new IntersectionObserver(
      (e) => {
        precoIn = e[0].isIntersecting;
        update();
      },
      { rootMargin: "0px 0px -30% 0px" }
    );
    o1.observe(hero);
    o2.observe(preco);
    return () => {
      o1.disconnect();
      o2.disconnect();
    };
  }, []);

  useEffect(() => {
    const scene = document.getElementById("scene");
    const stage = document.getElementById("stage");
    if (!scene || !stage) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !window.matchMedia("(hover: hover)").matches) return;
    const onMove = (ev: MouseEvent) => {
      const r = scene.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width - 0.5;
      const y = (ev.clientY - r.top) / r.height - 0.5;
      stage.style.transform = `rotateX(${8 - y * 12}deg) rotateY(${-16 + x * 20}deg) rotateZ(1deg)`;
    };
    const onLeave = () => {
      stage.style.transform = "";
    };
    scene.addEventListener("mousemove", onMove);
    scene.addEventListener("mouseleave", onLeave);
    return () => {
      scene.removeEventListener("mousemove", onMove);
      scene.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div className={`sticky${visible ? "" : " off"}`} aria-hidden={!visible} data-testid="landing-sticky">
      <div className="txt">
        <b>Controle do seu dinheiro</b>
        <br />
        pelo WhatsApp, a partir de hoje
      </div>
      <Link className="btn btn-cta" href="/registrar" tabIndex={visible ? 0 : -1}>
        Quero esse app
      </Link>
    </div>
  );
}
