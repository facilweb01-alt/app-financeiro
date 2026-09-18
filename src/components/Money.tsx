"use client";

import { formatBRL } from "@/lib/format";
import { useValuesVisibility } from "@/components/ValuesVisibilityProvider";

const MASK = "R$ ••••";

// Mostra um valor em R$ normalmente, ou mascarado quando o usuário ligou o
// modo "ocultar valores" (botão de olho no menu). Usar sempre no lugar de
// chamar formatBRL() direto em JSX, em qualquer tela autenticada.
export function Money({ value, className }: { value: number | string; className?: string }) {
  const { visible } = useValuesVisibility();
  return <span className={className}>{visible ? formatBRL(value) : MASK}</span>;
}
