// Logomarca do Contay: um "C" com cifrão e linhas de velocidade (o dinheiro
// organizado sem esforço). O símbolo é a arte oficial enviada pelo Marcelo,
// recortada em PNG com fundo transparente (public/logo-contay.png); os
// ícones do app (public/icons/*) e o favicon saem da mesma arte.

export function LogoSymbol({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-contay.png"
      width={size}
      height={size}
      alt="Contay"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
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
      <span className={`whitespace-nowrap font-extrabold leading-none tracking-tight text-white ${textClassName}`}>
        Con<span className="text-blue-500">tay</span>
      </span>
    </span>
  );
}
