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
import { formatBRL, formatPercentBR, formatDateBR, formatYearMonthBR } from "@/lib/format";
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
export type MonthCategoryItem = {
  categoryKey: string;
  categoryLabel: string;
  description: string;
  amount: number;
  dueDate: string;
  origin: "lancamento" | "cartao";
};
type FutureMonthItem = {
  cardName: string;
  purchaseDescription: string;
  installmentNumber: number;
  installmentsTotal: number;
  amount: number;
  categoryKey: string;
  categoryLabel: string;
};
type FutureBucket = { yearMonth: string; amount: number; items: FutureMonthItem[] };

// Chip curto indicando de onde veio um lançamento na lista de detalhe —
// mesma cor/estilo usado tanto na busca por categoria (gastos do mês)
// quanto, mais abaixo, como rótulo de categoria no filtro de parcelas
// futuras.
function OriginChip({ origin }: { origin: "lancamento" | "cartao" }) {
  return origin === "cartao" ? (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-violet-950/50 text-violet-300">
      Cartão
    </span>
  ) : (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-sky-950/50 text-sky-300">
      Lançamento
    </span>
  );
}

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

const CATEGORY_ITEMS_INITIAL_COUNT = 5;

/**
 * Gráfico de colunas (barras verticais) dos gastos por categoria — pedido
 * explícito do Marcelo pra substituir o donut anterior por um "formato de
 * coluna", mais fácil de comparar categoria a categoria de relance. Cada
 * coluna é clicável/tocável: seleciona a categoria e abre um resumo com o
 * valor exato e o % da renda logo abaixo do gráfico.
 *
 * Além disso, um campo de busca deixa encontrar a categoria pelo nome (com
 * sugestão nativa via <datalist>) e, ao selecionar uma, mostra a lista de
 * cada lançamento individual que caiu nela naquele mês — misturando compras
 * de cartão e lançamentos do dia a dia, cada um com a origem marcada —
 * pedido do Marcelo: "colocar um filtro para saber os gastos" dentro de
 * cada categoria.
 */
