import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/dal";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "App Financeiro — controle financeiro pelo WhatsApp",
  description:
    "Mande seus gastos pelo WhatsApp e veja tudo organizado: categorias, cartões e parcelas, contas fixas, investimentos, gráficos e fechamento do mês. R$ 29,90/mês via Pix.",
  openGraph: {
    title: "App Financeiro — mandou mensagem, tá lançado",
    description: "Controle financeiro pessoal com lançamento pelo WhatsApp. R$ 29,90/mês via Pix, sem fidelidade.",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
    locale: "pt_BR",
    type: "website",
  },
};

// "/" é a página de vendas para quem não está logado; quem já tem sessão vai
// direto para o app.
export default async function RootPage() {
  const session = await getOptionalSession();
  if (session) redirect("/dashboard");
  return <LandingPage />;
}
