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
  const pctColor = over ? "text-red-600" : warning ? "text-amber-600" : "text-slate-500";

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{limit.categoryLabel}</span>
        <form action={deleteSpendingLimit}>
          <input type="hidden" name="id" value={limit.id} />
          <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
            excluir
          </button>
        </form>
      </div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-300">
          <Money value={spent} /> <span className="text-slate-400">de</span> <Money value={monthlyLimit} />
        </span>
        <span className={`font-semibold ${pctColor}`}>{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {over && <p className="mt-1 text-xs font-medium text-red-600">⚠️ Limite ultrapassado</p>}
      {warning && <p className="mt-1 text-xs font-medium text-amber-600">Atenção: perto do limite</p>}
    </div>
  );
}
