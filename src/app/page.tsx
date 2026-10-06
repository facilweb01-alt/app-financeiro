import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/dal";
import { LandingPage } from "@/components/landing/LandingPage";
import { CookieBanner, MetaPixel } from "@/components/tracking/MetaPixel";
import { metaPixelId } from "@/lib/metaPixelId";

export const metadata: Metadata = {
  title: "Contay — controle financeiro pelo WhatsApp",
  description:
    "O salário some e você não sabe onde gastou? Mande seus gastos pelo WhatsApp e o Contay organiza tudo: cartões e parcelas, contas fixas, investimentos, gráficos e fechamento do mês. Pix ou cartão, sem fidelidade.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Contay — saiba para onde vai cada real",
    description:
      "Controle financeiro pessoal com lançamento pelo WhatsApp: cartões, parcelas, contas fixas e quanto ainda sobra no mês. Pix ou cartão de crédito, sem fidelidade.",
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
  const pixelId = metaPixelId();
  return (
    <>
      <LandingPage pixelId={pixelId} />
      <MetaPixel pixelId={pixelId} events={[{ name: "ViewContent", params: { content_name: "Página de vendas" } }]} />
      <CookieBanner pixelId={pixelId} />
    </>
  );
}
