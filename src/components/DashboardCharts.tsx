"use client";

import { useState, type ReactNode } from "react";
import {
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from "recharts";
import { formatBRL, formatPercentBR, formatYearMonthBR } from "@/lib/format";
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
type FutureMonthItem = {
  cardName: string;
  purchaseDescription: string;
  installmentNumber: number;
  installmentsTotal: number;
  amount: number;
};
type FutureBucket = { yearMonth: string; amount: number; items: FutureMonthItem[] };

// Uma cor fixa por posição (mês mais próximo, +1, +2...) — pedido explícito
// do Marcelo pra diferenciar visualmente cada mês no gráfico de parcelas
// futuras, já que antes todas as colunas saíam da mesma cor azul.
const FUTURE_MONTH_COLORS = ["#2563eb", "#f59e0b", "#14b8a6"];

// Rótulo curto para caber embaixo de cada coluna sem sobrepor o vizinho —
// o nome completo continua disponível no tooltip e no painel de detalhe
// abaixo do gráfico ao tocar/clicar numa coluna.
function shortLabel(label: string): string {
  return label.length > 10 ? `${label.slice(0, 9)}…` : label;
}

/**
 * Gráfico de colunas (barras verticais) dos gastos por categoria — pedido
 * explícito do Marcelo pra substituir o donut anterior por um "formato de
 * coluna", mais fácil de comparar categoria a categoria de relance. Cada
 * coluna é clicável/tocável: seleciona a categoria e abre um resumo com o
 * valor exato e o % da renda logo abaixo do gráfico (seção interativa).
 */
export function CategoryBarChart({ data }: { data: CategorySlice[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (data.length === 0) {
    return <p className="text-sm text-navy-500">Sem gastos neste mês ainda.</p>;
  }

  const total = data.reduce((sum, c) => sum + c.amount, 0);
  const top = data[0]; // já vem ordenado por valor (maior primeiro)
  const chartData = data.map((c, index) => ({ ...c, label: shortLabel(c.categoryLabel), color: FALLBACK_COLORS[index % FALLBACK_COLORS.length] }));
  const selected = chartData.find((c) => c.categoryKey === selectedKey) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-xs text-navy-500">Total no mês</span>
          <div className="text-lg font-bold text-navy-100">{formatBRL(total)}</div>
        </div>
        {top && <span className="text-[11px] text-navy-500">Maior: {top.categoryLabel}</span>}
      </div>

      <HideableChart>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 24, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.15} />
            <XAxis dataKey="label" fontSize={11} tickLine={false} tick={AXIS_TICK} interval={0} angle={chartData.length > 5 ? -30 : 0} textAnchor={chartData.length > 5 ? "end" : "middle"} height={chartData.length > 5 ? 46 : 24} />
            <YAxis fontSize={12} tickLine={false} tickFormatter={(v) => formatBRL(v)} width={72} tick={AXIS_TICK} />
            <Tooltip
              cursor={{ fill: "rgba(147,160,196,0.08)" }}
              formatter={((value: number, _name: unknown, item: { payload?: CategorySlice }) => {
                const pct = item?.payload?.percentOfIncome;
                const label = item?.payload?.categoryLabel ?? "";
                return [`${formatBRL(value)}${pct !== null && pct !== undefined ? ` (${formatPercentBR(pct)} da renda)` : ""}`, label];
              }) as never}
              {...TOOLTIP_STYLE}
            />
            <Bar
              dataKey="amount"
              radius={[6, 6, 0, 0]}
              onClick={(entry: unknown) => {
                const key = (entry as { categoryKey?: string })?.categoryKey;
                setSelectedKey((prev) => (prev === key ? null : (key ?? null)));
              }}
              className="cursor-pointer"
              animationDuration={650}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.categoryKey}
                  fill={entry.color}
                  opacity={selectedKey === null || selectedKey === entry.categoryKey ? 1 : 0.35}
                />
              ))}
              <LabelList
                dataKey="amount"
                position="top"
                formatter={((v: number) => formatBRL(v)) as never}
                fontSize={10}
                fill="#93a0c4"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </HideableChart>

      {/* Painel de detalhe da categoria selecionada — some quando nenhuma
          coluna está selecionada, aparece com uma leve animação ao tocar. */}
      {selected && (
        <div className="animate-rise-in flex items-center justify-between rounded-xl px-3 py-2 text-sm bg-navy-800/60" style={{ borderLeft: `3px solid ${selected.color}` }}>
          <span className="font-medium text-navy-200">{selected.categoryLabel}</span>
          <span className="text-navy-300">
            {formatBRL(selected.amount)}
            {selected.percentOfIncome !== null && (
              <span className="ml-1.5 text-xs text-navy-500">({formatPercentBR(selected.percentOfIncome)} da renda)</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Gráfico de "parcelas e contas a vencer" — sempre mostra os 3 meses mais
 * próximos (cada um com uma cor diferente), independente do filtro abaixo.
 * O filtro deixa escolher qualquer mês dentro do horizonte recebido (o
 * painel manda até 10 meses à frente, por causa de compras parceladas
 * longas) e abre um painel com a lista de parcelas + total daquele mês
 * específico, sem alterar as barras do gráfico — comportamento pedido
 * explicitamente pelo Marcelo pra não deixar o gráfico "pulando" de mês.
 */
const FUTURE_ITEMS_INITIAL_COUNT = 5;

export function FutureMonthsBarChart({ data }: { data: FutureBucket[] }) {
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [itemsExpanded, setItemsExpanded] = useState(false);

  const chartMonths = data.slice(0, 3);
  const chartData = chartMonths.map((d, index) => ({
    ...d,
    label: formatYearMonthBR(d.yearMonth),
    color: FUTURE_MONTH_COLORS[index % FUTURE_MONTH_COLORS.length],
  }));
  const selected = data.find((d) => d.yearMonth === selectedMonth) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <HideableChart>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.15} />
            <XAxis dataKey="label" fontSize={12} tickLine={false} tick={AXIS_TICK} />
            <YAxis fontSize={12} tickLine={false} tickFormatter={(v) => formatBRL(v)} width={80} tick={AXIS_TICK} />
            <Tooltip formatter={((value: number) => formatBRL(value)) as never} {...TOOLTIP_STYLE} />
            <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.yearMonth} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </HideableChart>

      <div className="flex items-center gap-2 text-xs">
        <label htmlFor="future-month-filter" className="shrink-0 text-navy-400">
          Ver parcelas de um mês:
        </label>
        <select
          id="future-month-filter"
          value={selectedMonth}
          onChange={(e) => {
            setSelectedMonth(e.target.value);
            setItemsExpanded(false); // troca de mês reseta a lista pro estado recolhido
          }}
          className="w-full rounded-lg border px-2 py-1.5 text-xs border-navy-700 bg-navy-900 text-navy-200"
        >
          <option value="">Escolher mês (até 10 à frente)</option>
          {data.map((d) => (
            <option key={d.yearMonth} value={d.yearMonth}>
              {formatYearMonthBR(d.yearMonth)}
              {d.amount > 0 ? ` — ${formatBRL(d.amount)}` : ""}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="animate-rise-in rounded-xl p-3 bg-navy-800/60">
          <div className="flex items-baseline justify-between">
            <span className="font-medium text-navy-200">{formatYearMonthBR(selected.yearMonth)}</span>
            <span className="font-semibold text-navy-100">{formatBRL(selected.amount)}</span>
          </div>
          {selected.items.length === 0 ? (
            <p className="mt-1 text-xs text-navy-500">Nenhuma parcela prevista para esse mês.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-xs text-navy-300">
              {(itemsExpanded ? selected.items : selected.items.slice(0, FUTURE_ITEMS_INITIAL_COUNT)).map(
                (item, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-2">
                    <span>
                      {item.cardName} · {item.purchaseDescription} ({item.installmentNumber}/{item.installmentsTotal})
                    </span>
                    <span className="shrink-0 font-medium text-navy-200">{formatBRL(item.amount)}</span>
                  </li>
                )
              )}
              {selected.items.length > FUTURE_ITEMS_INITIAL_COUNT && (
                <li>
                  <button
                    type="button"
                    onClick={() => setItemsExpanded((v) => !v)}
                    className="text-[11px] font-medium text-blue-400 hover:underline"
                  >
                    {itemsExpanded
                      ? "Mostrar menos"
                      : `Ver mais ${selected.items.length - FUTURE_ITEMS_INITIAL_COUNT} parcela${
                          selected.items.length - FUTURE_ITEMS_INITIAL_COUNT === 1 ? "" : "s"
                        }`}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