export function CategoryBarChart({ data, items }: { data: CategorySlice[]; items: MonthCategoryItem[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [itemsExpanded, setItemsExpanded] = useState(false);

  if (data.length === 0) {
    return <p className="text-sm text-navy-500">Sem gastos neste mês ainda.</p>;
  }

  const total = data.reduce((sum, c) => sum + c.amount, 0);
  const top = data[0]; // já vem ordenado por valor (maior primeiro)
  const chartData = data.map((c, index) => ({ ...c, label: shortLabel(c.categoryLabel), color: FALLBACK_COLORS[index % FALLBACK_COLORS.length] }));
  const selected = chartData.find((c) => c.categoryKey === selectedKey) ?? null;
  const selectedItems = selected
    ? items
        .filter((i) => i.categoryKey === selected.categoryKey)
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    : [];

  function selectCategory(key: string | null) {
    setSelectedKey(key);
    setItemsExpanded(false);
    const match = chartData.find((c) => c.categoryKey === key);
    setSearch(match ? match.categoryLabel : "");
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (value.trim() === "") {
      setSelectedKey(null);
      setItemsExpanded(false);
      return;
    }
    const match = chartData.find((c) => c.categoryLabel.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      setSelectedKey(match.categoryKey);
      setItemsExpanded(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-xs text-navy-500">Total no mês</span>
          <div className="text-lg font-bold text-navy-100">{formatBRL(total)}</div>
        </div>
        {top && <span className="text-[11px] text-navy-500">Maior: {top.categoryLabel}</span>}
      </div>

      <div>
        <label htmlFor="category-search" className="mb-1 block text-xs text-navy-500">
          Buscar categoria
        </label>
        <input
          id="category-search"
          type="text"
          list="category-search-options"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Digite o nome de uma categoria…"
          className="w-full rounded-lg border px-2.5 py-1.5 text-sm border-navy-700 bg-navy-900 text-navy-200 placeholder:text-navy-600"
        />
        <datalist id="category-search-options">
          {chartData.map((c) => (
            <option key={c.categoryKey} value={c.categoryLabel} />
          ))}
        </datalist>
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
                const key = (entry as { categoryKey?: string })?.categoryKey ?? null;
                selectCategory(selectedKey === key ? null : key);
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

      {/* Painel de detalhe da categoria selecionada (por clique na barra ou
          pela busca) — some quando nenhuma categoria está selecionada. */}
      {selected && (
        <div className="animate-rise-in flex flex-col gap-2">
          <div className="flex items-center justify-between rounded-xl px-3 py-2 text-sm bg-navy-800/60" style={{ borderLeft: `3px solid ${selected.color}` }}>
            <span className="font-medium text-navy-200">{selected.categoryLabel}</span>
            <span className="text-navy-300">
              {formatBRL(selected.amount)}
              {selected.percentOfIncome !== null && (
                <span className="ml-1.5 text-xs text-navy-500">({formatPercentBR(selected.percentOfIncome)} da renda)</span>
              )}
            </span>
          </div>

          {selectedItems.length === 0 ? (
            <p className="text-xs text-navy-500">Nenhum lançamento individual encontrado para essa categoria.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-xs text-navy-300">
              {(itemsExpanded ? selectedItems : selectedItems.slice(0, CATEGORY_ITEMS_INITIAL_COUNT)).map((item, idx) => (
                <li key={idx} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-navy-900/60">
                  <span className="w-16 shrink-0 text-navy-500">{formatDateBR(item.dueDate)}</span>
                  <span className="flex-1 truncate text-navy-200">{item.description}</span>
                  <OriginChip origin={item.origin} />
                  <span className="w-24 shrink-0 text-right font-medium text-navy-200">{formatBRL(item.amount)}</span>
                </li>
              ))}
              {selectedItems.length > CATEGORY_ITEMS_INITIAL_COUNT && (
                <li>
                  <button
                    type="button"
                    onClick={() => setItemsExpanded((v) => !v)}
                    className="text-[11px] font-medium text-blue-400 hover:underline"
                  >
                    {itemsExpanded
                      ? "Mostrar menos"
                      : `Ver mais ${selectedItems.length - CATEGORY_ITEMS_INITIAL_COUNT} lançamento${
                          selectedItems.length - CATEGORY_ITEMS_INITIAL_COUNT === 1 ? "" : "s"
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

/**
 * Gráfico de "parcelas e contas a vencer" — sempre mostra os 3 meses mais
 * próximos (cada um com uma cor diferente), independente do filtro abaixo.
 * O filtro deixa escolher qualquer mês dentro do horizonte recebido (o
 * painel manda até 10 meses à frente, por causa de compras parceladas
 * longas) e abre um painel com a lista de parcelas + total daquele mês
 * específico, sem alterar as barras do gráfico — comportamento pedido
 * explicitamente pelo Marcelo pra não deixar o gráfico "pulando" de mês.
 *
 * Um segundo filtro, por categoria, fica ao lado do filtro de mês — deixa
 * restringir a lista de parcelas/contas do mês escolhido a uma categoria
 * específica, sem tocar no gráfico dos 3 meses (pedido explícito: "colacar
 * mais opções de filtros apenas nas informações", mantendo o gráfico como
 * já estava).
 */
const FUTURE_ITEMS_INITIAL_COUNT = 5;

export function FutureMonthsBarChart({ data }: { data: FutureBucket[] }) {
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [itemsExpanded, setItemsExpanded] = useState(false);

  const chartMonths = data.slice(0, 3);
  const chartData = chartMonths.map((d, index) => ({
    ...d,
    label: formatYearMonthBR(d.yearMonth),
    color: FUTURE_MONTH_COLORS[index % FUTURE_MONTH_COLORS.length],
  }));
  const selected = data.find((d) => d.yearMonth === selectedMonth) ?? null;

  const categoryOptions = selected
    ? Array.from(new Map(selected.items.map((i) => [i.categoryKey, i.categoryLabel])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1])
      )
    : [];
  const filteredItems = selected
    ? categoryFilter === ""
      ? selected.items
      : selected.items.filter((i) => i.categoryKey === categoryFilter)
    : [];
  const filteredTotal = filteredItems.reduce((sum, i) => sum + i.amount, 0);

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

      <div className="text-xs text-navy-400">Ver parcelas de um mês</div>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <div className="flex min-w-[180px] flex-1 flex-col gap-1">
          <label htmlFor="future-month-filter" className="text-navy-400">
            Mês
          </label>
          <select
            id="future-month-filter"
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setCategoryFilter(""); // troca de mês limpa o filtro de categoria também
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

        <div className="flex min-w-[160px] flex-1 flex-col gap-1">
          <label htmlFor="future-category-filter" className="text-navy-400">
            Categoria
          </label>
          <select
            id="future-category-filter"
            value={categoryFilter}
            disabled={!selected || categoryOptions.length === 0}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setItemsExpanded(false);
            }}
            className="w-full rounded-lg border px-2 py-1.5 text-xs border-navy-700 bg-navy-900 text-navy-200 disabled:opacity-50"
          >
            <option value="">Todas as categorias</option>
            {categoryOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selected && (
        <div className="animate-rise-in rounded-xl p-3 bg-navy-800/60">
          <div className="flex items-baseline justify-between">
            <span className="font-medium text-navy-200">{formatYearMonthBR(selected.yearMonth)}</span>
            <span className="font-semibold text-navy-100">{formatBRL(selected.amount)}</span>
          </div>
          {filteredItems.length === 0 ? (
            <p className="mt-1 text-xs text-navy-500">
              {categoryFilter === ""
                ? "Nenhuma parcela prevista para esse mês."
                : "Nenhuma parcela dessa categoria nesse mês."}
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-xs text-navy-300">
              {(itemsExpanded ? filteredItems : filteredItems.slice(0, FUTURE_ITEMS_INITIAL_COUNT)).map(
                (item, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="flex-1 truncate">
                      {item.cardName} · {item.purchaseDescription} ({item.installmentNumber}/{item.installmentsTotal})
                    </span>
                    {categoryFilter === "" && (
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-violet-950/50 text-violet-300">
                        {item.categoryLabel}
                      </span>
                    )}
                    <span className="shrink-0 font-medium text-navy-200">{formatBRL(item.amount)}</span>
                  </li>
                )
              )}
              {filteredItems.length > FUTURE_ITEMS_INITIAL_COUNT && (
                <li>
                  <button
                    type="button"
                    onClick={() => setItemsExpanded((v) => !v)}
                    className="text-[11px] font-medium text-blue-400 hover:underline"
                  >
                    {itemsExpanded
                      ? "Mostrar menos"
                      : `Ver mais ${filteredItems.length - FUTURE_ITEMS_INITIAL_COUNT} parcela${
                          filteredItems.length - FUTURE_ITEMS_INITIAL_COUNT === 1 ? "" : "s"
                        }`}
                  </button>
                </li>
              )}
              {categoryFilter !== "" && (
                <li className="mt-1 flex items-center justify-between border-t border-navy-700/60 pt-2 text-navy-400">
                  <span>Total filtrado</span>
                  <span className="font-semibold text-navy-200">{formatBRL(filteredTotal)}</span>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
