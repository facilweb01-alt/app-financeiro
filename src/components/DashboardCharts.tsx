"use client";

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

const FALLBACK_COLORS = ["#6366f1", "#ec4899", "#22c55e", "#f59e0b", "#0ea5e9", "#14b8a6", "#ef4444", "#8b5cf6", "#64748b"];

type CategorySlice = { categoryKey: string; categoryLabel: string; amount: number; percentOfIncome: number | null };
type FutureBucket = { yearMonth: string; amount: number };

export function CategoryPieChart({ data }: { data: CategorySlice[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">Sem gastos neste mês ainda.</p>;
  }

  return (
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
        />
        <Legend verticalAlign="bottom" height={48} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function FutureMonthsBarChart({ data }: { data: FutureBucket[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">Nenhuma parcela pendente para os próximos meses.</p>;
  }

  const chartData = data.map((d) => ({ ...d, label: formatYearMonthBR(d.yearMonth) }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
        <XAxis dataKey="label" fontSize={12} tickLine={false} />
        <YAxis fontSize={12} tickLine={false} tickFormatter={(v) => formatBRL(v)} width={80} />
        <Tooltip formatter={((value: number) => formatBRL(value)) as never} />
        <Bar dataKey="amount" fill="#059669" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
