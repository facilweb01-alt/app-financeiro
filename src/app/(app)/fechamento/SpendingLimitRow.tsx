import { deleteSpendingLimit } from "@/app/actions/spendingLimits";
import { Money } from "@/components/Money";

type Limit = {
  id: string;
  categoryId: string;
  categoryKey: string;
  categoryLabel: string;
  categoryColor: string | null;
  monthlyLimit: string;
};

export function SpendingLimitRow({ limit, spent }: { limit: Limit; spent: number }) {
  const monthlyLimit = Number(limit.monthlyLimit);
  const pct = monthlyLimit > 0 ? Math.round((spent / monthlyLimit) * 100) : 0;
  const over = pct >= 100;
  const warning = pct >= 80 && !over;

  const barColor = over ? "bg-red-600" : warning ? "bg-amber-500" : "bg-blue-600";
  const pctColor = over ? "text-red-400" : warning ? "text-amber-400" : "text-navy-400";

  return (
    <div className="rounded-xl border p-3 border-navy-800">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-navy-200">{limit.categoryLabel}</span>
        <form action={deleteSpendingLimit}>
          <input type="hidden" name="id" value={limit.id} />
          <button type="submit" className="text-xs hover:underline text-red-400">
            excluir
          </button>
        </form>
      </div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-navy-300">
          <Money value={spent} /> <span className="text-navy-500">de</span> <Money value={monthlyLimit} />
        </span>
        <span className={`font-semibold ${pctColor}`}>{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-navy-800">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {over && <p className="mt-1 text-xs font-medium text-red-400">⚠️ Limite ultrapassado</p>}
      {warning && <p className="mt-1 text-xs font-medium text-amber-400">Atenção: perto do limite</p>}
    </div>
  );
}
