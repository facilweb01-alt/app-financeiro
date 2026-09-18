import { redirect } from "next/navigation";
import Link from "next/link";
import { getRawSession } from "@/lib/dal";
import { acceptTerms, logout } from "@/app/actions/auth";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

// Página de "espera" para quem está logado mas ainda não aceitou a versão
// atual dos Termos de Uso / Política de Privacidade — ver
// src/lib/dal.ts#verifySession. Usa getRawSession() (não verifySession())
// de propósito, mesma razão de /conta-pendente: verifySession() mandaria
// de volta pra cá e criaria um loop.
export default async function AceitarTermosPage() {
  const session = await getRawSession();

  if (!session) {
    redirect("/login");
  }
  if (session.status !== "active") {
    redirect("/conta-pendente");
  }
  if (session.termsAcceptedAt !== null && session.termsVersion === CURRENT_TERMS_VERSION) {
    redirect("/dashboard");
  }

  const isUpdate = session.termsAcceptedAt !== null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
          {isUpdate ? "Nossos termos foram atualizados" : "Antes de continuar"}
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          {isUpdate
            ? "Precisamos que você confirme o aceite da versão mais recente dos Termos de Uso e da Política de Privacidade para continuar usando o app."
            : "Para usar o App Financeiro, é preciso aceitar os Termos de Uso e a Política de Privacidade."}
        </p>

        <form action={acceptTerms} className="flex flex-col gap-4">
          <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              name="terms"
              required
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
            />
            <span>
              Li e aceito os{" "}
              <Link href="/termos" target="_blank" className="font-medium text-blue-700 underline dark:text-blue-400">
                Termos de Uso e a Política de Privacidade
              </Link>{" "}
              do App Financeiro. Entendo que meus dados são de acesso restrito — não compartilhados com terceiros e
              acessados pela equipe apenas quando estritamente necessário para operar ou dar suporte ao serviço.
            </span>
          </label>

          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Aceitar e continuar
          </button>
        </form>

        <form action={logout} className="mt-3">
          <button
            type="submit"
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
