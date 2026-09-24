"use client";

// Seletor de mês do painel principal — pedido do Marcelo: poder escolher
// outubro/novembro/etc (até 3 meses à frente do mês atual) e ver o painel
// inteiro (anel de %, gastos, gráfico de categorias...) com as informações
// daquele mês escolhido, não só o mês atual. Um <form method="GET"> simples
// evita precisar de useRouter/useSearchParams — o próprio navegador refaz a
// navegação com o parâmetro "mes" na URL, e a página (Server Component) lê
// esse parâmetro e recalcula tudo no servidor.
export function DashboardMonthSelect({
  options,
  selected,
}: {
  options: { value: string; label: string }[];
  selected: string;
}) {
  return (
    <form method="GET" className="shrink-0">
      <label htmlFor="dashboard-month" className="sr-only">
        Mês do painel
      </label>
      <select
        id="dashboard-month"
        name="mes"
        defaultValue={selected}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border px-3 py-1.5 text-sm font-medium border-navy-700 bg-navy-900 text-navy-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}
