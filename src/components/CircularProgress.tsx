"use client";

// Anel de progresso em SVG puro (sem lib extra) para destacar visualmente
// o percentual da renda comprometida no mês — inspirado no padrão "ring
// chart" usado por apps financeiros modernos (Monzo, Wealthfront) pra
// resumir "quanto já foi comprometido vs. o total disponível" de forma
// mais direta que um número solto num card.
//
// Cor muda de acordo com a faixa (verde/âmbar/vermelho) — o mesmo padrão
// de "cor com significado financeiro" já usado nos alertas de limite de
// gastos e nas metas de investimento, agora também no indicador principal
// do dashboard.
export function CircularProgress({
  percent,
  size = 128,
  strokeWidth = 12,
  label,
}: {
  percent: number | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = percent === null ? 0 : Math.max(0, Math.min(percent, 100));
  const offset = circumference * (1 - clamped / 100);

  const { stroke, badgeClass, statusLabel } =
    percent === null
      ? { stroke: "#94a3b8", badgeClass: "bg-navy-800 text-navy-400", statusLabel: "Defina sua renda" }
      : percent < 70
      ? { stroke: "#22c55e", badgeClass: "bg-emerald-950/40 text-emerald-400", statusLabel: "Sob controle" }
      : percent < 100
      ? { stroke: "#f59e0b", badgeClass: "bg-amber-950/40 text-amber-400", statusLabel: "Atenção" }
      : { stroke: "#ef4444", badgeClass: "bg-red-950/40 text-red-400", statusLabel: "Renda estourada" };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
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
            style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-navy-100">
            {percent === null ? "—" : `${percent}%`}
          </span>
          {label && <span className="text-[11px] text-navy-500">{label}</span>}
        </div>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass}`}>{statusLabel}</span>
    </div>
  );
}
