"use client";

import { useValuesVisibility } from "@/components/ValuesVisibilityProvider";

// Ícones simples em SVG inline (sem depender de biblioteca de ícones extra).
function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M6.61 6.61A18.5 18.5 0 0 0 1 12s4 8 11 8a9.26 9.26 0 0 0 5.39-1.61" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function ValuesVisibilityToggle({ className }: { className?: string }) {
  const { visible, toggle } = useValuesVisibility();
  return (
    <button
      type="button"
      onClick={toggle}
      title={visible ? "Ocultar valores" : "Mostrar valores"}
      aria-label={visible ? "Ocultar valores" : "Mostrar valores"}
      className={
        className ??
        "flex items-center justify-center rounded-full p-2 text-navy-400 transition-colors hover:bg-blue-900/30 hover:text-blue-300"
      }
    >
      {visible ? <EyeIcon /> : <EyeOffIcon />}
    </button>
  );
}
