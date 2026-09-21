"use client";

import { useState } from "react";

type CardOption = { id: string; name: string };

/**
 * Seletor de cartão + botão de download do relatório em PDF — pedido do
 * Marcelo: "no painel principal um opção de gerar PDF... onde vc coloca o
 * nome do cartão cadastrado". O download é um link simples pra rota de API
 * (não precisa de server action, já que é só leitura + geração de arquivo).
 */
export function CardPdfPicker({ cards }: { cards: CardOption[] }) {
  const [selectedCardId, setSelectedCardId] = useState<string>(cards[0]?.id ?? "");

  if (cards.length === 0) {
    return <p className="text-sm text-navy-500">Cadastre um cartão para gerar o relatório em PDF.</p>;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <select
        value={selectedCardId}
        onChange={(e) => setSelectedCardId(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm border-navy-700 bg-navy-900 text-navy-200 sm:max-w-xs"
      >
        {cards.map((card) => (
          <option key={card.id} value={card.id}>
            {card.name}
          </option>
        ))}
      </select>
      <a
        href={`/api/cartoes/pdf?cardId=${encodeURIComponent(selectedCardId)}`}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors bg-blue-600 text-white hover:bg-blue-500"
      >
        📄 Baixar PDF
      </a>
    </div>
  );
}
