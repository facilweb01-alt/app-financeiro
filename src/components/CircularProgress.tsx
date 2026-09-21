"use client";

import { formatPercentBR } from "@/lib/format";

// Anel de progresso em SVG puro (sem lib extra) para destacar visualmente
// o percentual da renda comprometida no mês — inspirado no padrão "ring
// chart" usado por apps financeiros modernos (Monzo, Wealthfront) pra
// resumir "quanto já foi comprometido vs. o total disponível" de forma
// mais direta que um número solto num card.
//
// Cor muda de acordo com a faixa (verde/âmbar/vermelho) — o mesmo padrão
// de "cor com significado financeiro" já usado nos alertas de limite de
// gastos e nas metas de investimento, agora também no indicador principal
// do dashboard. Um brilho (glow) na mesma cor do anel dá profundidade sem
// precisar de uma lib 3D — só CSS `filter: drop-shadow`.
export function CircularProgress({
  percent,
  size = 148,
  strokeWidth = 13,
  label,
}: {
  percent: number | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // O anel em si sempre fecha no máximo em 100% (senão a barra "dá a volta
  // de novo" visualmente) — mas o número exibido continua sendo o real,
  // mesmo passando muito de 100%, com o badge "Renda estourada" deixando
  // claro que o valor passou do limite.
  const clamped = percent === null ? 0 : Math.max(0, Math.min(percent, 100));
  const offset = circumference * (1 - clamped / 100);

  const { stroke, glow, badgeClass, statusLabel } =
    percent === null
      ? { stroke: "#94a3b8", glow: "rgba(148,163,184,0.35)", badgeClass: "bg-navy-800 text-navy-400", statusLabel: "Defina sua renda" }
      : percent < 70
      ? { stroke: "#22c55e", glow: "rgba(34,197,94,0.45)", badgeClass: "bg-emerald-950/40 text-emerald-400", statusLabel: "Sob controle" }
      : percent < 100
      ? { stroke: "#f59e0b", glow: "rgba(245,158,11,0.45)", badgeClass: "bg-amber-950/40 text-amber-400", statusLabel: "Atenção" }
      : { stroke: "#ef4444", glow: "rgba(239,68,68,0.5)", badgeClass: "bg-red-950/40 text-red-400", statusLabel: "Renda estourada" };

  const percentText = percent === null ? "—" : formatPercentBR(percent);
  // Percentuais muito grandes (renda informada baixa demais em relação aos
  // gastos) geram um texto longo — reduzir a fonte pra caber dentro do anel
  // em vez de estourar o card.
  const numberSizeClass = percentText.length > 9 ? "text-base" : percentText.length > 6 ? "text-xl" : "text-2xl";

  return (
    <div className="animate-rise-in flex flex-col items-center gap-2.5">
      <div className="relative" style={{ width: size, height: size, filter: `drop-shadow(0 0 14px ${glow})` }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-navy-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1), stroke 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <span className={`font-bold text-navy-100 ${numberSizeClass}`}>{percentText}</span>
          {label && <span className="text-[11px] text-navy-500">{label}</span>}
        </div>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass}`}>{statusLabel}</span>
    </div>
  );
}
