// Logomarca do App Financeiro: um balão de conversa (o lançamento chega por
// mensagem de WhatsApp) com barras subindo (o dinheiro organizado/crescendo).
// Símbolo em SVG puro, sem fonte externa — renderiza igual em qualquer tela
// e serve de base para os ícones do app (public/icons/*, gerados a partir de
// public/logo-symbol.svg).

import { useId } from "react";

export function LogoSymbol({ size = 36, className = "" }: { size?: number; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const bg = `lg-bg-${uid}`;
  const shine = `lg-shine-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="App Financeiro"
      className={className}
    >
      <defs>
        <linearGradient id={bg} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* balão de conversa com "rabinho" embaixo à esquerda */}
      <path
        d="M18 4h28c7.7 0 14 6.3 14 14v20c0 7.7-6.3 14-14 14H26l-11.5 8.6c-1.3 1-3.1-.1-2.8-1.7L13.2 51C7.9 49 4 43.9 4 38V18C4 10.3 10.3 4 18 4z"
        fill={`url(#${bg})`}
      />
      <path d="M18 4h28c7.7 0 14 6.3 14 14v6H4v-6C4 10.3 10.3 4 18 4z" fill={`url(#${shine})`} />
      {/* barras subindo — a última em verde (crescimento) */}
      <rect x="16" y="30" width="8" height="12" rx="2.5" fill="#ffffff" fillOpacity="0.85" />
      <rect x="28" y="22" width="8" height="20" rx="2.5" fill="#ffffff" />
      <rect x="40" y="13" width="8" height="29" rx="2.5" fill="#34d399" />
    </svg>
  );
}

export function Logo({
  size = 36,
  className = "",
  textClassName = "text-lg",
}: {
  size?: number;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoSymbol size={size} />
      <span className={`whitespace-nowrap font-semibold leading-none tracking-tight text-navy-50 ${textClassName}`}>
        App{" "}
        <span className="bg-linear-to-r from-blue-400 to-emerald-300 bg-clip-text font-extrabold text-transparent">
          Financeiro
        </span>
      </span>
    </span>
  );
}
