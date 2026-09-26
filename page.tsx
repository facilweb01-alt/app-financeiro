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
      <div className="w-full max-w-sm rounded-2xl border p-6 shadow-sm border-navy-800 bg-navy-900">
        <h1 className="mb-1 text-xl font-semibold text-navy-100">
          {isUpdate ? "Nossos termos foram atualizados" : "Antes de continuar"}
        </h1>
        <p className="mb-6 text-sm text-navy-400">
          {isUpdate
            ? "Precisamos que você confirme o aceite da versão mais recente dos Termos de Uso e da Política de Privacidade para continuar usando o app."
            : "Para usar o App Financeiro, é preciso aceitar os Termos de Uso e a Política de Privacidade."}
        </p>

        <form action={acceptTerms} className="flex flex-col gap-4">
          <label className="flex items-start gap-2 text-sm text-navy-300">
            <input
              type="checkbox"
              name="terms"
              required
              className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-navy-700"
            />
            <span>
              Li e aceito os{" "}
              <Link href="/termos" target="_blank" className="font-medium underline text-blue-400">
                Termos de Uso e a Política de Privacidade
              </Link>{" "}
              do App Financeiro. Entendo que meus dados são de acesso restrito — compartilhados apenas com o processador de
              pagamentos (Asaas) para emitir a cobrança, e acessados pela equipe apenas quando estritamente necessário
              para operar ou dar suporte ao serviço.
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
            className="w-full rounded-lg border px-4 py-2 text-sm font-medium transition-colors border-navy-700 text-navy-300 hover:bg-navy-800"
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
