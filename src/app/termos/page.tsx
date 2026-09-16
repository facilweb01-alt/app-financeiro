import Link from "next/link";
import { CURRENT_TERMS_VERSION, TERMS_SECTIONS } from "@/lib/terms";

// Página pública (sem exigir login) com o texto completo dos Termos de Uso
// / Política de Privacidade — linkada no checkbox de /registrar e em
// /aceitar-termos. Ver src/lib/terms.ts para o conteúdo e a versão atual.
export const metadata = {
  title: "Termos de Uso e Política de Privacidade — App Financeiro",
};

export default function TermosPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-emerald-700 dark:text-emerald-400">
          ← Voltar
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Termos de Uso e Política de Privacidade
        </h1>
        <p className="mt-1 text-xs text-slate-400">Versão: {CURRENT_TERMS_VERSION}</p>
      </div>

      <div className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        {TERMS_SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="mb-1 font-semibold text-slate-900 dark:text-slate-100">{section.title}</h2>
            <p>{section.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
