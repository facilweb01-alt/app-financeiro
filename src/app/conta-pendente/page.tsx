import { redirect } from "next/navigation";
import { getRawSession } from "@/lib/dal";
import { logout } from "@/app/actions/auth";

// Página de "espera": para onde verifySession() manda quem está logado mas
// com a conta ainda não aprovada ('pending') ou suspensa ('suspended') —
// ver src/lib/dal.ts. Usa getRawSession() (não verifySession()) de
// propósito, porque verifySession() redirecionaria pra cá de novo e criaria
// um loop.
export default async function ContaPendentePage() {
  const session = await getRawSession();

  if (!session) {
    redirect("/login");
  }
  if (session.status === "active") {
    redirect("/dashboard");
  }

  const isSuspended = session.status === "suspended";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border p-6 text-center shadow-sm border-navy-800 bg-navy-900">
        <div className="mb-3 text-3xl" aria-hidden>
          {isSuspended ? "⏸️" : "⏳"}
        </div>
        <h1 className="mb-1 text-xl font-semibold text-navy-100">
          {isSuspended ? "Acesso suspenso" : "Conta aguardando aprovação"}
        </h1>
        <p className="mb-6 text-sm text-navy-400">
          {isSuspended
            ? "O acesso à sua conta foi suspenso. Fale com quem liberou seu acesso para entender o motivo."
            : "Seu cadastro foi recebido. Assim que o acesso for liberado, você poderá entrar normalmente — não precisa fazer nada agora."}
        </p>
        <form action={logout}>
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
