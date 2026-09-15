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
