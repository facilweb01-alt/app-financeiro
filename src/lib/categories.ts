// Categorias padrão do sistema (userId = null), criadas uma vez no primeiro
// deploy / seed. O usuário pode criar categorias próprias além destas.
export const DEFAULT_CATEGORIES: { key: string; label: string; color: string }[] = [
  { key: "produto", label: "Produto", color: "#6366f1" },
  { key: "servico", label: "Serviço", color: "#8b5cf6" },
  { key: "lazer", label: "Lazer", color: "#ec4899" },
  { key: "saude", label: "Saúde", color: "#22c55e" },
  { key: "alimentacao", label: "Compra de alimentos", color: "#f59e0b" },
  { key: "compras_pessoais", label: "Compras pessoais", color: "#0ea5e9" },
  { key: "viagem", label: "Viagem", color: "#14b8a6" },
  { key: "gasolina", label: "Gasolina", color: "#ef4444" },
  { key: "outros", label: "Outros", color: "#64748b" },
];

// Paleta usada para sugerir uma cor automaticamente às categorias criadas
// pelo próprio usuário (ele não escolhe a cor no formulário rápido).
export const CUSTOM_CATEGORY_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#22c55e",
  "#f59e0b",
  "#0ea5e9",
  "#14b8a6",
  "#ef4444",
  "#a855f7",
  "#84cc16",
];

/** Gera um "key" estável (slug) a partir do nome digitado pelo usuário. */
export function slugifyCategoryLabel(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "categoria";
}
