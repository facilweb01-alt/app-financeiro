"use client";

import type { ReactNode } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { formatBRL, formatYearMonthBR } from "@/lib/format";
import { useValuesVisibility } from "@/components/ValuesVisibilityProvider";

// Wrapper que borra o gráfico inteiro e mostra um aviso quando o usuário
// ligou "ocultar valores" — mascarar só os números dentro do gráfico
// (tooltip, eixo) não é prático com a biblioteca de gráficos usada aqui,
// então a solução é ocultar a visualização inteira, do mesmo jeito que
// apps de banco costumam borrar o extrato inteiro.
function HideableChart({ children }: { children: ReactNode }) {
  const { visible } = useValuesVisibility();
  if (visible) return <>{children}</>;
  return (
    <div className="relative">
      <div className="pointer-events-none blur-md select-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="rounded-full px-3 py-1 text-xs font-medium shadow-sm bg-navy-900/90 text-navy-400">
          Valores ocultos
        </span>
      </div>
    </div>
  );
}

const FALLBACK_COLORS = ["#2563eb", "#0ea5e9", "#6366f1", "#f59e0b", "#14b8a6", "#ec4899", "#ef4444", "#8b5cf6", "#64748b"];

// Recharts desenha o tooltip com fundo branco por padrão — precisa ser
// sobrescrito manualmente pra combinar com o tema azul-marinho (sem isso
// sobraria um retângulo branco piscando por cima do gráfico ao passar o
// mouse, exatamente o que o Marcelo pediu pra tirar do app).
const TOOLTIP_STYLE = {
  contentStyle: { background: "#101a3a", border: "1px solid #2c3760", borderRadius: 8, color: "#dbe3f7" },
  itemStyle: { color: "#dbe3f7" },
  labelStyle: { color: "#93a0c4" },
};
const AXIS_TICK = { fill: "#7683ab" };

type CategorySlice = { categoryKey: string; categoryLabel: string; amount: number; percentOfIncome: number | null };
type FutureBucket = { yearMonth: string; amount: number };

export function CategoryPieChart({ data }: { data: CategorySlice[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-navy-500">Sem gastos neste mês ainda.</p>;
  }

  const total = data.reduce((sum, c) => sum + c.amount, 0);
  const top = data[0]; // já vem ordenado por valor (maior primeiro)

  return (
    <HideableChart>
      <div className="relative">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="categoryLabel"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell key={entry.categoryKey} fill={FALLBACK_COLORS[index % FALLBACK_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={((value: number, _name: unknown, item: { payload?: CategorySlice }) => {
                const pct = item?.payload?.percentOfIncome;
                const label = item?.payload?.categoryLabel ?? "";
                return [`${formatBRL(value)}${pct !== null && pct !== undefined ? ` (${pct}% da renda)` : ""}`, label];
              }) as never}
              {...TOOLTIP_STYLE}
            />
            <Legend verticalAlign="bottom" height={48} wrapperStyle={{ fontSize: 12, color: "#93a0c4" }} />
          </PieChart>
        </ResponsiveContainer>
        {/* Total no centro do donut — resume o gráfico sem precisar passar o
            mouse em cada fatia, e destaca a maior categoria do mês. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[232px] flex-col items-center justify-center">
          <span className="text-xs text-navy-500">Total no mês</span>
          <span className="text-lg font-bold text-navy-100">{formatBRL(total)}</span>
          {top && <span className="mt-0.5 text-[11px] text-navy-500">Maior: {top.categoryLabel}</span>}
        </div>
      </div>
    </HideableChart>
  );
}

export function FutureMonthsBarChart({ data }: { data: FutureBucket[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-navy-500">Nenhuma parcela pendente para os próximos meses.</p>;
  }

  const chartData = data.map((d) => ({ ...d, label: formatYearMonthBR(d.yearMonth) }));

  return (
    <HideableChart>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.15} />
          <XAxis dataKey="label" fontSize={12} tickLine={false} tick={AXIS_TICK} />
          <YAxis fontSize={12} tickLine={false} tickFormatter={(v) => formatBRL(v)} width={80} tick={AXIS_TICK} />
          <Tooltip formatter={((value: number) => formatBRL(value)) as never} {...TOOLTIP_STYLE} />
          <Bar dataKey="amount" fill="#2563eb" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </HideableChart>
  );
}
