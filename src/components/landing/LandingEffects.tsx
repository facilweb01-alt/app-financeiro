"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeSignupSource, sourceFromReferrer } from "@/lib/business/signupSource";

// Os dois efeitos da página de vendas que precisam de JavaScript:
//   1. barra fixa "Quero esse app" no celular: aparece depois que o topo
//      (#hero) sai da tela e some quando a seção de preço (#preco) entra;
//   2. os celulares 3D do topo (#stage dentro de #scene) inclinam seguindo o mouse,
//      só em computador e só se a pessoa não pediu "reduzir movimento".
//   3. origem sem "utm_*" (05/11/2026): quem chegou pelo Instagram, Google ou
//      um link no WhatsApp sem UTM leva o nome do site de origem para o
//      cadastro (os botões de cadastro passam a abrir /registrar?utm_source=...).
// Sem JavaScript a página continua completa; só perde esses detalhes.
export function LandingEffects({ registerHref = "/registrar" }: { registerHref?: string }) {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

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
    if (normalizeSignupSource(window.location.search)) return; // já veio com UTM: o servidor cuida
    const source = sourceFromReferrer(document.referrer, window.location.host);
    if (!source) return;
    // Antes do clique chegar ao Link do Next (fase de captura), troca o destino.
    const onClick = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = (ev.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.getAttribute("href") !== "/registrar") return;
      ev.preventDefault();
      ev.stopPropagation();
      router.push(`/registrar?${source}`);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

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
      stage.style.transform = `rotateX(${4 - y * 8}deg) rotateY(${-6 + x * 12}deg)`;
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
        <b>Teste o Contay 7 dias grátis</b>
        <br />
        sem cartão · anual R$ 97 se gostar
      </div>
      <Link className="btn btn-cta" href={registerHref} tabIndex={visible ? 0 : -1}>
        Testar grátis
      </Link>
    </div>
  );
}
