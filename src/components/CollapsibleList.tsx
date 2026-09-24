"use client";

import { useState, type ReactNode } from "react";

// Pedido do Marcelo: em qualquer lugar que lista lançamentos (compras,
// investimentos, contas fixas, parcelas futuras...), a lista não pode ficar
// "extensa" na tela — precisa ter uma opção de minimizar/expandir. Estes dois
// componentes fazem isso de forma genérica: recebem os itens JÁ RENDERIZADOS
// (um <tr> ou <li> por item, com sua própria key) e só decidem quantos
// mostrar de cara, revelando o resto sob um botão "Ver mais".
//
// Por que receber nós já prontos em vez de um array de dados + render prop:
// isso é usado a partir de Server Components (a página em si), e uma função
// de renderização não pode atravessar a fronteira servidor/cliente — um
// array de elementos React (JSX) pode.

function pluralLabel(count: number, label: string): string {
  return `${label}${count === 1 ? "" : "s"}`;
}

/** Para dentro de <tbody>: o botão "ver mais" vira uma <tr> com colSpan. */
export function CollapsibleRows({
  items,
  initialCount = 6,
  colSpan,
  itemLabel = "item",
}: {
  items: ReactNode[];
  initialCount?: number;
  colSpan: number;
  itemLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, initialCount);
  const hiddenCount = items.length - visible.length;

  return (
    <>
      {visible}
      {items.length > initialCount && (
        <tr>
          <td colSpan={colSpan} className="border-b px-4 py-2 text-center border-navy-800/60">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-medium text-blue-400 hover:underline"
            >
              {expanded ? "Mostrar menos" : `Ver mais ${hiddenCount} ${pluralLabel(hiddenCount, itemLabel)}`}
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

/** Para dentro de <ul>: o botão "ver mais" vira uma <li>. */
export function CollapsibleItems({
  items,
  initialCount = 5,
  itemLabel = "item",
}: {
  items: ReactNode[];
  initialCount?: number;
  itemLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, initialCount);
  const hiddenCount = items.length - visible.length;

  return (
    <>
      {visible}
      {items.length > initialCount && (
        <li>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] font-medium text-blue-400 hover:underline"
          >
            {expanded ? "Mostrar menos" : `Ver mais ${hiddenCount} ${pluralLabel(hiddenCount, itemLabel)}`}
          </button>
        </li>
      )}
    </>
  );
}
